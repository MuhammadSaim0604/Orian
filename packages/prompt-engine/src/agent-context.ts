import { type ToolDefinition } from '@mobile-automation/tool-sdk';

import { keepRecentWithinBudget, toPromptJson, truncateToTokens } from './redaction';
import {
  type PromptMessage,
  estimateTokens,
  joinSections,
  numberedList,
  section,
  systemMessage,
  userMessage,
} from './template';

/**
 * Building the model's view of the world.
 *
 * The agent's whole competence rests on this. The model cannot see the phone; it sees
 * only what is assembled here, so what is included, what is omitted, and how it is
 * labelled *is* the agent's perception.
 *
 * Assembly is a tested function rather than improvised per call site, because a
 * context that silently loses the current screen produces an agent that confidently
 * acts on a stale one - a failure that looks like a bad model rather than a bug.
 */

/** What the agent can currently see. */
export type Observation = {
  readonly packageName: string | null;
  readonly activityName: string | null;
  /** Serialized UI tree, already compacted by the native layer. */
  readonly uiTree: unknown;
  /**
   * Screenshot reference, never image bytes.
   *
   * Vision is a separate, expensive decision; the tree is the primary perception
   * (ADR 0009) and a path is enough for the model to know an image exists.
   */
  readonly screenshotPath?: string | null;
};

/** A tool the agent ran and what came back. */
export type MemoryEntry = {
  readonly step: number;
  readonly tool: string;
  readonly arguments: Record<string, unknown>;
  readonly outcome: 'succeeded' | 'failed';
  /** One line. Full results live in the trace, not the prompt. */
  readonly summary: string;
  /** Screen after the action, so the model can see what changed. */
  readonly screenAfter?: string | null;
};

export type AgentContextInput = {
  readonly goal: string;
  readonly observation: Observation;
  readonly memory: readonly MemoryEntry[];
  readonly tools: readonly ToolDefinition[];
  /** Steps taken and the ceiling, so the model can prioritise as budget runs low. */
  readonly stepsTaken: number;
  readonly maxSteps: number;
  /** A plan from an earlier turn, if one was made. */
  readonly plan?: readonly string[];
  /** Set after a rejected tool call, so the retry is a correction. */
  readonly lastRejection?: string | null;
  readonly budget?: ContextBudget;
};

/**
 * How the token budget is divided.
 *
 * Explicit numbers rather than "fit what you can", because the parts are not equally
 * important and a naive fill would let one busy screen's tree crowd out the goal. The
 * UI tree gets the largest share since it is the perception; memory gets less because
 * a summary of step 3 is far less useful than the current screen.
 */
export type ContextBudget = {
  readonly uiTreeTokens: number;
  readonly memoryTokens: number;
  readonly totalTokens: number;
};

export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  uiTreeTokens: 6_000,
  memoryTokens: 2_000,
  totalTokens: 12_000,
};

/**
 * The agent's system instructions.
 *
 * Every rule here exists because its absence produces a specific failure:
 *
 * - "read the screen before acting" - models otherwise tap coordinates from memory of
 *   a screen two steps old.
 * - "prefer resourceId" - text selectors break on any localisation or label change.
 * - "wait after an action that loads a screen" - the commonest false "element not
 *   found" is simply looking too early.
 * - "say done when finished" - without an explicit terminal signal the loop runs to
 *   its step ceiling on every success.
 * - "do not invent an element" - a model that cannot find something will otherwise
 *   guess a plausible resourceId, and tap something unintended.
 */
export const AGENT_SYSTEM_PROMPT = `You are an automation agent operating a real Android phone belonging to a real person. You act only by calling the tools provided.

How to work:
- Read the screen before acting. Do not assume what is on it.
- After any action that opens or loads a screen, wait for an element you expect rather than reading immediately.
- Identify elements with a selector, preferring resourceId, then contentDescription, then text. Use coordinates only when nothing else identifies the element.
- Take one step at a time and check the result before continuing.
- If a step fails, read the screen again before deciding what to do. The screen is often not what you expected rather than the action being wrong.
- Never invent an element that is not in the screen you were given. If you cannot find what you need, look for it - scroll, search, or go back.
- When the goal is achieved, say so and stop. Do not keep acting.
- If the goal cannot be achieved, say why. Do not guess at destructive alternatives.

You are acting on someone's real device. Prefer doing nothing to doing the wrong thing.`;

/**
 * Assembles the agent's turn.
 *
 * Ordered deliberately: the goal first because it is what everything else serves, the
 * current screen last because recency weighs heavily on a model's attention and the
 * screen is what the next decision must be based on.
 */
export const buildAgentContext = (input: AgentContextInput): readonly PromptMessage[] => {
  const budget = input.budget ?? DEFAULT_CONTEXT_BUDGET;

  const goalSection = section('Goal', input.goal);

  const planSection =
    input.plan !== undefined && input.plan.length > 0
      ? section('Your plan', numberedList([...input.plan]))
      : null;

  const memorySection = renderMemory(input.memory, budget.memoryTokens);

  const budgetSection = section(
    'Budget',
    `Step ${input.stepsTaken + 1} of at most ${input.maxSteps}.` +
      (input.stepsTaken > input.maxSteps * 0.75
        ? ' You are running short of steps - prioritise finishing the goal.'
        : ''),
  );

  const screenSection = renderScreen(input.observation, budget.uiTreeTokens);

  const rejectionSection =
    input.lastRejection != null && input.lastRejection !== ''
      ? section('Your last tool call was rejected', `${input.lastRejection}`)
      : null;

  const toolSection = section('Available tools', renderTools(input.tools));

  return [
    systemMessage(AGENT_SYSTEM_PROMPT),
    userMessage(
      joinSections(
        goalSection,
        planSection,
        toolSection,
        memorySection,
        budgetSection,
        rejectionSection,
        screenSection,
      ),
    ),
  ];
};

/** Renders the current screen, with the tree trimmed to its share of the budget. */
const renderScreen = (observation: Observation, uiTreeTokens: number): string | null => {
  const where =
    observation.packageName == null
      ? 'Unknown app.'
      : `App: ${observation.packageName}` +
        (observation.activityName == null ? '' : `\nScreen: ${observation.activityName}`);

  const tree = truncateToTokens(toPromptJson(observation.uiTree), uiTreeTokens);

  const screenshot =
    observation.screenshotPath == null
      ? null
      : `A screenshot of this screen is available at ${observation.screenshotPath}.`;

  return section('Current screen', joinSections(where, screenshot, tree));
};

/**
 * Renders recent history, dropping the oldest when over budget.
 *
 * The drop is announced. A model shown steps 4-9 with no indication that 1-3 existed
 * may conclude it has only just started and repeat work it already did.
 */
const renderMemory = (memory: readonly MemoryEntry[], memoryTokens: number): string | null => {
  if (memory.length === 0) return null;

  const { kept, droppedCount } = keepRecentWithinBudget(memory, memoryTokens, (entry) =>
    estimateTokens(formatMemoryEntry(entry)),
  );

  const lines = kept.map(formatMemoryEntry);

  const preamble =
    droppedCount > 0
      ? `(${droppedCount} earlier step${droppedCount === 1 ? '' : 's'} omitted for brevity)`
      : null;

  return section('What you have done so far', joinSections(preamble, lines.join('\n')));
};

const formatMemoryEntry = (entry: MemoryEntry): string => {
  const marker = entry.outcome === 'succeeded' ? 'ok' : 'FAILED';
  const args = toPromptJson(entry.arguments);
  const after = entry.screenAfter == null ? '' : ` (now on ${entry.screenAfter})`;

  return `${entry.step}. ${entry.tool}(${args}) - ${marker}: ${entry.summary}${after}`;
};

/**
 * Lists the tools in prose.
 *
 * The provider's function-calling spec carries the schemas; this restates the
 * descriptions in the prompt because the tool list alone tells a model *what* it can
 * do but not *when* - and choosing a plausible wrong tool is a more common failure
 * than a malformed call.
 */
const renderTools = (tools: readonly ToolDefinition[]): string =>
  tools.map((tool) => `- ${tool.name}: ${tool.description}`).join('\n');
