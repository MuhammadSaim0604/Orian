import { type Observation } from '@mobile-automation/prompt-engine';
import { type ToolName, type ValidatedToolCall } from '@mobile-automation/tool-sdk';

/**
 * Events the agent emits as it runs.
 *
 * Two consumers with different needs, served by one stream. The **UI** needs to show a
 * user what their phone is doing right now, because watching an agent act on your own
 * device without narration is alarming. The **recorder** (Phase 9) needs enough per
 * tool execution to compile the run into a replayable workflow.
 *
 * The recorder's requirements are built in now, while the loop is being written. Phase 9
 * would otherwise have to reopen the loop to add capture points, and a seam retrofitted
 * into a working loop tends to miss the case that matters - the failed step that
 * explains why the next one looks odd.
 */

export const AGENT_EVENT_TYPES = [
  'runStarted',
  'planned',
  'observed',
  'toolCallProposed',
  'toolCallRejected',
  'toolExecuted',
  'replanning',
  'runFinished',
  'thinking',
] as const;

export type AgentEventType = (typeof AGENT_EVENT_TYPES)[number];

type BaseEvent = {
  readonly runId: string;
  readonly timestampEpochMs: number;
};

export type RunStartedEvent = BaseEvent & {
  readonly type: 'runStarted';
  readonly goal: string;
  readonly maxSteps: number;
  readonly model: string;
};

export type PlannedEvent = BaseEvent & {
  readonly type: 'planned';
  readonly steps: readonly string[];
  /** True when this replaced an earlier plan, so the UI can say "new plan". */
  readonly isReplan: boolean;
};

export type ObservedEvent = BaseEvent & {
  readonly type: 'observed';
  readonly packageName: string | null;
  readonly activityName: string | null;
  readonly elementCount: number;
  readonly screenshotPath: string | null;
};

export type ToolCallProposedEvent = BaseEvent & {
  readonly type: 'toolCallProposed';
  readonly step: number;
  readonly tool: string;
  readonly arguments: Record<string, unknown>;
};

export type ToolCallRejectedEvent = BaseEvent & {
  readonly type: 'toolCallRejected';
  readonly step: number;
  readonly tool: string;
  readonly reason: string;
  /** The correction fed back to the model, so a trace shows what it was told. */
  readonly correction: string;
};

/**
 * A tool ran. **This is the recorder seam.**
 *
 * Carries everything `ExecutionStep` in `architecture/Data_Models.md` requires, which
 * is why it is the richest event by some margin. The selector and the resolved element
 * are the point: a trace of coordinates compiles into a workflow that breaks on the
 * next app update, while a trace carrying the element that actually matched compiles
 * into one that survives (ADR 0009).
 */
export type ToolExecutedEvent = BaseEvent & {
  readonly type: 'toolExecuted';
  readonly step: number;
  readonly tool: ToolName;
  readonly arguments: Record<string, unknown>;
  readonly outcome: 'succeeded' | 'failed';
  readonly durationMs: number;

  /** Screen identity before the action, since afterwards it may have changed. */
  readonly packageName: string | null;
  readonly activityName: string | null;

  /** UI tree as it was before the action. Held by reference, not copied into logs. */
  readonly uiTreeBefore: unknown;
  readonly screenshotPathBefore: string | null;

  /**
   * What the selector actually resolved to, when the tool targeted an element.
   *
   * The single most valuable field for generation: it is what lets a tap the model
   * expressed loosely become a durable workflow step.
   */
  readonly resolvedElement?: unknown;
  /** Which strategy matched - resourceId, text, coordinates - for durability scoring. */
  readonly matchedBy?: string | null;

  /** The tool's return value, or the failure. */
  readonly result?: unknown;
  readonly error?: string;
  readonly errorCode?: string;

  /** Screen identity after the action, so a trace shows what each step changed. */
  readonly screenAfter?: string | null;
};

export type ReplanningEvent = BaseEvent & {
  readonly type: 'replanning';
  readonly reason: string;
  readonly stepsTaken: number;
};

export const RUN_OUTCOMES = ['succeeded', 'failed', 'cancelled', 'exhausted'] as const;

export type RunOutcome = (typeof RUN_OUTCOMES)[number];

export type RunFinishedEvent = BaseEvent & {
  readonly type: 'runFinished';
  readonly outcome: RunOutcome;
  readonly stepsTaken: number;
  readonly durationMs: number;
  /** The model's own account of what it did or why it stopped. */
  readonly summary: string;
  readonly error?: string;
};

/** The model's prose while deciding, shown in the UI so a pause is explained. */
export type ThinkingEvent = BaseEvent & {
  readonly type: 'thinking';
  readonly step: number;
  readonly content: string;
};

export type AgentEvent =
  | RunStartedEvent
  | PlannedEvent
  | ObservedEvent
  | ToolCallProposedEvent
  | ToolCallRejectedEvent
  | ToolExecutedEvent
  | ReplanningEvent
  | RunFinishedEvent
  | ThinkingEvent;

export type AgentEventListener = (event: AgentEvent) => void;

/**
 * Fans events out to listeners.
 *
 * A listener that throws must not break the run. The agent is mid-way through operating
 * someone's phone; abandoning that because a log view has a bug would leave the device
 * in a half-finished state.
 */
export class AgentEventBus {
  private readonly listeners = new Set<AgentEventListener>();

  subscribe(listener: AgentEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Deliberately ignored - see the class comment.
      }
    }
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

/**
 * Builds a `toolExecuted` event from what the loop knows.
 *
 * A helper rather than assembled inline, because it is assembled at two call sites -
 * success and failure - and the recorder depends on both carrying the same fields. A
 * failed step with no UI tree would be the one a person most wants to look at.
 */
export const toolExecutedEvent = (input: {
  readonly runId: string;
  readonly step: number;
  readonly call: ValidatedToolCall;
  readonly observationBefore: Observation | null;
  readonly durationMs: number;
  readonly outcome: 'succeeded' | 'failed';
  readonly result?: unknown;
  readonly error?: string;
  readonly errorCode?: string;
  readonly screenAfter?: string | null;
}): ToolExecutedEvent => {
  const resolved = extractResolvedElement(input.result);

  return {
    type: 'toolExecuted',
    runId: input.runId,
    timestampEpochMs: Date.now(),
    step: input.step,
    tool: input.call.name,
    arguments: input.call.arguments,
    outcome: input.outcome,
    durationMs: input.durationMs,
    packageName: input.observationBefore?.packageName ?? null,
    activityName: input.observationBefore?.activityName ?? null,
    uiTreeBefore: input.observationBefore?.uiTree ?? null,
    screenshotPathBefore: input.observationBefore?.screenshotPath ?? null,
    resolvedElement: resolved.element,
    matchedBy: resolved.strategy,
    result: input.result,
    error: input.error,
    errorCode: input.errorCode,
    screenAfter: input.screenAfter,
  };
};

/**
 * Pulls the resolved element out of a tool result.
 *
 * `findElement` and `waitForElement` return one; most tools do not. Reading it here
 * rather than in the recorder means the loop does not have to know which tools resolve
 * elements, and a new tool that returns one is picked up automatically.
 */
const extractResolvedElement = (result: unknown): { element: unknown; strategy: string | null } => {
  if (result === null || typeof result !== 'object') return { element: undefined, strategy: null };

  const candidate = result as { strategy?: unknown; resourceId?: unknown; text?: unknown };

  // A result carrying a strategy is a resolved element by definition, since that field
  // only exists on the resolver's output.
  if (typeof candidate.strategy === 'string') {
    return { element: result, strategy: candidate.strategy };
  }

  return { element: undefined, strategy: null };
};
