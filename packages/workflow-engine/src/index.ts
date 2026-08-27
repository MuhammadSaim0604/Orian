/**
 * `@mobile-automation/workflow-engine`
 *
 * Executes a workflow JSON by walking the DAG, resolving each node through the
 * registry, and calling the Android Tool Runtime through the SDK's abstract
 * `ToolInvoker`.
 *
 * Deliberately independent of React Native: nothing here may import from
 * `apps/mobile`, and the engine runs in plain Node against a fake invoker. That is
 * what makes the whole execution path testable without a phone.
 */

export const PACKAGE_NAME = '@mobile-automation/workflow-engine' as const;

export {
  ERROR_BEHAVIOURS,
  NODE_STATES,
  type ErrorBehaviour,
  type NodeState,
  isTerminalState,
} from '@mobile-automation/shared-types';

export {
  type AcceptedPackage,
  type DiscoverablePackage,
  type DiscoveryResult,
  type PackageRejectionReason,
  type RejectedPackage,
  discoverNodePackages,
  isBuiltInPackage,
  qualifyNodeType,
  readManifest,
  registerBuiltInNodes,
} from './discovery';

export {
  EXECUTION_EVENT_TYPES,
  EXECUTION_OUTCOMES,
  ExecutionEventBus,
  type BranchTakenEvent,
  type ExecutionEvent,
  type ExecutionEventListener,
  type ExecutionEventType,
  type ExecutionOutcome,
  type LogEvent,
  type NodeFailedEvent,
  type NodeRetryingEvent,
  type NodeSkippedEvent,
  type NodeStartedEvent,
  type NodeSucceededEvent,
  type VariableChangedEvent,
  type WorkflowFinishedEvent,
  type WorkflowStartedEvent,
  stateForEvent,
} from './events';

export {
  DEFAULT_MAX_STEPS,
  type ExecuteOptions,
  type ExecutionResult,
  executeWorkflow,
  runWorkflow,
} from './executor';

export {
  WorkflowLoadError,
  type LoadedWorkflow,
  type ResolvedNode,
  branchHandle,
  isWorkflowLoadError,
  loadWorkflow,
  nextNodeIds,
} from './loader';

export { RunVariableStore } from './variables';
