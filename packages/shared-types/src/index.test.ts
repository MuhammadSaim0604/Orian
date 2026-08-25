import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME, err, ok } from './index.js';

describe('shared-types', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@mobile-automation/shared-types');
  });

  it('builds a successful result', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it('builds a failed result', () => {
    const failure = err(new Error('nope'));
    expect(failure.ok).toBe(false);
    if (!failure.ok) {
      expect(failure.error.message).toBe('nope');
    }
  });
});
