import { type ToolDefinition } from '@mobile-automation/tool-sdk';

import { keepRecentWithinBudget, toPromptJson, truncateToTokens } from './redaction';
import {
  type PromptMessage,
  emptyTag,
  estimateTokens,
  joinSections,
  numberedList,
  systemMessage,
  tagged,
  userMessage,
} from './template';

/**
 * Building the model's view of the world.
 *
 * The agent's whole competence rests on this. The model cannot see the phone; it sees only what is assembled
 * here, so what is included, what is omitted, and how it is labelled *is* the agent's perception.
 *
 * Assembly is a tested function rather than improvised per call site, because a context that silently loses the
 * current screen produces an agent that confidently acts on a stale one — a failure that looks like a bad model
 * rather than a bug.
 *
 * ## Why the turn is built from XML-style tags
 *
 * Every block the model must treat as **data** is delimited by a tag pair rather than introduced by a markdown
 * heading. The decisive reason is that screen content is arbitrary text from a third-party app: a UI tree
 * containing a text node that reads `## Goal` is indistinguishable from this prompt's own heading, and a model
 * cannot be expected to guess which one is the instruction. `<screen>…</screen>` has an explicit end.
 *
 * It also lets the instructions refer to regions by name — "the hierarchy in `<screen>`" — which is more
 * reliable than a prose reference to a heading, and it keeps metadata in attributes rather than in sentences
 * the model has to parse for a number.
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
 * Structured into tagged sections because the model has to distinguish four different kinds of statement —
 * what it is, how to work, how to see, and when to stop — and a flat list of bullets gives it no way to tell a
 * hard rule from a hint.
 *
 * Every rule exists because its absence produces a specific failure:
 *
 * - "read `<screen>` before acting" — models otherwise tap coordinates from memory of a screen two steps old.
 * - "prefer resourceId" — text selectors break on any localisation or label change.
 * - "wait after an action that loads a screen" — the commonest false "element not found" is looking too early.
 * - "say you are done" — without an explicit terminal signal the loop runs to its step ceiling on every success.
 * - "do not invent an element" — a model that cannot find something will otherwise guess a plausible
 *   resourceId and tap something unintended.
 * - "answer directly when nothing needs doing" — a question about the screen was being turned into a sequence
 *   of actions, because nothing told the model that answering *is* a complete response.
 *
 * The perception chain is stated with its costs, in order. A model told only that OCR exists reaches for it
 * first, because it is the most recently mentioned thing that sounds powerful — so each rung says what it
 * costs and what would justify descending to it.
 */
export const AGENT_SYSTEM_PROMPT = `<role>
You are an automation agent operating a real Android phone that belongs to a real person. You act only by calling the tools you are given. You cannot see the phone except through what you are told in <screen>.
</role>

<how_to_work>
- Read <screen> before acting. Never assume what is on the phone.
- Take one action at a time and check what changed before choosing the next.
- After an action that opens or loads a screen, wait for an element you expect rather than reading immediately.
- If a step fails, read the screen again before deciding what to do. Usually the screen was not what you expected, rather than the action being wrong.
- Never invent an element that is not in <screen>. If what you need is not there, look for it: scroll, search, or go back.
</how_to_work>

<identifying_elements>
Identify a target with a selector, preferring the most durable option available:
1. resourceId — survives layout and language changes.
2. contentDescription — stable and meaningful.
3. text — breaks if the app is translated or the label changes.
4. coordinates — a last resort. Only when nothing above identifies the element.
</identifying_elements>

<seeing_the_screen>
There are three ways to see a screen, in order of cost. Start at the top and only descend when the one above genuinely fails.
1. The element hierarchy in <screen>. Free, already provided, and the only source that gives durable selectors. This is almost always enough.
2. OCR - runOcr to read every line of text with a tappable point, or findTextOnScreen to look for one string. On-device and free, but slower, and it reads pixels: it can misread characters, and it cannot see a control that has no text. Use it when the hierarchy is empty or does not describe what you can plainly see.
3. takeScreenshot, then reasoning about the image. Slowest, and it costs the user money. Only when the first two have both failed on this screen.
Do not skip to OCR or a screenshot because the hierarchy looks unfamiliar. Read it first. If OCR returns an approximate match, check the text it actually read before acting on it.
</seeing_the_screen>

<finishing>
- When the goal is achieved, stop calling tools and say what you did.
- If the goal only asks a question about the phone, answer it. Answering is a complete response; do not invent actions to justify the turn.
- If the goal cannot be achieved, stop and say why. Never guess at a destructive alternative.
</finishing>

<safety>
This is someone's real device, with their messages, contacts, and money on it. Prefer doing nothing to doing the wrong thing. If an action would be hard to undo and you are not certain it is what was asked for, stop and explain instead.
</safety>`;

/**
 * Assembles the agent's turn.
 *
 * Ordered deliberately: the goal first because it is what everything else serves, the current screen last
 * because recency weighs heavily on a model's attention and the screen is what the next decision must be based
 * on.
 */
export const buildAgentContext = (input: AgentContextInput): readonly PromptMessage[] => {
  const budget = input.budget ?? DEFAULT_CONTEXT_BUDGET;

  const goalSection = tagged('goal', input.goal);

  const planSection =
    input.plan !== undefined && input.plan.length > 0
      ? tagged('plan', numberedList([...input.plan]), { note: 'a guide, not a script' })
      : null;

  const memorySection = renderMemory(input.memory, budget.memoryTokens);

  const budgetSection = renderBudget(input.stepsTaken, input.maxSteps);

  const screenSection = renderScreen(input.observation, budget.uiTreeTokens);

  const rejectionSection =
    input.lastRejection != null && input.lastRejection !== ''
      ? tagged('rejected_call', input.lastRejection, { action: 'correct it and try again' })
      : null;

  const toolSection = tagged('tools', renderTools(input.tools));

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

/**
 * The current screen.
 *
 * App and activity are attributes rather than lines of prose, so the model reads them as facts about the block
 * rather than as content within it — and so the tree is the only thing inside `<screen>`, which is what makes
 * the delimiter meaningful.
 */
const renderScreen = (observation: Observation, uiTreeTokens: number): string | null => {
  const tree = truncateToTokens(toPromptJson(observation.uiTree), uiTreeTokens);

  const body = describesNothing(tree)
    ? // Said explicitly rather than left blank. An empty block reads as a missing section and the model
      // guesses; naming the situation is what lets it decide to descend the perception chain instead of
      // acting blind on a screen it cannot see.
      //
      // Names the *next* rung specifically rather than saying "use a fallback", because a model told only that
      // fallbacks exist picks whichever it saw mentioned last - which is how vision gets reached for first.
      'The element hierarchy is empty. This app does not describe its interface. ' +
      'Use runOcr or findTextOnScreen to read what is on screen.'
    : tree;

  return tagged('screen', joinSections(body, screenshotNote(observation)), {
    app: observation.packageName ?? 'unknown',
    activity: observation.activityName,
  });
};

/**
 * Whether a serialized tree carries no information.
 *
 * `null` and `{}` both arrive here as short JSON strings rather than as empty text, which is why this is a
 * check against known-empty renderings rather than a blank test — the first version tested `trim() === ''` and
 * never fired.
 */
const describesNothing = (tree: string): boolean => {
  const trimmed = tree.trim();
  return trimmed === '' || trimmed === 'null' || trimmed === '{}' || trimmed === '[]';
};

const screenshotNote = (observation: Observation): string | null =>
  observation.screenshotPath == null ? null : `<screenshot path="${observation.screenshotPath}" />`;

/**
 * Recent history, dropping the oldest when over budget.
 *
 * The drop is announced. A model shown steps 4-9 with no indication that 1-3 existed may conclude it has only
 * just started and repeat work it already did.
 */
const renderMemory = (memory: readonly MemoryEntry[], memoryTokens: number): string | null => {
  if (memory.length === 0) return null;

  const { kept, droppedCount } = keepRecentWithinBudget(memory, memoryTokens, (entry) =>
    estimateTokens(formatMemoryEntry(entry)),
  );

  return tagged('history', kept.map(formatMemoryEntry).join('\n'), {
    omitted: droppedCount > 0 ? droppedCount : null,
  });
};

/**
 * The step budget, as attributes.
 *
 * A tag rather than a sentence because it is three numbers and a flag, and prose asking a model to compare "step
 * 31 of at most 40" is more work than reading `remaining="9"`.
 */
const renderBudget = (stepsTaken: number, maxSteps: number): string => {
  const remaining = Math.max(maxSteps - stepsTaken, 0);

  return emptyTag('budget', {
    step: stepsTaken + 1,
    max: maxSteps,
    remaining,
    // Only when it is true, so its presence is the signal rather than its value.
    warning: stepsTaken > maxSteps * 0.75 ? 'running short - prioritise finishing' : null,
  });
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
 * The provider's function-calling spec carries the schemas; this restates the descriptions in the prompt
 * because the tool list alone tells a model *what* it can do but not *when* — and choosing a plausible wrong
 * tool is a more common failure than a malformed call.
 */
const renderTools = (tools: readonly ToolDefinition[]): string =>
  tools.map((tool) => `- ${tool.name}: ${tool.description}`).join('\n');
