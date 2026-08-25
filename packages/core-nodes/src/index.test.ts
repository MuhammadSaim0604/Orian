import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME, PROVIDED_KINDS, providesKind } from './index.js';

describe('core-nodes', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@mobile-automation/core-nodes');
  });

  it('covers all seven generic node kinds', () => {
    expect(PROVIDED_KINDS).toHaveLength(7);
  });

  it('provides the condition kind used for branching', () => {
    expect(providesKind('condition')).toBe(true);
  });

  it('provides the loop kind used for iteration', () => {
    expect(providesKind('loop')).toBe(true);
  });
});
