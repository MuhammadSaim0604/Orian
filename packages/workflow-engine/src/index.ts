/**
 * `@mobile-automation/workflow-engine`
 *
 * Executes a workflow JSON by walking the DAG, resolving each node through the
 * registry, and calling the Android Tool Runtime. Deliberately independent of
 * React Native: nothing here may import from `apps/mobile`.
 *
 * Phase 1 scaffold - the executor is built in Phase 5.
 */

export const PACKAGE_NAME = '@mobile-automation/workflow-engine' as const;

/** Lifecycle states a node passes through during execution. */
export const NODE_STATES = ['pending', 'running', 'succeeded', 'failed', 'skipped'] as const;

export type NodeState = (typeof NODE_STATES)[number];

/** What to do when a node fails, honoured per node via `executionPolicy`. */
export const ERROR_BEHAVIOURS = ['stop', 'continue', 'retry'] as const;

export type ErrorBehaviour = (typeof ERROR_BEHAVIOURS)[number];

/** A node is finished when it can no longer transition. */
export const isTerminalState = (state: NodeState): boolean =>
  state === 'succeeded' || state === 'failed' || state === 'skipped';
