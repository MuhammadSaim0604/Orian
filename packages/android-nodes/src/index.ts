/**
 * `@mobile-automation/android-nodes`
 *
 * Device capability nodes. Each one is a thin wrapper that calls a tool on the
 * Android Tool Runtime through the native bridge - no automation logic lives
 * here, because that belongs in Kotlin (ADR 0001).
 *
 * Phase 1 scaffold - node implementations arrive in Phase 4, once the bridge
 * from Phase 3 exists.
 */

import { type ToolName, isToolName } from '@mobile-automation/tool-sdk';

export const PACKAGE_NAME = '@mobile-automation/android-nodes' as const;

/**
 * Planned node type identifiers mapped to the runtime tool each one calls.
 * Declaring the mapping up front keeps node names and tool names honest.
 */
export const NODE_TO_TOOL = {
  openApp: 'openApp',
  click: 'click',
  longPress: 'longPress',
  swipe: 'swipe',
  typeText: 'typeText',
  readScreen: 'getUiTree',
  findElement: 'findElement',
  waitForElement: 'waitForElement',
  takeScreenshot: 'takeScreenshot',
  pressBack: 'pressBack',
  pressHome: 'pressHome',
  notification: 'sendNotification',
  contact: 'getContacts',
  clipboardRead: 'readClipboard',
  clipboardWrite: 'writeClipboard',
} as const satisfies Record<string, ToolName>;

export type AndroidNodeType = keyof typeof NODE_TO_TOOL;

/** The runtime tool a given Android node delegates to. */
export const toolForNode = (node: AndroidNodeType): ToolName => NODE_TO_TOOL[node];

/** Guards against a node being wired to a tool the runtime does not expose. */
export const everyNodeMapsToAKnownTool = (): boolean =>
  Object.values(NODE_TO_TOOL).every((tool) => isToolName(tool));
