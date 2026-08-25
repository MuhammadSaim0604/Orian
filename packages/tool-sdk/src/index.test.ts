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

  it('has no duplicate tool names', () => {
    expect(new Set(TOOL_NAMES).size).toBe(TOOL_NAMES.length);
  });

  it('rejects an unknown tool name', () => {
    expect(isToolName('formatHardDrive')).toBe(false);
  });
});
