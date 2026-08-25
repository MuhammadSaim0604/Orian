/**
 * `@mobile-automation/node-sdk`
 *
 * The contract every workflow node implements, plus the registry nodes are
 * registered into. Third-party packages depend on this to author nodes that
 * the app can discover from npm.
 *
 * Phase 1 scaffold - the real `NodeDefinition`, registry, and executor
 * contracts are built in Phase 4.
 */

import { PACKAGE_NAME as SHARED_TYPES } from '@mobile-automation/shared-types';

export const PACKAGE_NAME = '@mobile-automation/node-sdk' as const;

/** Proof that the workspace dependency graph is wired correctly. */
export const DEPENDS_ON = [SHARED_TYPES] as const;

/**
 * The device-agnostic node categories. Device capabilities are not node types -
 * they are actions contributed by `android-nodes` (see ADR 0008).
 */
export const NODE_KINDS = [
  'input',
  'action',
  'condition',
  'loop',
  'variable',
  'transform',
  'trigger',
] as const;

export type NodeKind = (typeof NODE_KINDS)[number];

export const isNodeKind = (value: string): value is NodeKind =>
  (NODE_KINDS as readonly string[]).includes(value);
