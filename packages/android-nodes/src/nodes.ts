import { interpolate } from '@mobile-automation/core-nodes';
import { defineNode } from '@mobile-automation/node-sdk';

import {
  AlarmConfigSchema,
  ClipboardWriteConfigSchema,
  ContactsConfigSchema,
  LaunchIntentConfigSchema,
  LongPressConfigSchema,
  MediaConfigSchema,
  NoArgumentConfigSchema,
  NotificationConfigSchema,
  OpenAppConfigSchema,
  ReadScreenConfigSchema,
  SelectorConfigSchema,
  SwipeConfigSchema,
  SystemSettingConfigSchema,
  TypeTextConfigSchema,
  VolumeConfigSchema,
  WaitForElementConfigSchema,
} from './config';
import { DATA_CATEGORY, DEVICE_CATEGORY, invokeTool } from './shared';

/**
 * The device nodes.
 *
 * Every one is a thin wrapper over a single tool on the Android Tool Runtime. No
 * automation logic lives here - that belongs in Kotlin (ADR 0001) - and nothing
 * imports the native bridge directly: they reach it through the SDK's abstract
 * `ToolInvoker`, which is why this package unit-tests with no device attached and why
 * the Phase 9 recorder can observe every device action from one seam.
 */

export const openAppNode = defineNode({
  type: 'openApp',
  version: '1.0.0',
  kind: 'action',
  display: {
    label: 'Open App',
    description: 'Brings an app to the foreground',
    icon: 'app-window',
    category: DEVICE_CATEGORY,
  },
  configSchema: OpenAppConfigSchema,
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [{ handle: 'next', label: 'Next' }],
  requiresDevice: true,
  // Opening an app is the step most worth retrying: a cold start can lose the
  // launch intent while the system is busy.
  defaultExecutionPolicy: { retry: 2, retryDelayMs: 1_000, onError: 'retry' },
  execute: async (context) => {
    const { packageName, appName } = context.config;

    return packageName !== undefined
      ? invokeTool(context, 'openApp', 'openApp', { packageName }, `opening ${packageName}`)
      : invokeTool(context, 'openApp', 'openAppByName', { name: appName }, `opening ${appName}`);
  },
});

export const clickNode = defineNode({
  type: 'click',
  version: '1.0.0',
  kind: 'action',
  display: {
    label: 'Tap',
    description: 'Taps the element a selector resolves to',
    icon: 'pointer',
    category: DEVICE_CATEGORY,
  },
  configSchema: SelectorConfigSchema,
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [{ handle: 'next', label: 'Next' }],
  requiresDevice: true,
  execute: async (context) =>
    invokeTool(context, 'click', 'click', { selector: context.config.selector }, 'tapping element'),
});

export const longPressNode = defineNode({
  type: 'longPress',
  version: '1.0.0',
  kind: 'action',
  display: {
    label: 'Long Press',
    description: 'Presses and holds an element',
    icon: 'hand',
    category: DEVICE_CATEGORY,
  },
  configSchema: LongPressConfigSchema,
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [{ handle: 'next', label: 'Next' }],
  requiresDevice: true,
  execute: async (context) =>
    invokeTool(
      context,
      'longPress',
      'longPress',
      {
        selector: context.config.selector,
        // Zero tells the native side to use the platform threshold, since the
        // codegen spec cannot express an optional number.
        durationMs: context.config.durationMs ?? 0,
      },
      'long-pressing element',
    ),
});

export const swipeNode = defineNode({
  type: 'swipe',
  version: '1.0.0',
  kind: 'action',
  display: {
    label: 'Swipe',
    description: 'Scrolls the screen in a direction',
    icon: 'move-vertical',
    category: DEVICE_CATEGORY,
  },
  configSchema: SwipeConfigSchema,
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [{ handle: 'next', label: 'Next' }],
  requiresDevice: true,
  execute: async (context) =>
    invokeTool(
      context,
      'swipe',
      'swipe',
      {
        direction: context.config.direction,
        distanceFraction: context.config.distanceFraction,
      },
      `swiping ${context.config.direction}`,
    ),
});

export const typeTextNode = defineNode({
  type: 'typeText',
  version: '1.0.0',
  kind: 'action',
  display: {
    label: 'Type Text',
    description: 'Types into a field, with {{ variable }} support',
    icon: 'type',
    category: DEVICE_CATEGORY,
  },
  configSchema: TypeTextConfigSchema,
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [{ handle: 'next', label: 'Next' }],
  requiresDevice: true,
  execute: async (context) => {
    // Interpolated here rather than by the engine, because this is the one place a
    // workflow types free text and the surrounding words are literal.
    const text = interpolate(context.config.text, context, 'typeText');

    return invokeTool(
      context,
      'typeText',
      'typeText',
      { selector: context.config.selector, text },
      'typing text',
    );
  },
});

export const findElementNode = defineNode({
  type: 'findElement',
  version: '1.0.0',
  kind: 'action',
  display: {
    label: 'Find Element',
    description: 'Resolves a selector and reports what matched',
    icon: 'search',
    category: DEVICE_CATEGORY,
  },
  configSchema: SelectorConfigSchema,
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [{ handle: 'next', label: 'Next' }],
  requiresDevice: true,
  execute: async (context) =>
    invokeTool(
      context,
      'findElement',
      'findElement',
      { selector: context.config.selector },
      'finding element',
    ),
});

export const waitForElementNode = defineNode({
  type: 'waitForElement',
  version: '1.0.0',
  kind: 'action',
  display: {
    label: 'Wait For Element',
    description: 'Waits until an element appears',
    icon: 'hourglass',
    category: DEVICE_CATEGORY,
  },
  configSchema: WaitForElementConfigSchema,
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [{ handle: 'next', label: 'Next' }],
  requiresDevice: true,
  execute: async (context) =>
    invokeTool(
      context,
      'waitForElement',
      'waitForElement',
      { selector: context.config.selector, timeoutMs: context.config.timeoutMs },
      `waiting up to ${context.config.timeoutMs}ms for element`,
    ),
});

export const readScreenNode = defineNode({
  type: 'readScreen',
  version: '1.0.0',
  kind: 'action',
  display: {
    label: 'Read Screen',
    description: 'Captures the on-screen element hierarchy',
    icon: 'layout',
    category: DEVICE_CATEGORY,
  },
  configSchema: ReadScreenConfigSchema,
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [{ handle: 'next', label: 'Next' }],
  requiresDevice: true,
  execute: async (context) =>
    invokeTool(
      context,
      'readScreen',
      'getUiTree',
      { compact: context.config.compact },
      'reading the screen',
    ),
});

export const takeScreenshotNode = defineNode({
  type: 'takeScreenshot',
  version: '1.0.0',
  kind: 'action',
  display: {
    label: 'Screenshot',
    description: 'Captures the screen to a file',
    icon: 'camera',
    category: DEVICE_CATEGORY,
  },
  configSchema: NoArgumentConfigSchema,
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [{ handle: 'next', label: 'Next' }],
  requiresDevice: true,
  execute: async (context) =>
    invokeTool(context, 'takeScreenshot', 'takeScreenshot', {}, 'taking a screenshot'),
});

export const pressBackNode = defineNode({
  type: 'pressBack',
  version: '1.0.0',
  kind: 'action',
  display: {
    label: 'Back',
    description: 'Presses the system back button',
    icon: 'arrow-left',
    category: DEVICE_CATEGORY,
  },
  configSchema: NoArgumentConfigSchema,
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [{ handle: 'next', label: 'Next' }],
  requiresDevice: true,
  execute: async (context) => invokeTool(context, 'pressBack', 'pressBack', {}, 'pressing back'),
});

export const pressHomeNode = defineNode({
  type: 'pressHome',
  version: '1.0.0',
  kind: 'action',
  display: {
    label: 'Home',
    description: 'Goes to the home screen',
    icon: 'home',
    category: DEVICE_CATEGORY,
  },
  configSchema: NoArgumentConfigSchema,
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [{ handle: 'next', label: 'Next' }],
  requiresDevice: true,
  execute: async (context) => invokeTool(context, 'pressHome', 'pressHome', {}, 'going home'),
});

export const currentScreenNode = defineNode({
  type: 'currentScreen',
  version: '1.0.0',
  kind: 'action',
  display: {
    label: 'Current Screen',
    description: 'Reports the foreground app and screen',
    icon: 'monitor',
    category: DEVICE_CATEGORY,
  },
  configSchema: NoArgumentConfigSchema,
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [{ handle: 'next', label: 'Next' }],
  requiresDevice: true,
  execute: async (context) =>
    invokeTool(context, 'currentScreen', 'getCurrentScreen', {}, 'reading the current screen'),
});

export const notificationNode = defineNode({
  type: 'notification',
  version: '1.0.0',
  kind: 'action',
  display: {
    label: 'Notify',
    description: 'Posts a notification',
    icon: 'bell',
    category: DATA_CATEGORY,
  },
  configSchema: NotificationConfigSchema,
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [{ handle: 'next', label: 'Next' }],
  requiresDevice: true,
  execute: async (context) => {
    const title = interpolate(context.config.title, context, 'notification');
    const body = interpolate(context.config.body, context, 'notification');

    return invokeTool(
      context,
      'notification',
      'sendNotification',
      { title, body },
      'posting a notification',
    );
  },
});

export const contactNode = defineNode({
  type: 'contact',
  version: '1.0.0',
  kind: 'action',
  display: {
    label: 'Contacts',
    description: 'Lists or searches contacts',
    icon: 'users',
    category: DATA_CATEGORY,
  },
  configSchema: ContactsConfigSchema,
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [{ handle: 'next', label: 'Next' }],
  requiresDevice: true,
  execute: async (context) => {
    const { query, limit } = context.config;

    return query === undefined
      ? invokeTool(context, 'contact', 'getContacts', { limit }, 'reading contacts')
      : invokeTool(
          context,
          'contact',
          'findContacts',
          { query },
          `searching contacts for ${query}`,
        );
  },
});

export const clipboardReadNode = defineNode({
  type: 'clipboardRead',
  version: '1.0.0',
  kind: 'action',
  display: {
    label: 'Read Clipboard',
    description: 'Reads the clipboard, if the system allows it',
    icon: 'clipboard',
    category: DATA_CATEGORY,
  },
  configSchema: NoArgumentConfigSchema,
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [{ handle: 'next', label: 'Next' }],
  requiresDevice: true,
  execute: async (context) =>
    invokeTool(context, 'clipboardRead', 'readClipboard', {}, 'reading the clipboard'),
});

export const clipboardWriteNode = defineNode({
  type: 'clipboardWrite',
  version: '1.0.0',
  kind: 'action',
  display: {
    label: 'Write Clipboard',
    description: 'Puts text on the clipboard',
    icon: 'clipboard-copy',
    category: DATA_CATEGORY,
  },
  configSchema: ClipboardWriteConfigSchema,
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [{ handle: 'next', label: 'Next' }],
  requiresDevice: true,
  execute: async (context) => {
    const text = interpolate(context.config.text, context, 'clipboardWrite');

    return invokeTool(
      context,
      'clipboardWrite',
      'writeClipboard',
      { text },
      'writing the clipboard',
    );
  },
});

export const alarmNode = defineNode({
  type: 'alarm',
  version: '1.0.0',
  kind: 'action',
  display: {
    label: 'Set Alarm',
    description: 'Creates an alarm in the clock app',
    icon: 'alarm-clock',
    category: DATA_CATEGORY,
  },
  configSchema: AlarmConfigSchema,
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [{ handle: 'next', label: 'Next' }],
  requiresDevice: true,
  execute: async (context) => {
    const { hour, minute, label, repeatDays } = context.config;

    return invokeTool(
      context,
      'alarm',
      'createAlarm',
      { hour, minute, label, repeatDays, skipUi: true },
      `setting an alarm for ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    );
  },
});

export const mediaNode = defineNode({
  type: 'media',
  version: '1.0.0',
  kind: 'action',
  display: {
    label: 'Media Control',
    description: 'Controls whatever is currently playing',
    icon: 'play-circle',
    category: DATA_CATEGORY,
  },
  configSchema: MediaConfigSchema,
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [{ handle: 'next', label: 'Next' }],
  requiresDevice: true,
  execute: async (context) =>
    invokeTool(
      context,
      'media',
      'controlMedia',
      { command: context.config.command },
      `media ${context.config.command}`,
    ),
});

export const volumeNode = defineNode({
  type: 'volume',
  version: '1.0.0',
  kind: 'action',
  display: {
    label: 'Volume',
    description: 'Nudges the media volume up or down',
    icon: 'volume-2',
    category: DATA_CATEGORY,
  },
  configSchema: VolumeConfigSchema,
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [{ handle: 'next', label: 'Next' }],
  requiresDevice: true,
  execute: async (context) =>
    invokeTool(
      context,
      'volume',
      'adjustVolume',
      { direction: context.config.direction },
      `volume ${context.config.direction}`,
    ),
});

export const launchIntentNode = defineNode({
  type: 'launchIntent',
  version: '1.0.0',
  kind: 'action',
  display: {
    label: 'Launch Intent',
    description: 'Sends an Android intent',
    icon: 'external-link',
    category: 'Advanced',
  },
  configSchema: LaunchIntentConfigSchema,
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [{ handle: 'next', label: 'Next' }],
  requiresDevice: true,
  execute: async (context) => {
    const { action, dataUri, packageName, extras, requireChooser } = context.config;

    return invokeTool(
      context,
      'launchIntent',
      'launchIntent',
      { action, dataUri, packageName, extras, requireChooser },
      `launching ${action}`,
    );
  },
});

export const systemSettingNode = defineNode({
  type: 'systemSetting',
  version: '1.0.0',
  kind: 'action',
  display: {
    label: 'Read Setting',
    description: 'Reads a system setting value',
    icon: 'settings',
    category: 'Advanced',
  },
  configSchema: SystemSettingConfigSchema,
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [{ handle: 'next', label: 'Next' }],
  requiresDevice: true,
  execute: async (context) =>
    invokeTool(
      context,
      'systemSetting',
      'getSystemSetting',
      { key: context.config.key },
      `reading setting ${context.config.key}`,
    ),
});
