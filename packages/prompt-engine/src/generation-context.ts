import { toPromptJson, truncateToTokens } from './redaction';
import {
  type PromptMessage,
  joinSections,
  numberedList,
  section,
  systemMessage,
  userMessage,
} from './template';

/**
 * Context for turning an execution trace into a workflow (Phase 9).
 *
 * Built now because the shape of what the recorder must capture is decided by what this
 * prompt needs. Discovering in Phase 9 that the trace lacks a field the generator
 * requires would mean re-running every recording.
 *
 * The whole value of generation is producing something **durable**. A trace is full of
 * coordinates because that is where taps landed; a workflow built from those
 * coordinates breaks on the next app update. So the instructions are mostly about
 * preferring the selector the recorder captured alongside each tap.
 */

/** One recorded step, as the generator sees it. */
export type TraceStepSummary = {
  readonly index: number;
  readonly tool: string;
  readonly arguments: Record<string, unknown>;
  readonly packageName: string | null;
  readonly activityName: string | null;
  readonly outcome: 'succeeded' | 'failed';
  /**
   * The selector that actually resolved, and by which strategy.
   *
   * The most important field in the trace: it is the difference between a workflow
   * that replays and one that taps empty space.
   */
  readonly resolvedSelector?: unknown;
  readonly matchedBy?: string | null;
};

export type GenerationContextInput = {
  readonly goal: string;
  readonly steps: readonly TraceStepSummary[];
  /** JSON Schema for a workflow document, so the output is applicable as-is. */
  readonly workflowJsonSchema: Record<string, unknown>;
  /** Node types available to build from. */
  readonly availableNodeTypes: readonly { readonly type: string; readonly description: string }[];
  readonly traceTokens?: number;
  readonly previousAttempt?: { readonly output: string; readonly error: string } | null;
};

/**
 * Instructions for compiling a trace into a workflow.
 *
 * Two rules carry most of the value:
 *
 * - **Collapse observation steps.** A trace is dense with `getUiTree` and `findElement`
 *   calls the agent needed in order to decide, but which a workflow does not need to
 *   repeat. Left in, they triple the node count and make the canvas unreadable.
 * - **Keep the waits.** `waitForElement` looks like an observation but is load-bearing:
 *   removing it produces a workflow that works when replayed slowly and fails on a cold
 *   start, which is the worst kind of intermittent.
 */
export const GENERATION_SYSTEM_PROMPT = `You turn a recording of an automation run into a reusable workflow.

You will be given the original goal, the steps that were executed, the node types available, and a JSON Schema for a workflow.

Return only a JSON object matching that schema. No explanation, no markdown fences.

How to build it:
- One node per action that changed something: opening an app, tapping, typing, swiping.
- Collapse the steps that only looked at the screen. The recording needed them to decide what to do; the workflow does not need to repeat them.
- Keep waits. A waitForElement step is not an observation - it is what makes the workflow survive a slow load.
- Use the selector recorded for each step, not its coordinates. Coordinates break as soon as the app's layout changes.
- Turn values the user supplied into workflow variables, so the workflow can be reused with different values rather than being hardcoded to this one run.
- Connect the nodes in the order they ran, with one starting point.
- Give each node a short label describing what it does, not which tool it calls.`;

export const buildGenerationContext = (input: GenerationContextInput): readonly PromptMessage[] => {
  const traceTokens = input.traceTokens ?? 8_000;

  const goalSection = section('What the run was trying to do', input.goal);

  const stepsSection = section(
    'What was executed',
    truncateToTokens(input.steps.map(formatStep).join('\n'), traceTokens),
  );

  const nodeTypesSection = section(
    'Node types you can use',
    input.availableNodeTypes.map((node) => `- ${node.type}: ${node.description}`).join('\n'),
  );

  const schemaSection = section('Workflow schema', toPromptJson(input.workflowJsonSchema, 2));

  const retrySection =
    input.previousAttempt == null
      ? null
      : section(
          'Your previous attempt was rejected',
          joinSections(
            input.previousAttempt.output,
            `Problem: ${input.previousAttempt.error}`,
            'Return a corrected JSON object.',
          ),
        );

  return [
    systemMessage(GENERATION_SYSTEM_PROMPT),
    userMessage(
      joinSections(goalSection, nodeTypesSection, schemaSection, retrySection, stepsSection),
    ),
  ];
};

/**
 * Renders one step.
 *
 * The resolved selector and the strategy that matched are stated separately from the
 * arguments, because the model must be able to see that a tap the agent made by
 * coordinates nonetheless resolved to an element with a resourceId - which is exactly
 * the substitution that makes the generated workflow durable.
 */
const formatStep = (step: TraceStepSummary): string => {
  const where = step.packageName == null ? '' : ` on ${step.packageName}${step.activityName ?? ''}`;

  const marker = step.outcome === 'succeeded' ? '' : ' [failed]';

  const selector =
    step.resolvedSelector === undefined
      ? ''
      : `\n   resolved to ${toPromptJson(step.resolvedSelector)}` +
        (step.matchedBy == null ? '' : ` by ${step.matchedBy}`);

  return `${step.index}. ${step.tool}(${toPromptJson(step.arguments)})${where}${marker}${selector}`;
};

/** A plan the model produced, for the "Create by AI" entry point. */
export const buildPlanContext = (input: {
  readonly goal: string;
  readonly availableNodeTypes: readonly { readonly type: string; readonly description: string }[];
}): readonly PromptMessage[] => [
  systemMessage(
    `You plan mobile automation tasks. Given a goal, list the steps needed on an Android phone.

Return only a JSON object of the form { "steps": ["...", "..."] }. No explanation.

Keep each step to one action a person would recognise - "open WhatsApp", "search for the contact", "type the message". Do not name tools or invent screen details you cannot know yet.`,
  ),
  userMessage(
    joinSections(
      section('Goal', input.goal),
      section(
        'Actions available on the device',
        input.availableNodeTypes.map((node) => `- ${node.type}: ${node.description}`).join('\n'),
      ),
      numberedList([]),
    ),
  ),
];
