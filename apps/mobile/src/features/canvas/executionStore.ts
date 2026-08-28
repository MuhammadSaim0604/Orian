import { type NodeState } from '@mobile-automation/shared-types';
import { type ExecutionEvent } from '@mobile-automation/workflow-engine';
import { create } from 'zustand';

/**
 * Execution state: what is happening right now, for the debugger and the log.
 *
 * Fed by the engine's event stream rather than by polling, and deliberately separate from
 * the canvas store: a run updates many times a second, and coupling it to the graph would
 * repaint nodes that have not changed.
 */

export type LogEntry = {
  readonly id: string;
  readonly timestampEpochMs: number;
  readonly nodeId: string | null;
  readonly label: string;
  readonly detail: string | null;
  readonly tone: 'normal' | 'good' | 'bad' | 'muted';
};

export type ExecutionState = {
  readonly running: boolean;
  readonly executionId: string | null;
  /** Node id to lifecycle state, for colouring the canvas. */
  readonly nodeStates: Readonly<Record<string, NodeState>>;
  readonly log: readonly LogEntry[];
  readonly variables: Readonly<Record<string, unknown>>;
  readonly outcome: 'succeeded' | 'failed' | 'cancelled' | null;
  readonly error: string | null;
  /** Which node is currently executing, so the canvas can centre on it. */
  readonly activeNodeId: string | null;
};

export type ExecutionActions = {
  startRun: (executionId: string) => void;
  /** Applies one engine event. The single place run state changes. */
  apply: (event: ExecutionEvent) => void;
  clear: () => void;
};

/**
 * Cap on retained log entries.
 *
 * A workflow with a thousand-iteration loop would otherwise grow the list without bound and
 * eventually make the log view unscrollable.
 */
const MAX_LOG_ENTRIES = 500;

const initialState = (): ExecutionState => ({
  running: false,
  executionId: null,
  nodeStates: {},
  log: [],
  variables: {},
  outcome: null,
  error: null,
  activeNodeId: null,
});

let logCounter = 0;

export const useExecutionStore = create<ExecutionState & ExecutionActions>((set) => ({
  ...initialState(),

  startRun: (executionId) => set({ ...initialState(), running: true, executionId }),

  apply: (event) =>
    set((state) => {
      const append = (entry: Omit<LogEntry, 'id'>): readonly LogEntry[] => {
        logCounter += 1;
        const next = [...state.log, { ...entry, id: `log_${logCounter}` }];
        return next.length > MAX_LOG_ENTRIES ? next.slice(-MAX_LOG_ENTRIES) : next;
      };

      switch (event.type) {
        case 'workflowStarted':
          return {
            running: true,
            executionId: event.executionId,
            variables: event.variables,
            log: append({
              timestampEpochMs: event.timestampEpochMs,
              nodeId: null,
              label: `Started ${event.workflowName}`,
              detail: `${event.nodeCount} nodes`,
              tone: 'normal',
            }),
          };

        case 'nodeStarted':
          return {
            activeNodeId: event.nodeId,
            nodeStates: { ...state.nodeStates, [event.nodeId]: 'running' },
            log: append({
              timestampEpochMs: event.timestampEpochMs,
              nodeId: event.nodeId,
              label: event.label,
              // A retry is named, or the log shows the same step twice with no explanation.
              detail: event.attempt > 0 ? `attempt ${event.attempt + 1}` : null,
              tone: 'muted',
            }),
          };

        case 'nodeSucceeded':
          return {
            nodeStates: { ...state.nodeStates, [event.nodeId]: 'succeeded' },
            log: append({
              timestampEpochMs: event.timestampEpochMs,
              nodeId: event.nodeId,
              label: event.summary ?? `${event.nodeType} done`,
              detail: `${event.durationMs}ms`,
              tone: 'good',
            }),
          };

        case 'nodeFailed':
          return {
            nodeStates: { ...state.nodeStates, [event.nodeId]: 'failed' },
            log: append({
              timestampEpochMs: event.timestampEpochMs,
              nodeId: event.nodeId,
              label: `${event.nodeType} failed`,
              detail: event.error,
              tone: 'bad',
            }),
          };

        case 'nodeRetrying':
          return {
            log: append({
              timestampEpochMs: event.timestampEpochMs,
              nodeId: event.nodeId,
              label: `Retrying ${event.nodeType}`,
              detail: `${event.attempt} of ${event.ofAttempts}: ${event.reason}`,
              tone: 'muted',
            }),
          };

        case 'nodeSkipped':
          return {
            nodeStates: { ...state.nodeStates, [event.nodeId]: 'skipped' },
            log: append({
              timestampEpochMs: event.timestampEpochMs,
              nodeId: event.nodeId,
              label: 'Skipped',
              detail: event.reason,
              tone: 'muted',
            }),
          };

        case 'branchTaken':
          return {
            log: append({
              timestampEpochMs: event.timestampEpochMs,
              nodeId: event.nodeId,
              label: `Took the "${event.handle}" branch`,
              detail: null,
              tone: 'normal',
            }),
          };

        case 'variableChanged':
          return {
            variables: { ...state.variables, [event.name]: event.value },
            log: append({
              timestampEpochMs: event.timestampEpochMs,
              nodeId: event.nodeId,
              label: `${event.name} = ${JSON.stringify(event.value)}`,
              detail: null,
              tone: 'muted',
            }),
          };

        case 'log':
          return {
            log: append({
              timestampEpochMs: event.timestampEpochMs,
              nodeId: event.nodeId ?? null,
              label: event.message,
              detail: null,
              tone: 'muted',
            }),
          };

        case 'workflowFinished':
          return {
            running: false,
            activeNodeId: null,
            outcome: event.outcome,
            error: event.error ?? null,
            variables: event.variables,
            log: append({
              timestampEpochMs: event.timestampEpochMs,
              nodeId: null,
              label: FINISH_LABEL[event.outcome] ?? 'Finished',
              detail: `${event.stepsRun} steps in ${event.durationMs}ms`,
              tone: event.outcome === 'succeeded' ? 'good' : 'bad',
            }),
          };
      }
    }),

  clear: () => set(initialState()),
}));

const FINISH_LABEL: Record<string, string> = {
  succeeded: 'Finished',
  failed: 'Failed',
  cancelled: 'Stopped',
};

/** One node's run state. The narrow selector the canvas uses per node. */
export const selectNodeState =
  (nodeId: string) =>
  (state: ExecutionState): NodeState | undefined =>
    state.nodeStates[nodeId];

export const selectIsRunning = (state: ExecutionState): boolean => state.running;
