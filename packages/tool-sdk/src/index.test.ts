import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME, TOOL_NAMES, isToolName } from './index.js';

describe('tool-sdk', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@mobile-automation/tool-sdk');
  });

  it('declares the core screen and gesture tools', () => {
    expect(TOOL_NAMES).toContain('click');
    expect(TOOL_NAMES).toContain('getUiTree');
    expect(TOOL_NAMES).toContain('takeScreenshot');
  });

  it('declares device API tools beyond the screen', () => {
    expect(TOOL_NAMES).toContain('getContacts');
    expect(TOOL_NAMES).toContain('createAlarm');
  });

  it('declares the media playback tools', () => {
    // Control only: reading what is playing needs notification-listener access,
    // which the permission model does not authorise.
    expect(TOOL_NAMES).toContain('controlMedia');
    expect(TOOL_NAMES).toContain('adjustVolume');
  });

  it('matches the Kotlin DeviceTool vocabulary', () => {
    // Mirrors DeviceTool in android/automation, where a parity test restates this
    // list. Both sides must change together or the AI can name a tool it cannot
    // call (ADR 0008).
    expect(TOOL_NAMES).toEqual([
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
    ]);
  });

  it('has no duplicate tool names', () => {
    expect(new Set(TOOL_NAMES).size).toBe(TOOL_NAMES.length);
  });

  it('rejects an unknown tool name', () => {
    expect(isToolName('formatHardDrive')).toBe(false);
  });
});
