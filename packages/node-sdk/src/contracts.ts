/**
 * Re-exports of the cross-package types the node contract is built from.
 *
 * They live in `shared-types` because that package sits at the bottom of the
 * dependency graph and holds no Zod, so a third-party node package can depend on
 * this SDK without pulling in the workflow schema. Re-exported here so a node
 * author imports everything from one place.
 */

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
} from '@mobile-automation/shared-types';
