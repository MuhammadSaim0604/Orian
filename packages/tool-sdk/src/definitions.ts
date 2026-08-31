import { type z } from 'zod';

import { TOOL_ARGUMENT_SCHEMAS } from './arguments';
import { TOOL_NAMES, type ToolName } from './names';

/**
 * Tool definitions: what the model is told about each tool, and what its calls are
 * validated against.
 *
 * One definition per tool, shared by the agent and the MCP server (ADR 0008). The
 * `description` is not documentation - it is the only thing the model has to decide
 * *when* to use a tool, so each one says what the tool is for and, where it matters,
 * what to prefer instead.
 */

/** How much of the device a tool can affect. Drives confirmation policy. */
export const TOOL_IMPACTS = ['read', 'interact', 'write', 'system'] as const;

export type ToolImpact = (typeof TOOL_IMPACTS)[number];

export type ToolDefinition<TName extends ToolName = ToolName> = {
  readonly name: TName;

  /**
   * What the tool does and when to use it, written for the model.
   *
   * Kept in the imperative mood and mentioning the alternative where one exists,
   * because the commonest agent failure is not a malformed call but a plausible call
   * to the wrong tool.
   */
  readonly description: string;

  readonly argumentSchema: z.ZodTypeAny;

  /** What the tool returns, in prose. The model needs to know what it will get back. */
  readonly returns: string;

  readonly impact: ToolImpact;

  /**
   * Whether the tool changes something outside the app.
   *
   * Read-only tools can be retried freely; a tool that sends a message cannot be
   * retried without possibly sending twice.
   */
  readonly idempotent: boolean;
};

const define = <TName extends ToolName>(
  name: TName,
  description: string,
  returns: string,
  impact: ToolImpact,
  idempotent: boolean,
): ToolDefinition<TName> => ({
  name,
  description,
  argumentSchema: TOOL_ARGUMENT_SCHEMAS[name],
  returns,
  impact,
  idempotent,
});

export const TOOL_DEFINITIONS: { readonly [K in ToolName]: ToolDefinition<K> } = {
  click: define(
    'click',
    'Tap an element on screen. Describe the element with a selector rather than ' +
      'coordinates: prefer resourceId, then contentDescription or text.',
    'Nothing. The tap either succeeds or the call fails with element_not_found.',
    'interact',
    false,
  ),

  longPress: define(
    'longPress',
    'Press and hold an element, for context menus and multi-select. Use click for an ' +
      'ordinary tap.',
    'Nothing.',
    'interact',
    false,
  ),

  swipe: define(
    'swipe',
    'Scroll the screen. The direction is where the content moves, so "down" reveals ' +
      'what is further down a list.',
    'Nothing. Read the screen again afterwards to see what changed.',
    'interact',
    true,
  ),

  typeText: define(
    'typeText',
    'Type into a text field. The field must be identified by a selector; tap it first ' +
      'if it is not already focused.',
    'Nothing.',
    'interact',
    false,
  ),

  pressBack: define(
    'pressBack',
    'Press the system back button, to leave a screen or dismiss a dialog.',
    'Nothing.',
    'interact',
    false,
  ),

  pressHome: define(
    'pressHome',
    'Go to the home screen. This leaves the current app; use pressBack to go up one ' +
      'screen instead.',
    'Nothing.',
    'interact',
    true,
  ),

  findElement: define(
    'findElement',
    'Check whether an element is on screen right now and get its details. Use ' +
      'waitForElement if the screen may still be loading.',
    'The matched element with its text, bounds, and which selector strategy matched.',
    'read',
    true,
  ),

  waitForElement: define(
    'waitForElement',
    'Wait for an element to appear, up to a timeout. Use this after any action that ' +
      'loads a new screen, rather than reading the screen immediately.',
    'The matched element once it appears, or a timeout failure.',
    'read',
    true,
  ),

  getUiTree: define(
    'getUiTree',
    'Read every element currently on screen. Use this to understand an unfamiliar ' +
      'screen; prefer findElement when you already know what you are looking for.',
    'The screen hierarchy, with each element\u2019s text, id, bounds, and whether it is ' +
      'tappable.',
    'read',
    true,
  ),

  takeScreenshot: define(
    'takeScreenshot',
    'Capture the screen as an image. Only useful when the element hierarchy is not ' +
      'enough - for example a canvas or an image-only screen. Requires the user to ' +
      'have granted screen capture. If it fails, fall back to getUiTree rather than ' +
      'giving up: the element hierarchy is available even when images are not.',
    'A file path to the image, its size, and when it was taken.',
    'read',
    true,
  ),

  getCurrentScreen: define(
    'getCurrentScreen',
    'Find out which app and screen is in the foreground. Use this to confirm an app ' +
      'actually opened before acting.',
    'The foreground package name and activity name.',
    'read',
    true,
  ),

  openApp: define(
    'openApp',
    'Bring an app to the foreground by its exact package name, such as com.whatsapp. ' +
      'Use openAppByName if you only know the app\u2019s visible name.',
    'Nothing. Confirm with getCurrentScreen or waitForElement.',
    'interact',
    true,
  ),

  openAppByName: define(
    'openAppByName',
    'Open the app whose visible name best matches what you supply, such as "WhatsApp".',
    'The app that was opened, including its package name.',
    'interact',
    true,
  ),

  listApps: define(
    'listApps',
    'List the apps installed on the device. Use this when you are unsure whether an ' +
      'app is present or what its package name is.',
    'The installed apps with their package names and visible labels.',
    'read',
    true,
  ),

  getContacts: define(
    'getContacts',
    'List the user\u2019s contacts. Prefer findContacts when you are looking for someone ' +
      'specific.',
    'Contacts with their display names and phone numbers.',
    'read',
    true,
  ),

  findContacts: define(
    'findContacts',
    'Search the user\u2019s contacts by name or number.',
    'Matching contacts with their display names and phone numbers.',
    'read',
    true,
  ),

  createAlarm: define(
    'createAlarm',
    'Create an alarm in the device clock app at a given time.',
    'Nothing.',
    'write',
    false,
  ),

  readClipboard: define(
    'readClipboard',
    'Read the clipboard. May legitimately return nothing, since Android only allows ' +
      'clipboard reads while this app has focus.',
    'The clipboard text, or nothing.',
    'read',
    true,
  ),

  writeClipboard: define(
    'writeClipboard',
    'Put text on the clipboard, so it can be pasted into an app.',
    'Nothing.',
    'write',
    true,
  ),

  sendNotification: define(
    'sendNotification',
    'Post a notification on the device. Use this to tell the user something, not to ' +
      'message another person.',
    'Nothing.',
    'write',
    false,
  ),

  launchIntent: define(
    'launchIntent',
    'Send an Android intent, for actions no other tool covers - opening a URL, ' +
      'starting a dial, sharing content. Prefer a specific tool when one exists.',
    'Nothing.',
    'system',
    false,
  ),

  getSystemSetting: define(
    'getSystemSetting',
    'Read a system setting value, such as the screen brightness or timeout.',
    'The setting value as text, or nothing if it is not set.',
    'read',
    true,
  ),

  controlMedia: define(
    'controlMedia',
    'Control whatever is currently playing audio or video - play, pause, skip.',
    'Nothing.',
    'interact',
    false,
  ),

  adjustVolume: define(
    'adjustVolume',
    'Nudge the media volume one step up or down.',
    'Nothing.',
    'interact',
    false,
  ),

  sendSms: define(
    'sendSms',
    'Send a text message. This sends it immediately - it does not open a messaging ' +
      'app for the user to confirm. Use findContacts first if you have a name rather ' +
      'than a number.',
    'Nothing. The message was sent if the call succeeded.',
    // `write` rather than `interact`: it leaves the device and reaches another person.
    'write',
    false,
  ),

  readSms: define(
    'readSms',
    'Read recent text messages, newest first. Use this to find a verification code ' +
      'or see what someone said. Pass fromNumber to read one conversation.',
    'Messages with the other party\u2019s number, the text, when it arrived, and whether ' +
      'it was sent or received.',
    'read',
    true,
  ),

  placeCall: define(
    'placeCall',
    'Call a phone number. If the user has not allowed calling, this opens the dialer ' +
      'with the number filled in instead - check the returned outcome before telling ' +
      'the user the call was made.',
    'Either "calling" or "dialer_opened". The second means the user still has to press call.',
    'write',
    false,
  ),

  endCall: define(
    'endCall',
    'Hang up the call in progress. Needs Android 9 or later.',
    'Nothing.',
    'write',
    false,
  ),

  setSystemSetting: define(
    'setSystemSetting',
    'Change a device setting: screen brightness, brightness mode, screen timeout, or ' +
      'auto-rotate. Only those four can be changed. Brightness is 0-255, and setting ' +
      'it has no lasting effect while screen_brightness_mode is 1 (automatic) - set ' +
      'the mode to 0 first.',
    'Nothing.',
    'system',
    false,
  ),

  setRingerMode: define(
    'setRingerMode',
    'Set the phone to normal, vibrate, or silent. Silent and vibrate need Do Not ' +
      'Disturb access; returning to normal never does.',
    'Nothing.',
    'system',
    false,
  ),
};

export const toolDefinition = (name: ToolName): ToolDefinition => TOOL_DEFINITIONS[name];

/** Every definition, for building a prompt or an MCP tool list. */
export const allToolDefinitions = (): readonly ToolDefinition[] =>
  TOOL_NAMES.map((name) => TOOL_DEFINITIONS[name]);

/**
 * Tools safe to retry without asking.
 *
 * A read is always safe to repeat. A tap might submit a form twice, and sending a
 * message twice is worse than not sending it - so the agent must decide those
 * deliberately rather than retrying by default.
 */
export const isRetryableTool = (name: ToolName): boolean => TOOL_DEFINITIONS[name].idempotent;

/** Tools that only observe, useful for a dry run or a read-only agent mode. */
export const readOnlyTools = (): readonly ToolName[] =>
  TOOL_NAMES.filter((name) => TOOL_DEFINITIONS[name].impact === 'read');
