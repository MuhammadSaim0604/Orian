import { describe, expect, it } from 'vitest';

import { AGENT_PHASES, MAX_AGENT_STEPS, PACKAGE_NAME, shouldStop } from './index';

describe('ai-agent', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@mobile-automation/ai-agent');
  });

  it('models the full loop including replanning', () => {
    expect(AGENT_PHASES).toContain('observe');
    expect(AGENT_PHASES).toContain('replan');
  });

  it('keeps running while acting within budget', () => {
    expect(shouldStop('acting', 1)).toBe(false);
  });

  it('stops when the goal is done', () => {
    expect(shouldStop('done', 1)).toBe(true);
  });

  it('stops when the step budget is exhausted', () => {
    expect(shouldStop('acting', MAX_AGENT_STEPS)).toBe(true);
  });
});
