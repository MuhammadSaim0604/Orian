/**
 * Failures a node can raise.
 *
 * A dedicated error type because the engine has to make a decision from it: retry,
 * continue, or stop. A bare `Error` carrying only a message would force the engine
 * to guess, or to retry things that can never succeed - re-running a node whose
 * config is invalid wastes the retry budget and delays the real report.
 */

export type NodeExecutionErrorOptions = {
  /**
   * Whether repeating the call could plausibly succeed.
   *
   * Defaults to true, matching the common case: most node failures are transient
   * device conditions - a screen still loading, a gesture arriving mid-animation.
   */
  readonly retryable?: boolean;

  /**
   * Whether the user must grant or change something first.
   *
   * Distinct from retryable: an accessibility permission that has not been given
   * will never resolve itself no matter how many times the node runs, but it is
   * fixable, so the UI should prompt rather than just report failure.
   */
  readonly needsUserAction?: boolean;

  /** The underlying error, kept for the log without leaking into the message. */
  readonly cause?: unknown;

  /** Extra context for the execution log, e.g. the selector that failed. */
  readonly detail?: Readonly<Record<string, unknown>>;
};

export class NodeExecutionError extends Error {
  readonly nodeId: string;
  readonly nodeType: string;
  readonly retryable: boolean;
  readonly needsUserAction: boolean;
  readonly detail: Readonly<Record<string, unknown>>;

  constructor(
    nodeId: string,
    nodeType: string,
    message: string,
    options: NodeExecutionErrorOptions = {},
  ) {
    // The node id and type lead the message because that is the first thing
    // someone debugging a twenty-node workflow needs to know.
    super(`Node "${nodeId}" (${nodeType}) failed: ${message}`);

    this.name = 'NodeExecutionError';
    this.nodeId = nodeId;
    this.nodeType = nodeType;
    this.retryable = options.retryable ?? true;
    this.needsUserAction = options.needsUserAction ?? false;
    this.detail = options.detail ?? {};

    if (options.cause !== undefined) this.cause = options.cause;

    // Restores the prototype chain, lost when a built-in is subclassed and
    // transpiled down; without it `instanceof` is false and the engine would
    // treat every node failure as an unknown error.
    Object.setPrototypeOf(this, NodeExecutionError.prototype);
  }
}

export const isNodeExecutionError = (value: unknown): value is NodeExecutionError =>
  value instanceof NodeExecutionError;

/**
 * Raised when a run is cancelled.
 *
 * Separate from a failure: the user stopping a workflow is a normal outcome and
 * must not be retried, reported as an error, or counted against the node.
 */
export class ExecutionCancelledError extends Error {
  constructor(message = 'Execution was cancelled') {
    super(message);
    this.name = 'ExecutionCancelledError';
    Object.setPrototypeOf(this, ExecutionCancelledError.prototype);
  }
}

export const isExecutionCancelledError = (value: unknown): value is ExecutionCancelledError =>
  value instanceof ExecutionCancelledError;

/**
 * Throws if the run has been cancelled.
 *
 * Nodes performing several device calls should check between them, so stopping a
 * workflow takes effect promptly instead of after the current node finishes
 * everything it planned to do.
 */
export const throwIfCancelled = (signal: AbortSignal): void => {
  if (signal.aborted) throw new ExecutionCancelledError();
};
