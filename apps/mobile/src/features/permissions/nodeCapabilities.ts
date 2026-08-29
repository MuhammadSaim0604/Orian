import { type CapabilityId } from './capabilities';

/**
 * Which capability a node type needs, if any.
 *
 * Here rather than on the node definitions, deliberately. A node package is device-agnostic in
 * principle and publishable to npm; teaching it about Android permission ids would push a platform
 * concern into the layer whose whole purpose is not having one. This map is the app's knowledge of
 * what a node will need on *this* platform.
 *
 * Keys are `AnyNodeDefinition.type` values from `@mobile-automation/android-nodes`. A node type
 * absent from the map needs nothing beyond what onboarding already granted — which is most of them,
 * since click, swipe, and type all run on the accessibility service the required tier covers.
 */
export const NODE_CAPABILITY: Readonly<Record<string, CapabilityId>> = {
  contact: 'contacts',
  alarm: 'exact_alarm',
  notification: 'notifications',
  takeScreenshot: 'screen_capture',
};

export const capabilityForNodeType = (nodeType: string): CapabilityId | undefined =>
  NODE_CAPABILITY[nodeType];
