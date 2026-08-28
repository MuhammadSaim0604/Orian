import {
  type ExecutionStep,
  type ExecutionTrace,
  type ScreenIdentity,
  type TraceOutcome,
} from './schema';

/**
 * The recorder.
 *
 * Consumes the agent's event stream and produces a trace. It deliberately owns no
 * capture logic of its own: `toolExecuted` was built in Phase 7 carrying everything an
 * `ExecutionStep` needs, so the recorder's job is shaping and trimming, not collection.
 * Adding capture points here would mean two places that decide what a step is.
 *
 * The one substantive thing it does is **trim results**. A `getUiTree` result is tens of
 * thousands of characters, and a trace of twenty steps that each stored one would be
 * megabytes of duplicated screen data. The tree is already kept once per step as
 * `uiTreeBefore`; keeping it again as a result would be storing the same thing twice.
 */

/** The subset of the agent's `toolExecuted` event the recorder needs. */
export type ToolExecutedLike = {
  readonly runId: string;
  readonly step: number;
  readonly tool: string;
  readonly arguments: Record<string, unknown>;
  readonly outcome: 'succeeded' | 'failed';
  readonly durationMs: number;
  readonly packageName: string | null;
  readonly activityName: string | null;
  readonly uiTreeBefore?: unknown;
  readonly screenshotPathBefore?: string | null;
  readonly resolvedElement?: unknown;
  readonly matchedBy?: string | null;
  readonly result?: unknown;
  readonly error?: string;
  readonly errorCode?: string;
  readonly screenAfter?: string | null;
  readonly timestampEpochMs: number;
};

/** Enough of `runStarted` to open a trace. */
export type RunStartedLike = {
  readonly runId: string;
  readonly goal: string;
  readonly model?: string;
  readonly timestampEpochMs: number;
};

/** Enough of `runFinished` to close one. */
export type RunFinishedLike = {
  readonly outcome: TraceOutcome;
  readonly summary?: string;
  readonly timestampEpochMs: number;
};

/**
 * How much of a tool result to keep.
 *
 * Generous enough for a contact list or a found element, small enough that a serialized
 * UI tree cannot smuggle itself in. The full tree is already stored once per step.
 */
export const MAX_RESULT_CHARS = 2_000;

/**
 * Cap on retained steps.
 *
 * A runaway agent is bounded at 40 steps, so this is well clear of any real run. It exists
 * because a trace is written to a database row, and an unbounded one would eventually fail
 * to write at all - losing the whole trace rather than the tail of it.
 */
export const MAX_TRACE_STEPS = 200;

export class ExecutionRecorder {
  private trace: {
    id: string;
    runId: string;
    goal: string;
    model?: string;
    startedAtEpochMs: number;
    steps: ExecutionStep[];
  } | null = null;

  private finished: ExecutionTrace | null = null;

  /** Opens a trace. Called from the agent's `runStarted`. */
  start(event: RunStartedLike): void {
    this.trace = {
      id: `trace_${event.runId}`,
      runId: event.runId,
      goal: event.goal,
      model: event.model,
      startedAtEpochMs: event.timestampEpochMs,
      steps: [],
    };

    this.finished = null;
  }

  /**
   * Records one executed tool.
   *
   * Ignored when no trace is open rather than throwing. A recorder attached mid-run would
   * otherwise crash the agent, and losing a partial recording is far better than
   * abandoning a run that is driving someone's phone.
   */
  record(event: ToolExecutedLike): void {
    if (this.trace === null) return;
    if (this.trace.steps.length >= MAX_TRACE_STEPS) return;

    this.trace.steps.push({
      // Numbered by position in the trace rather than by the agent's step number, so the
      // indices stay contiguous even if an event were ever dropped.
      index: this.trace.steps.length + 1,
      tool: event.tool,
      arguments: event.arguments,
      screen: {
        packageName: event.packageName,
        activityName: event.activityName,
      },
      uiTreeBefore: event.uiTreeBefore,
      screenshotPath: event.screenshotPathBefore ?? null,
      resolvedElement: asResolvedElement(event.resolvedElement),
      matchedBy: event.matchedBy ?? null,
      outcome: event.outcome,
      result: trimResult(event.result),
      error: event.error,
      errorCode: event.errorCode,
      screenAfter: event.screenAfter ?? null,
      timestampEpochMs: event.timestampEpochMs,
      durationMs: event.durationMs,
    });
  }

  /** Closes the trace and returns it. Called from the agent's `runFinished`. */
  finish(event: RunFinishedLike): ExecutionTrace | null {
    if (this.trace === null) return null;

    this.finished = {
      id: this.trace.id,
      runId: this.trace.runId,
      goal: this.trace.goal,
      outcome: event.outcome,
      summary: event.summary,
      steps: this.trace.steps,
      startedAtEpochMs: this.trace.startedAtEpochMs,
      finishedAtEpochMs: event.timestampEpochMs,
      model: this.trace.model,
    };

    this.trace = null;
    return this.finished;
  }

  /** The completed trace, or null if the run is still going or never started. */
  get result(): ExecutionTrace | null {
    return this.finished;
  }

  /** Steps recorded so far, for a live view during a run. */
  get steps(): readonly ExecutionStep[] {
    return this.trace?.steps ?? this.finished?.steps ?? [];
  }

  get isRecording(): boolean {
    return this.trace !== null;
  }

  reset(): void {
    this.trace = null;
    this.finished = null;
  }
}

/**
 * Keeps a result small.
 *
 * Objects are serialized and truncated rather than dropped, because a partial result still
 * tells a reader what the step returned - and the review screen shows it. Dropping it
 * entirely would leave a step looking like it did nothing.
 */
const trimResult = (result: unknown): unknown => {
  if (result === null || result === undefined) return undefined;

  if (typeof result === 'string') {
    return result.length <= MAX_RESULT_CHARS ? result : `${result.slice(0, MAX_RESULT_CHARS)}…`;
  }

  if (typeof result !== 'object') return result;

  const serialized = JSON.stringify(result);

  if (serialized === undefined) return undefined;
  if (serialized.length <= MAX_RESULT_CHARS) return result;

  return { truncated: true, preview: `${serialized.slice(0, MAX_RESULT_CHARS)}…` };
};

/**
 * Reads the resolver's output into the recorded shape.
 *
 * Tolerant, because tools return different things and only some return an element. A strict
 * reader would drop the field that makes generation durable.
 */
const asResolvedElement = (value: unknown): ExecutionStep['resolvedElement'] => {
  if (value === null || typeof value !== 'object') return undefined;

  const candidate = value as Record<string, unknown>;

  const element: Record<string, unknown> = {};

  for (const key of [
    'resourceId',
    'text',
    'contentDescription',
    'className',
    'strategy',
  ] as const) {
    if (typeof candidate[key] === 'string') element[key] = candidate[key];
  }

  for (const key of ['clickable', 'editable'] as const) {
    if (typeof candidate[key] === 'boolean') element[key] = candidate[key];
  }

  const bounds = readBounds(candidate);
  if (bounds !== undefined) element.bounds = bounds;

  return Object.keys(element).length === 0
    ? undefined
    : (element as ExecutionStep['resolvedElement']);
};

/**
 * Reads bounds from the resolver's output.
 *
 * Kept because bounds allow a relative-position selector and their centre is the
 * coordinate fallback - the two weakest links in the chain, but the ones that make a
 * selector resolvable at all when nothing else matches (ADR 0009).
 */
type RecordedBounds = { left: number; top: number; right: number; bottom: number };

const readBounds = (candidate: Record<string, unknown>): RecordedBounds | undefined => {
  const bounds = candidate.bounds as Record<string, unknown> | undefined;

  if (
    bounds === undefined ||
    typeof bounds.left !== 'number' ||
    typeof bounds.top !== 'number' ||
    typeof bounds.right !== 'number' ||
    typeof bounds.bottom !== 'number'
  ) {
    return undefined;
  }

  return {
    left: Math.round(bounds.left),
    top: Math.round(bounds.top),
    right: Math.round(bounds.right),
    bottom: Math.round(bounds.bottom),
  };
};

/** A one-line description of a screen, for the review UI. */
export const describeScreenIdentity = (screen: ScreenIdentity): string => {
  if (screen.packageName === null) return 'Unknown screen';

  return screen.activityName === null
    ? screen.packageName
    : `${screen.packageName}/${shortActivity(screen.activityName)}`;
};

const shortActivity = (activityName: string): string => {
  const lastDot = activityName.lastIndexOf('.');
  return lastDot === -1 ? activityName : activityName.slice(lastDot + 1);
};
