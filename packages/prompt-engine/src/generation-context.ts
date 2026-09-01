import { toPromptJson, truncateToTokens } from './redaction';
import { type PromptMessage, joinSections, systemMessage, tagged, userMessage } from './template';

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
export const GENERATION_SYSTEM_PROMPT = `<role>
You turn a recording of an automation run into a reusable workflow.
</role>

<input>
You are given the original goal in <goal>, the executed steps in <trace>, the node types you may use in <node_types>, and a JSON Schema in <schema>.
</input>

<output>
Return only a JSON object matching <schema>. No explanation, no markdown fences.
</output>

<how_to_build_it>
- One node per action that changed something: opening an app, tapping, typing, swiping.
- Collapse the steps that only looked at the screen. The recording needed them to decide what to do; the workflow does not need to repeat them.
- Keep waits. A waitForElement step is not an observation — it is what makes the workflow survive a slow load.
- Use the selector recorded for each step, not its coordinates. Coordinates break as soon as the app's layout changes.
- Turn values the user supplied into workflow variables, so the workflow can be reused with different values rather than being hardcoded to this one run.
- Connect the nodes in the order they ran, with one starting point.
- Give each node a short label describing what it does, not which tool it calls.
</how_to_build_it>`;

export const buildGenerationContext = (input: GenerationContextInput): readonly PromptMessage[] => {
  const traceTokens = input.traceTokens ?? 8_000;

  const goalSection = tagged('goal', input.goal);

  const stepsSection = tagged(
    'trace',
    truncateToTokens(input.steps.map(formatStep).join('\n'), traceTokens),
    { steps: input.steps.length },
  );

  const nodeTypesSection = tagged(
    'node_types',
    input.availableNodeTypes.map((node) => `- ${node.type}: ${node.description}`).join('\n'),
  );

  const schemaSection = tagged('schema', toPromptJson(input.workflowJsonSchema, 2));

  const retrySection =
    input.previousAttempt == null
      ? null
      : tagged(
          'rejected_attempt',
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

/**
 * A plan the model produced, for the "Create by AI" entry point and the agent's planning turn.
 *
 * The instruction to keep it short is load-bearing rather than stylistic. A plan is shown to the user as a
 * task list and consulted by the loop as a guide, so a fifteen-step plan for a four-step job produces a card
 * nobody reads and a script the agent visibly abandons. Planning now happens only for goals judged to need it,
 * which makes the ceiling here meaningful: if a plan is being made at all, three to six steps is the shape.
 */
export const buildPlanContext = (input: {
  readonly goal: string;
  readonly availableNodeTypes: readonly { readonly type: string; readonly description: string }[];
}): readonly PromptMessage[] => [
  systemMessage(
    `<role>
You plan automation tasks on an Android phone. Given a goal, list the steps needed.
</role>

<output>
Return only a JSON object of the form { "steps": ["...", "..."] }. No explanation, no markdown fences.
</output>

<rules>
- One action a person would recognise per step: "open WhatsApp", "search for the contact", "type the message".
- As few steps as the goal genuinely needs. Three to six is usual. Never pad a short task to look thorough.
- Do not name tools, and do not invent screen details you cannot know yet — the phone will be read before each step.
- Do not include a step for reporting back. Answering the user happens at the end of every run.
</rules>`,
  ),
  userMessage(
    joinSections(
      tagged('goal', input.goal),
      tagged(
        'available_actions',
        input.availableNodeTypes.map((node) => `- ${node.type}: ${node.description}`).join('\n'),
      ),
    ),
  ),
];
