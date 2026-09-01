/**
 * `@mobile-automation/android-nodes`
 *
 * Device capability nodes. Each is a thin wrapper that calls one tool on the Android
 * Tool Runtime through the SDK's abstract `ToolInvoker` - no automation logic lives
 * here, because that belongs in Kotlin (ADR 0001), and nothing imports the native
 * bridge directly.
 *
 * That indirection is what lets this package be unit-tested with no device attached,
 * and it is the single seam the Phase 9 execution recorder observes to capture every
 * device action.
 */

import { type AnyNodeDefinition } from '@mobile-automation/node-sdk';
import { type ToolName, isToolName } from '@mobile-automation/tool-sdk';

import {
  alarmNode,
  clickNode,
  clipboardReadNode,
  clipboardWriteNode,
  contactNode,
  currentScreenNode,
  findElementNode,
  launchIntentNode,
  longPressNode,
  mediaNode,
  notificationNode,
  ocrNode,
  openAppNode,
  pressBackNode,
  pressHomeNode,
  readScreenNode,
  swipeNode,
  systemSettingNode,
  takeScreenshotNode,
  typeTextNode,
  volumeNode,
  waitForElementNode,
} from './nodes';

export const PACKAGE_NAME = '@mobile-automation/android-nodes' as const;

/**
 * Node type identifiers mapped to the runtime tool each one calls.
 *
 * Declared as data rather than left implicit inside each node, so the mapping can be
 * checked against `tool-sdk`'s vocabulary in a test. A node wired to a tool the
 * runtime does not expose would otherwise fail only when someone ran that step on a
 * real phone.
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
  /**
   * Maps to `runOcr`, the whole-screen read.
   *
   * The node dispatches to `findTextOnScreen` instead when a search term is configured, so this map records the
   * *default* tool rather than the only one. The alternative — two node types the user has to tell apart — would
   * put the same distinction in the palette instead of in one node's config.
   */
  ocr: 'runOcr',
  pressBack: 'pressBack',
  pressHome: 'pressHome',
  currentScreen: 'getCurrentScreen',
  notification: 'sendNotification',
  contact: 'getContacts',
  clipboardRead: 'readClipboard',
  clipboardWrite: 'writeClipboard',
  alarm: 'createAlarm',
  media: 'controlMedia',
  volume: 'adjustVolume',
  launchIntent: 'launchIntent',
  systemSetting: 'getSystemSetting',
} as const satisfies Record<string, ToolName>;

export type AndroidNodeType = keyof typeof NODE_TO_TOOL;

/** The runtime tool a given Android node delegates to. */
export const toolForNode = (node: AndroidNodeType): ToolName => NODE_TO_TOOL[node];

/** Guards against a node being wired to a tool the runtime does not expose. */
export const everyNodeMapsToAKnownTool = (): boolean =>
  Object.values(NODE_TO_TOOL).every((tool) => isToolName(tool));

/**
 * Every Android node, in palette order.
 *
 * Registered as one batch so a mistake in any of them fails at startup rather than
 * leaving the registry half-populated.
 */
export const androidNodes: readonly AnyNodeDefinition[] = [
  openAppNode,
  clickNode,
  longPressNode,
  swipeNode,
  typeTextNode,
  findElementNode,
  waitForElementNode,
  readScreenNode,
  takeScreenshotNode,
  // Straight after the screenshot, because they are the three ways of seeing a screen and the palette should read
  // in the same order the perception chain does.
  ocrNode,
  currentScreenNode,
  pressBackNode,
  pressHomeNode,
  notificationNode,
  contactNode,
  clipboardReadNode,
  clipboardWriteNode,
  alarmNode,
  mediaNode,
  volumeNode,
  launchIntentNode,
  systemSettingNode,
];

export {
  alarmNode,
  clickNode,
  clipboardReadNode,
  clipboardWriteNode,
  contactNode,
  currentScreenNode,
  findElementNode,
  launchIntentNode,
  longPressNode,
  mediaNode,
  notificationNode,
  ocrNode,
  openAppNode,
  pressBackNode,
  pressHomeNode,
  readScreenNode,
  swipeNode,
  systemSettingNode,
  takeScreenshotNode,
  typeTextNode,
  volumeNode,
  waitForElementNode,
} from './nodes';

export {
  AlarmConfigSchema,
  ClipboardWriteConfigSchema,
  ContactsConfigSchema,
  LaunchIntentConfigSchema,
  LongPressConfigSchema,
  MediaConfigSchema,
  NoArgumentConfigSchema,
  NotificationConfigSchema,
  OcrConfigSchema,
  OpenAppConfigSchema,
  ReadScreenConfigSchema,
  SelectorConfigSchema,
  SwipeConfigSchema,
  SystemSettingConfigSchema,
  TypeTextConfigSchema,
  VolumeConfigSchema,
  WaitForElementConfigSchema,
  type AlarmConfig,
  type ClipboardWriteConfig,
  type ContactsConfig,
  type LaunchIntentConfig,
  type LongPressConfig,
  type MediaConfig,
  type NoArgumentConfig,
  type NotificationConfig,
  type OcrConfig,
  type OpenAppConfig,
  type ReadScreenConfig,
  type SelectorConfig,
  type SwipeConfig,
  type SystemSettingConfig,
  type TypeTextConfig,
  type VolumeConfig,
  type WaitForElementConfig,
} from './config';

export { DATA_CATEGORY, DEVICE_CATEGORY, invokeTool } from './shared';
