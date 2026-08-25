import { describe, expect, it } from 'vitest';

import {
  ANONYMOUS_ACCESS_ALLOWED,
  DEFAULT_BIND_HOST,
  PACKAGE_NAME,
  isLoopbackHost,
  isSafeBinding,
} from './index.js';

describe('mcp-server', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@mobile-automation/mcp-server');
  });

  it('defaults to loopback', () => {
    expect(isLoopbackHost(DEFAULT_BIND_HOST)).toBe(true);
  });

  it('never allows anonymous access', () => {
    expect(ANONYMOUS_ACCESS_ALLOWED).toBe(false);
  });

  it('accepts a loopback binding without extra consent', () => {
    expect(
      isSafeBinding({ host: '127.0.0.1', port: 7777, networkExposureAcknowledged: false }),
    ).toBe(true);
  });

  it('rejects a wildcard binding without explicit consent', () => {
    expect(isSafeBinding({ host: '0.0.0.0', port: 7777, networkExposureAcknowledged: false })).toBe(
      false,
    );
  });

  it('allows a network binding once the user has acknowledged the risk', () => {
    expect(isSafeBinding({ host: '0.0.0.0', port: 7777, networkExposureAcknowledged: true })).toBe(
      true,
    );
  });
});
