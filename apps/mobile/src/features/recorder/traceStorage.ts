import { type ExecutionTrace, ExecutionTraceSchema } from '@mobile-automation/execution-recorder';
import { NativeModules } from 'react-native';

/**
 * Trace persistence, over the native Room module (ADR 0005).
 *
 * Same shape as workflow storage and for the same reason: the document crosses as a JSON
 * string and is **validated on the way in**. A trace read back from an older version of the
 * app, or from a restored backup, could be anything - and generating a workflow from a
 * half-understood trace would produce something that looks authoritative and is wrong.
 *
 * Screenshots are files. This layer only ever handles their paths.
 */

type TraceStorageNative = {
  listTraces: () => Promise<
    {
      id: string;
      goal: string;
      outcome: string;
      stepCount: number;
      recordedAtEpochMs: number;
    }[]
  >;
  loadTrace: (id: string) => Promise<string | null>;
  saveTrace: (
    id: string,
    runId: string,
    goal: string,
    outcome: string,
    stepCount: number,
    document: string,
  ) => Promise<void>;
  removeTrace: (id: string) => Promise<void>;
  traceScreenshotDirectory: (id: string) => Promise<string>;
  traceStorageUsed: () => Promise<number>;
};

const native = (NativeModules as { WorkflowStorage?: TraceStorageNative }).WorkflowStorage;

export const isTraceStorageAvailable = (): boolean => native !== undefined;

export type TraceSummary = {
  readonly id: string;
  readonly goal: string;
  readonly outcome: string;
  readonly stepCount: number;
  readonly recordedAtEpochMs: number;
};

/** Recorded runs, newest first. Never reads a document. */
export const listTraces = async (): Promise<readonly TraceSummary[]> => {
  if (native === undefined) return [];
  return native.listTraces();
};

export type LoadTraceResult =
  | { readonly ok: true; readonly trace: ExecutionTrace }
  | { readonly ok: false; readonly reason: 'not-found' | 'invalid'; readonly detail?: string };

/**
 * Loads and validates a trace.
 *
 * "Not found" and "invalid" stay apart because they are different situations: one means the
 * recording is gone, the other that it exists but cannot be read - and only the second is a
 * fault worth reporting.
 */
export const loadTrace = async (id: string): Promise<LoadTraceResult> => {
  if (native === undefined) return { ok: false, reason: 'not-found' };

  const document = await native.loadTrace(id);
  if (document === null) return { ok: false, reason: 'not-found' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(document);
  } catch {
    return { ok: false, reason: 'invalid', detail: 'The saved recording is not readable.' };
  }

  const result = ExecutionTraceSchema.safeParse(parsed);

  if (!result.success) {
    return {
      ok: false,
      reason: 'invalid',
      detail: result.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; '),
    };
  }

  return { ok: true, trace: result.data };
};

/**
 * Saves a trace.
 *
 * Fire-and-forget from the caller's point of view, but it reports failure: a user who watched
 * a run happen and then found no recording of it would reasonably assume the feature is
 * broken.
 */
export const saveTrace = async (trace: ExecutionTrace): Promise<boolean> => {
  if (native === undefined) return false;

  await native.saveTrace(
    trace.id,
    trace.runId,
    trace.goal,
    trace.outcome,
    trace.steps.length,
    JSON.stringify(trace),
  );

  return true;
};

export const deleteTrace = async (id: string): Promise<void> => {
  await native?.removeTrace(id);
};

/** Where this trace's screenshots belong, for the recorder to write into. */
export const traceScreenshotDirectory = async (id: string): Promise<string | null> =>
  native === undefined ? null : native.traceScreenshotDirectory(id);

export const traceStorageUsedBytes = async (): Promise<number> =>
  native === undefined ? 0 : native.traceStorageUsed();
