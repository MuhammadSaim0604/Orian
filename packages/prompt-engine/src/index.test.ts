import { describe, expect, it } from 'vitest';

import { CONTEXT_KINDS, MESSAGE_ROLES, PACKAGE_NAME, isRedactedKey } from './index.js';

describe('prompt-engine', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@mobile-automation/prompt-engine');
  });

  it('supports the Chat Completions roles', () => {
    expect(MESSAGE_ROLES).toContain('system');
    expect(MESSAGE_ROLES).toContain('tool');
  });

  it('builds context for the agent, node config, and generation', () => {
    expect(CONTEXT_KINDS).toHaveLength(3);
  });

  it('redacts an api key regardless of casing', () => {
    expect(isRedactedKey('apiKey')).toBe(true);
    expect(isRedactedKey('APIKEY')).toBe(true);
  });

  it('leaves ordinary context keys alone', () => {
    expect(isRedactedKey('uiTree')).toBe(false);
  });
});
