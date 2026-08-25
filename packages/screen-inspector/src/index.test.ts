import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME, UI_NODE_ATTRIBUTES, centreOf, isTappable } from './index.js';

describe('screen-inspector', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@mobile-automation/screen-inspector');
  });

  it('serializes the attributes selectors depend on', () => {
    expect(UI_NODE_ATTRIBUTES).toContain('resourceId');
    expect(UI_NODE_ATTRIBUTES).toContain('contentDescription');
  });

  it('computes the centre of an element', () => {
    expect(centreOf({ left: 100, top: 700, right: 900, bottom: 850 })).toEqual({
      x: 500,
      y: 775,
    });
  });

  it('treats a zero-area element as untappable', () => {
    expect(isTappable({ left: 10, top: 10, right: 10, bottom: 10 })).toBe(false);
  });

  it('treats a normal element as tappable', () => {
    expect(isTappable({ left: 0, top: 0, right: 100, bottom: 50 })).toBe(true);
  });
});
