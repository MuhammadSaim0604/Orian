import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME, STEP_FIELDS, canGenerateWorkflowNode } from './index.js';

describe('execution-recorder', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@mobile-automation/execution-recorder');
  });

  it('captures the screen context alongside the action', () => {
    expect(STEP_FIELDS).toContain('uiHierarchy');
    expect(STEP_FIELDS).toContain('activity');
  });

  it('generates a node from a step carrying a selector and screen', () => {
    expect(canGenerateWorkflowNode(['action', 'selector', 'package', 'activity'])).toBe(true);
  });

  it('refuses to generate from coordinates alone', () => {
    expect(canGenerateWorkflowNode(['action', 'coordinates'])).toBe(false);
  });
});
