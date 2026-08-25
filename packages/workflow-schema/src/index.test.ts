import { describe, expect, it } from 'vitest';

import {
  BoundsSchema,
  PACKAGE_NAME,
  SELECTOR_STRATEGIES,
  SelectorStrategySchema,
  strategyRank,
} from './index.js';

describe('workflow-schema', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@mobile-automation/workflow-schema');
  });

  it('ranks resourceId above coordinates', () => {
    expect(strategyRank('resourceId')).toBeLessThan(strategyRank('coordinates'));
  });

  it('treats vision as the last resort', () => {
    expect(strategyRank('vision')).toBe(SELECTOR_STRATEGIES.length - 1);
  });

  it('accepts a known selector strategy', () => {
    expect(SelectorStrategySchema.parse('text')).toBe('text');
  });

  it('rejects an unknown selector strategy', () => {
    expect(SelectorStrategySchema.safeParse('telepathy').success).toBe(false);
  });

  it('validates element bounds', () => {
    const bounds = BoundsSchema.parse({ left: 100, top: 700, right: 900, bottom: 850 });
    expect(bounds.right - bounds.left).toBe(800);
  });

  it('rejects non-integer bounds', () => {
    expect(BoundsSchema.safeParse({ left: 0.5, top: 0, right: 1, bottom: 1 }).success).toBe(false);
  });
});
