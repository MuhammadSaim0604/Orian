import { type JsonObject, type JsonValue, type NodeState } from '@mobile-automation/node-sdk';

/**
 * Structured events emitted while a workflow runs.
 *
 * The debugger, the execution log, and the Phase 9 recorder all consume these. Events
 * rather than a returned summary because a workflow can run for minutes: a user
 * watching it needs to see each step as it happens, not a report at the end.
 *
 * Every event carries `executionId` and a timestamp so a log can be reassembled after
 * the fact, and so two concurrent runs cannot be confused.
 */

export const EXECUTION_EVENT_TYPES = [
  'workflowStarted',
  'workflowFinished',
  'nodeStarted',
  'nodeSucceeded',
  'nodeFailed',
  'nodeRetrying',
  'nodeSkipped',
  'branchTaken',
  'variableChanged',
  'log',
] as const;

export type ExecutionEventType = (typeof EXECUTION_EVENT_TYPES)[number];

type BaseEvent = {
  readonly executionId: string;
  readonly timestampEpochMs: number;
};

export type WorkflowStartedEvent = BaseEvent & {
  readonly type: 'workflowStarted';
  readonly workflowId: string;
  readonly workflowName: string;
  readonly nodeCount: number;
  readonly variables: JsonObject;
};

/** How a run ended. `cancelled` is separate because it is not a failure. */
export const EXECUTION_OUTCOMES = ['succeeded', 'failed', 'cancelled'] as const;

export type ExecutionOutcome = (typeof EXECUTION_OUTCOMES)[number];

export type WorkflowFinishedEvent = BaseEvent & {
  readonly type: 'workflowFinished';
  readonly outcome: ExecutionOutcome;
  readonly durationMs: number;
  readonly stepsRun: number;
  /** Present when the run failed: the node that stopped it. */
  readonly failedNodeId?: string;
  readonly error?: string;
  readonly variables: JsonObject;
};

export type NodeStartedEvent = BaseEvent & {
  readonly type: 'nodeStarted';
  readonly nodeId: string;
  readonly nodeType: string;
  readonly label: string;
  /** Zero-based attempt number, so a retry is distinguishable from a first try. */
  readonly attempt: number;
};

export type NodeSucceededEvent = BaseEvent & {
  readonly type: 'nodeSucceeded';
  readonly nodeId: string;
  readonly nodeType: string;
  readonly durationMs: number;
  readonly summary?: string;
  readonly outputs?: JsonObject;
};

export type NodeFailedEvent = BaseEvent & {
  readonly type: 'nodeFailed';
  readonly nodeId: string;
  readonly nodeType: string;
  readonly durationMs: number;
  readonly error: string;
  readonly retryable: boolean;
  readonly needsUserAction: boolean;
  /** Whether the run continues, per this node's `onError` policy. */
  readonly continuing: boolean;
};

export type NodeRetryingEvent = BaseEvent & {
  readonly type: 'nodeRetrying';
  readonly nodeId: string;
  readonly nodeType: string;
  readonly attempt: number;
  readonly ofAttempts: number;
  readonly delayMs: number;
  readonly reason: string;
};

export type NodeSkippedEvent = BaseEvent & {
  readonly type: 'nodeSkipped';
  readonly nodeId: string;
  readonly nodeType: string;
  /** Why, e.g. an untaken branch. Shown in the log so a gap is never unexplained. */
  readonly reason: string;
};

export type BranchTakenEvent = BaseEvent & {
  readonly type: 'branchTaken';
  readonly nodeId: string;
  readonly handle: string;
  readonly targetNodeIds: readonly string[];
};

export type VariableChangedEvent = BaseEvent & {
  readonly type: 'variableChanged';
  readonly nodeId: string;
  readonly name: string;
  readonly value: JsonValue;
};

export type LogEvent = BaseEvent & {
  readonly type: 'log';
  readonly nodeId?: string;
  readonly message: string;
};

export type ExecutionEvent =
  | WorkflowStartedEvent
  | WorkflowFinishedEvent
  | NodeStartedEvent
  | NodeSucceededEvent
  | NodeFailedEvent
  | NodeRetryingEvent
  | NodeSkippedEvent
  | BranchTakenEvent
  | VariableChangedEvent
  | LogEvent;

export type ExecutionEventListener = (event: ExecutionEvent) => void;

/**
 * Fans events out to listeners.
 *
 * A listener that throws must not break the run: a UI bug in the log view should not
 * abandon a half-finished workflow on the user's phone. So each is called defensively
 * and a failure is swallowed rather than propagated.
 */
export class ExecutionEventBus {
  private readonly listeners = new Set<ExecutionEventListener>();

  subscribe(listener: ExecutionEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: ExecutionEvent): void {
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

/** Maps a node's final event to the state the debugger should show. */
export const stateForEvent = (event: ExecutionEvent): NodeState | undefined => {
  switch (event.type) {
    case 'nodeStarted':
      return 'running';
    case 'nodeSucceeded':
      return 'succeeded';
    case 'nodeFailed':
      return 'failed';
    case 'nodeSkipped':
      return 'skipped';
    default:
      return undefined;
  }
};
