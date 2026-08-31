/**
 * The device tool vocabulary.
 *
 * Duplicated deliberately in Kotlin as `DeviceTool` (`android/automation`), with a
 * parity test on each side restating the other's list. If the two drift, the AI can
 * name a tool the runtime cannot call - so both must change in the same commit.
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
  'openAppByName',
  'listApps',
  'getCurrentScreen',
  'getContacts',
  'findContacts',
  'createAlarm',
  'readClipboard',
  'writeClipboard',
  'sendNotification',
  'launchIntent',
  'getSystemSetting',
  'controlMedia',
  'adjustVolume',
  'sendSms',
  'readSms',
  'placeCall',
  'endCall',
  'setSystemSetting',
  'setRingerMode',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const isToolName = (value: string): value is ToolName =>
  (TOOL_NAMES as readonly string[]).includes(value);
