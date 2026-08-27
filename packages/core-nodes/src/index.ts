/**
 * `@mobile-automation/core-nodes`
 *
 * The generic node library. Nothing here may know about Android - device
 * capabilities live in `android-nodes`. This split is what lets the workflow engine
 * stay portable (ADR 0008).
 *
 * The one apparent exception is that `condition` and `action` can invoke tools. They
 * do so through the abstract `ToolInvoker` from the SDK, by name, without importing
 * anything Android-specific - so this package still builds and tests with no device
 * and no native bridge present.
 */

import { type AnyNodeDefinition, NODE_KINDS, type NodeKind } from '@mobile-automation/node-sdk';

import { actionNode } from './action-node';
import { conditionNode } from './condition-node';
import { inputNode } from './input-node';
import { loopNode } from './loop-node';
import { transformNode } from './transform-node';
import { triggerNode } from './trigger-node';
import { variableNode } from './variable-node';

export const PACKAGE_NAME = '@mobile-automation/core-nodes' as const;

/** Every generic node kind this package provides an implementation for. */
export const PROVIDED_KINDS: readonly NodeKind[] = NODE_KINDS;

/** True when a node kind is device-agnostic and therefore belongs here. */
export const providesKind = (kind: NodeKind): boolean => PROVIDED_KINDS.includes(kind);

/**
 * Every core node, in the order they appear in the palette.
 *
 * Registered as one batch so a mistake in any of them fails at startup rather than
 * leaving a half-populated registry.
 */
export const coreNodes: readonly AnyNodeDefinition[] = [
  triggerNode,
  inputNode,
  conditionNode,
  loopNode,
  variableNode,
  transformNode,
  actionNode,
];

export { actionNode } from './action-node';
export { NODE_TYPE as ACTION_NODE_TYPE } from './action-node';
export { conditionNode, compare, evaluateCondition } from './condition-node';
export { NODE_TYPE as CONDITION_NODE_TYPE } from './condition-node';
export { inputNode } from './input-node';
export { NODE_TYPE as INPUT_NODE_TYPE } from './input-node';
export { loopNode, iterationVariableName } from './loop-node';
export { NODE_TYPE as LOOP_NODE_TYPE } from './loop-node';
export { transformNode } from './transform-node';
export { NODE_TYPE as TRANSFORM_NODE_TYPE } from './transform-node';
export { triggerNode } from './trigger-node';
export { NODE_TYPE as TRIGGER_NODE_TYPE } from './trigger-node';
export { variableNode } from './variable-node';
export { NODE_TYPE as VARIABLE_NODE_TYPE } from './variable-node';

export { interpolate, isTruthy, resolveValue, stringify } from './values';
