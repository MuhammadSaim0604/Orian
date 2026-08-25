import { describe, expect, it } from 'vitest';

import { NODE_TO_TOOL, PACKAGE_NAME, everyNodeMapsToAKnownTool, toolForNode } from './index.js';

describe('android-nodes', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@mobile-automation/android-nodes');
  });

  it('maps every node to a tool the runtime exposes', () => {
    expect(everyNodeMapsToAKnownTool()).toBe(true);
  });

  it('routes readScreen through the UI tree tool', () => {
    expect(toolForNode('readScreen')).toBe('getUiTree');
  });

  it('routes click through the click tool', () => {
    expect(toolForNode('click')).toBe('click');
  });

  it('declares at least the gesture and app-launch nodes', () => {
    expect(Object.keys(NODE_TO_TOOL)).toEqual(
      expect.arrayContaining(['click', 'swipe', 'typeText', 'openApp']),
    );
  });
});
