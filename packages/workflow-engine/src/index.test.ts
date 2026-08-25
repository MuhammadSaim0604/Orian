import { describe, expect, it } from 'vitest';

import { ERROR_BEHAVIOURS, NODE_STATES, PACKAGE_NAME, isTerminalState } from './index.js';

describe('workflow-engine', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@mobile-automation/workflow-engine');
  });

  it('treats a running node as non-terminal', () => {
    expect(isTerminalState('running')).toBe(false);
  });

  it('treats a failed node as terminal', () => {
    expect(isTerminalState('failed')).toBe(true);
  });

  it('declares the node lifecycle states', () => {
    expect(NODE_STATES).toContain('pending');
    expect(NODE_STATES).toContain('succeeded');
  });

  it('supports retry as an error behaviour', () => {
    expect(ERROR_BEHAVIOURS).toContain('retry');
  });
});
