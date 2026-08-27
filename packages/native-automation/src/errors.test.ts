import { describe, expect, it } from 'vitest';

import {
  AUTOMATION_ERROR_CODES,
  AutomationError,
  bridgeUnavailableError,
  isAutomationError,
  isAutomationErrorCode,
  toAutomationError,
} from './errors';

describe('AutomationError', () => {
  it('carries the code and message', () => {
    const error = new AutomationError('element_not_found', 'Element not found: Send');

    expect(error.code).toBe('element_not_found');
    expect(error.message).toBe('Element not found: Send');
    expect(error.name).toBe('AutomationError');
  });

  it('is recognisable with instanceof after transpilation', () => {
    // Subclassing a built-in loses the prototype chain when transpiled, so the
    // constructor restores it. Without that, catch blocks silently miss.
    const error = new AutomationError('unexpected', 'boom');

    expect(error).toBeInstanceOf(AutomationError);
    expect(error).toBeInstanceOf(Error);
    expect(isAutomationError(error)).toBe(true);
  });

  it('treats a missing element as retryable because the screen may still be loading', () => {
    expect(new AutomationError('element_not_found', 'x').isRetryable).toBe(true);
  });

  it('treats a timeout and a cancelled gesture as retryable', () => {
    expect(new AutomationError('timeout', 'x').isRetryable).toBe(true);
    expect(new AutomationError('gesture_failed', 'x').isRetryable).toBe(true);
  });

  it('does not retry an invalid argument', () => {
    expect(new AutomationError('invalid_argument', 'x').isRetryable).toBe(false);
  });

  it('does not retry or prompt for a secure screen', () => {
    // A banking app will never be capturable, so prompting would be nagging the
    // user about something they cannot change.
    const error = new AutomationError('secure_screen', 'x');

    expect(error.isRetryable).toBe(false);
    expect(error.needsUserAction).toBe(false);
  });

  it('flags the errors the user can actually fix', () => {
    expect(new AutomationError('accessibility_unavailable', 'x').needsUserAction).toBe(true);
    expect(new AutomationError('permission_denied', 'x').needsUserAction).toBe(true);
    expect(new AutomationError('capture_consent_required', 'x').needsUserAction).toBe(true);
  });

  it('keeps detail from the native side', () => {
    const error = new AutomationError('element_not_found', 'x', {
      attemptedStrategies: ['resourceId', 'text'],
    });

    expect(error.detail.attemptedStrategies).toEqual(['resourceId', 'text']);
  });

  it('defaults detail to an empty object rather than undefined', () => {
    expect(new AutomationError('unexpected', 'x').detail).toEqual({});
  });
});

describe('error codes', () => {
  it('mirrors the Kotlin AutomationError codes', () => {
    // These are a wire contract: BridgeErrors on the Kotlin side produces them,
    // and both lists must be changed together.
    expect(AUTOMATION_ERROR_CODES).toContain('accessibility_unavailable');
    expect(AUTOMATION_ERROR_CODES).toContain('permission_denied');
    expect(AUTOMATION_ERROR_CODES).toContain('element_not_found');
    expect(AUTOMATION_ERROR_CODES).toContain('gesture_failed');
    expect(AUTOMATION_ERROR_CODES).toContain('secure_screen');
    expect(AUTOMATION_ERROR_CODES).toContain('capture_consent_required');
    expect(AUTOMATION_ERROR_CODES).toContain('timeout');
    expect(AUTOMATION_ERROR_CODES).toContain('invalid_argument');
    expect(AUTOMATION_ERROR_CODES).toContain('tool_failed');
    expect(AUTOMATION_ERROR_CODES).toContain('unexpected');
  });

  it('adds the two codes only the bridge can produce', () => {
    expect(AUTOMATION_ERROR_CODES).toContain('bridge_unavailable');
    expect(AUTOMATION_ERROR_CODES).toContain('bridge_protocol');
  });

  it('has no duplicates', () => {
    expect(new Set(AUTOMATION_ERROR_CODES).size).toBe(AUTOMATION_ERROR_CODES.length);
  });

  it('recognises a valid code', () => {
    expect(isAutomationErrorCode('timeout')).toBe(true);
    expect(isAutomationErrorCode('not_a_code')).toBe(false);
  });
});

describe('toAutomationError', () => {
  it('returns an AutomationError unchanged', () => {
    const original = new AutomationError('timeout', 'took too long');
    expect(toAutomationError(original)).toBe(original);
  });

  it('recovers the code from a flattened native rejection', () => {
    // React Native flattens a promise rejection into an Error whose `code` holds
    // the native error code, so the type is gone and only the shape remains.
    const nativeRejection = { code: 'secure_screen', message: 'This app blocks screenshots' };

    const error = toAutomationError(nativeRejection);

    expect(error.code).toBe('secure_screen');
    expect(error.message).toBe('This app blocks screenshots');
    expect(isAutomationError(error)).toBe(true);
  });

  it('falls back to unexpected for an unrecognised code', () => {
    const error = toAutomationError({ code: 'something_new', message: 'hmm' });

    expect(error.code).toBe('unexpected');
    expect(error.message).toBe('hmm');
  });

  it('supplies a message when the native side sent none', () => {
    const error = toAutomationError({ code: 'timeout' });

    expect(error.code).toBe('timeout');
    expect(error.message).toContain('timeout');
  });

  it('ignores an empty message rather than surfacing a blank error', () => {
    expect(toAutomationError({ code: 'timeout', message: '' }).message).not.toBe('');
  });

  it('keeps structured detail when present', () => {
    const error = toAutomationError({
      code: 'element_not_found',
      message: 'not found',
      detail: { attemptedStrategies: ['text'] },
    });

    expect(error.detail).toEqual({ attemptedStrategies: ['text'] });
  });

  it('converts a thrown string', () => {
    const error = toAutomationError('something broke');

    expect(error.code).toBe('unexpected');
    expect(error.message).toBe('something broke');
  });

  it('converts null and undefined without throwing', () => {
    expect(toAutomationError(null).code).toBe('unexpected');
    expect(toAutomationError(undefined).code).toBe('unexpected');
  });

  it('converts a plain Error', () => {
    const error = toAutomationError(new Error('kaboom'));

    expect(error.code).toBe('unexpected');
    expect(error.message).toBe('kaboom');
  });

  it('never leaves a caller with an untyped failure', () => {
    // The point of the conversion: whatever crosses the bridge, the caller can
    // branch on code, isRetryable, and needsUserAction.
    for (const value of [null, undefined, 42, 'text', {}, new Error('x'), Symbol('s')]) {
      const error = toAutomationError(value);
      expect(isAutomationError(error)).toBe(true);
      expect(typeof error.isRetryable).toBe('boolean');
      expect(typeof error.needsUserAction).toBe('boolean');
    }
  });
});

describe('bridgeUnavailableError', () => {
  it('explains that the native module is missing', () => {
    const error = bridgeUnavailableError();

    expect(error.code).toBe('bridge_unavailable');
    expect(error.message).toContain('not available');
  });

  it('is not retryable, because a missing module will not appear', () => {
    expect(bridgeUnavailableError().isRetryable).toBe(false);
  });
});
