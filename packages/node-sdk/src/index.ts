/**
 * `@mobile-automation/node-sdk`
 *
 * The contract every workflow node implements, plus the registry nodes are
 * registered into. Third-party packages depend on this to author nodes the app can
 * discover from npm (the n8n community-node model).
 *
 * Deliberately small and free of device knowledge. A node receives a validated
 * config, its inputs, the variable store, and an abstract `ToolInvoker` - never the
 * native bridge directly. That is what keeps node packages pure TypeScript and
 * unit-testable without a phone attached.
 */

import { PACKAGE_NAME as SHARED_TYPES } from '@mobile-automation/shared-types';

export const PACKAGE_NAME = '@mobile-automation/node-sdk' as const;

/** Proof that the workspace dependency graph is wired correctly. */
export const DEPENDS_ON = [SHARED_TYPES] as const;

export {
  ERROR_BEHAVIOURS,
  NODE_KINDS,
  NODE_STATES,
  type ErrorBehaviour,
  type ExecutionPolicy,
  type JsonObject,
  type JsonValue,
  type NodeKind,
  type NodeState,
  isNodeKind,
  isTerminalState,
} from './contracts';

export {
  type AnyNodeDefinition,
  type BranchDecision,
  type ExecutionContext,
  type NodeDefinition,
  type NodeDisplay,
  type NodeResult,
  type PortSpec,
  type ToolInvoker,
  type VariableStore,
  asAnyDefinition,
} from './definition';

export {
  NodeRegistrationError,
  NodeRegistry,
  UnknownNodeTypeError,
  type RegistrationError,
  isNodeRegistrationError,
  isUnknownNodeTypeError,
} from './registry';

export {
  MANIFEST_FIELD,
  NODE_SDK_VERSION,
  NodeManifestEntrySchema,
  NodeManifestSchema,
  type ManifestMismatch,
  type NodeManifest,
  type NodeManifestEntry,
  isCompatibleSdkVersion,
  reconcileManifest,
} from './manifest';

export {
  ExecutionCancelledError,
  NodeExecutionError,
  type NodeExecutionErrorOptions,
  isExecutionCancelledError,
  isNodeExecutionError,
  throwIfCancelled,
} from './errors';

export {
  type TestContextOptions,
  createRecordingToolInvoker,
  createTestContext,
  createVariableStore,
  defineNode,
  executeNode,
  unavailableToolInvoker,
} from './authoring';

export {
  FIELD_KINDS,
  type FieldDescriptor,
  type FieldKind,
  clearPath,
  describeSchema,
  fieldPaths,
  readPath,
  writePath,
} from './introspection';
