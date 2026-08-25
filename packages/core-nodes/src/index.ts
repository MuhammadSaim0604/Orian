/**
 * `@mobile-automation/core-nodes`
 *
 * The generic node library. Nothing here may know about Android - device
 * capabilities live in `android-nodes`. This split is what lets the workflow
 * engine stay portable (ADR 0008).
 *
 * Phase 1 scaffold - node implementations are built in Phase 4.
 */

import { NODE_KINDS, type NodeKind } from '@mobile-automation/node-sdk';

export const PACKAGE_NAME = '@mobile-automation/core-nodes' as const;

/** Every generic node kind this package will provide an implementation for. */
export const PROVIDED_KINDS: readonly NodeKind[] = NODE_KINDS;

/** True when a node kind is device-agnostic and therefore belongs here. */
export const providesKind = (kind: NodeKind): boolean => PROVIDED_KINDS.includes(kind);
