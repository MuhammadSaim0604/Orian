/**
 * `@mobile-automation/tool-sdk`
 *
 * The single source of truth for the device tool surface. Both the AI agent
 * and the MCP server register tools from these definitions, so a tool is
 * described exactly once (ADR 0008).
 *
 * Phase 1 scaffold - the argument schemas and implementations arrive with the
 * native bridge in Phase 3 and the agent in Phase 7.
 */

export const PACKAGE_NAME = '@mobile-automation/tool-sdk' as const;

/**
 * Names of the device tools the Android Tool Runtime will expose. Kept as a
 * plain list in Phase 1 so the agent, MCP server, and node packages can agree
 * on vocabulary before the implementations exist.
 */
export const TOOL_NAMES = [
  'click',
  'longPress',
  'swipe',
  'typeText',
  'findElement',
  'waitForElement',
  'getUiTree',
  'takeScreenshot',
  'pressBack',
  'pressHome',
  'openApp',
  'listApps',
  'getCurrentScreen',
  'getContacts',
  'createAlarm',
  'readClipboard',
  'writeClipboard',
  'sendNotification',
  'launchIntent',
  'getSystemSetting',
  'controlMedia',
  'adjustVolume',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const isToolName = (value: string): value is ToolName =>
  (TOOL_NAMES as readonly string[]).includes(value);
