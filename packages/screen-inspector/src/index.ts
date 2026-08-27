/**
 * `@mobile-automation/screen-inspector`
 *
 * Reads and summarises the serialized UI tree that the Kotlin accessibility
 * layer produces. Used by the Screen Inspector UI and to build model context.
 *
 * Phase 1 scaffold - real traversal lands once the bridge exists in Phase 3.
 */

import { type Bounds } from '@mobile-automation/workflow-schema';

export const PACKAGE_NAME = '@mobile-automation/screen-inspector' as const;

/**
 * Version of the serialized UI tree format this package understands.
 *
 * Must match `UI_TREE_SCHEMA_VERSION` in the Kotlin accessibility module. A
 * payload declaring a different version is rejected rather than partially read,
 * because silently misreading a tree would give the AI a wrong view of the
 * screen.
 */
export const UI_TREE_SCHEMA_VERSION = 2 as const;

/**
 * Node attributes the Kotlin UI tree parser serializes, in emission order.
 *
 * This shape is shared with the native layer and with the AI, so it must stay
 * stable. It mirrors `UiNodeAttribute` in
 * `android/accessibility`, where a parity test asserts the serializer emits
 * exactly these keys in exactly this order.
 */
export const UI_NODE_ATTRIBUTES = [
  'text',
  'resourceId',
  'className',
  'contentDescription',
  'packageName',
  'bounds',
  'clickable',
  'longClickable',
  'scrollable',
  'editable',
  'checkable',
  'checked',
  'selected',
  'focused',
  'enabled',
  'visible',
  'index',
  'children',
] as const;

export type UiNodeAttribute = (typeof UI_NODE_ATTRIBUTES)[number];

/**
 * Keys of the envelope wrapping the root node. Present once per capture rather
 * than per node, mirroring `UiTreeAttribute` on the Kotlin side.
 */
export const UI_TREE_ATTRIBUTES = [
  'schemaVersion',
  'packageName',
  'activityName',
  'capturedAtEpochMs',
  'screenWidthPx',
  'screenHeightPx',
  'nodeCount',
  'root',
] as const;

export type UiTreeAttribute = (typeof UI_TREE_ATTRIBUTES)[number];

/** Centre point of an element, used only as a coordinate fallback. */
export const centreOf = (bounds: Bounds): { x: number; y: number } => ({
  x: Math.round((bounds.left + bounds.right) / 2),
  y: Math.round((bounds.top + bounds.bottom) / 2),
});

/** An element with zero area cannot be tapped. */
export const isTappable = (bounds: Bounds): boolean =>
  bounds.right > bounds.left && bounds.bottom > bounds.top;

/**
 * Whether a serialized tree's schema version is one this package can read.
 *
 * Callers should check before traversing: a mismatch means the native layer was
 * updated without the TypeScript side, and reading on regardless would produce
 * plausible-looking but wrong results.
 */
export const isSupportedSchemaVersion = (version: number): boolean =>
  version === UI_TREE_SCHEMA_VERSION;
