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
 * Node attributes the Kotlin UI tree parser serializes. This shape is shared
 * with the native layer and with the AI, so it must stay stable.
 */
export const UI_NODE_ATTRIBUTES = [
  'text',
  'resourceId',
  'className',
  'contentDescription',
  'bounds',
  'clickable',
  'focused',
  'packageName',
] as const;

export type UiNodeAttribute = (typeof UI_NODE_ATTRIBUTES)[number];

/** Centre point of an element, used only as a coordinate fallback. */
export const centreOf = (bounds: Bounds): { x: number; y: number } => ({
  x: Math.round((bounds.left + bounds.right) / 2),
  y: Math.round((bounds.top + bounds.bottom) / 2),
});

/** An element with zero area cannot be tapped. */
export const isTappable = (bounds: Bounds): boolean =>
  bounds.right > bounds.left && bounds.bottom > bounds.top;
