/**
 * Error codes the Kotlin layer reports.
 *
 * Mirrors `AutomationError.code` in `android/automation`. The codes are a wire
 * contract: the Kotlin side returns them as data rather than throwing, and this
 * list is what lets TypeScript branch on the cause instead of parsing messages.
 */
export const AUTOMATION_ERROR_CODES = [
  'accessibility_unavailable',
  'permission_denied',
  'element_not_found',
  'gesture_failed',
  'secure_screen',
  'capture_consent_required',
  'timeout',
  'invalid_argument',
  'tool_failed',
  'unexpected',
  /** Added by the bridge: the native module is not linked into this build. */
  'bridge_unavailable',
  /** Added by the bridge: the native side returned something unreadable. */
  'bridge_protocol',
] as const;

export type AutomationErrorCode = (typeof AUTOMATION_ERROR_CODES)[number];

/**
 * Codes worth retrying.
 *
 * `element_not_found` is here because the overwhelmingly common cause is a screen
 * that has not finished loading, not an element that will never exist.
 */
const RETRYABLE_CODES = new Set<AutomationErrorCode>([
  'element_not_found',
  'gesture_failed',
  'timeout',
]);

/**
 * Codes the user can fix.
 *
 * Deliberately excludes `secure_screen`: a banking app will never be capturable,
 * so prompting would be nagging the user over something they cannot change.
 */
const USER_ACTIONABLE_CODES = new Set<AutomationErrorCode>([
  'accessibility_unavailable',
  'permission_denied',
  'capture_consent_required',
]);

/**
 * A failure from the native automation layer.
 *
 * A class rather than a plain object so `instanceof` works and stack traces point
 * at the calling code. The retry and user-action flags mirror the Kotlin
 * `AutomationError` exactly, so the agent loop and workflow engine make the same
 * decision on either side of the bridge.
 */
export class AutomationError extends Error {
  readonly code: AutomationErrorCode;

  /** Whether the same call could plausibly succeed if repeated. */
  readonly isRetryable: boolean;

  /** Whether the user must grant something before a retry can work. */
  readonly needsUserAction: boolean;

  /** Extra context from the native side, e.g. the strategies a selector tried. */
  readonly detail: Record<string, unknown>;

  constructor(code: AutomationErrorCode, message: string, detail: Record<string, unknown> = {}) {
    super(message);
    this.name = 'AutomationError';
    this.code = code;
    this.isRetryable = RETRYABLE_CODES.has(code);
    this.needsUserAction = USER_ACTIONABLE_CODES.has(code);
    this.detail = detail;

    // Restores the prototype chain, which is lost when a built-in is subclassed
    // and transpiled down. Without this, `instanceof AutomationError` is false.
    Object.setPrototypeOf(this, AutomationError.prototype);
  }
}

export const isAutomationError = (value: unknown): value is AutomationError =>
  value instanceof AutomationError;

export const isAutomationErrorCode = (value: string): value is AutomationErrorCode =>
  (AUTOMATION_ERROR_CODES as readonly string[]).includes(value);

/**
 * Turns whatever the native side rejected with into a typed error.
 *
 * React Native flattens a rejected promise into an `Error` whose `code` carries
 * the native error code, so the code has to be recovered from the shape rather
 * than the type. Anything unrecognised becomes `unexpected` rather than being
 * rethrown raw, so callers never have to handle an untyped failure.
 */
export const toAutomationError = (value: unknown): AutomationError => {
  if (isAutomationError(value)) return value;

  if (typeof value === 'object' && value !== null) {
    const candidate = value as { code?: unknown; message?: unknown; detail?: unknown };

    const code =
      typeof candidate.code === 'string' && isAutomationErrorCode(candidate.code)
        ? candidate.code
        : 'unexpected';

    const message =
      typeof candidate.message === 'string' && candidate.message.length > 0
        ? candidate.message
        : `Native automation call failed (${code})`;

    const detail =
      typeof candidate.detail === 'object' && candidate.detail !== null
        ? (candidate.detail as Record<string, unknown>)
        : {};

    return new AutomationError(code, message, detail);
  }

  if (typeof value === 'string') {
    return new AutomationError('unexpected', value);
  }

  return new AutomationError('unexpected', 'Native automation call failed');
};

/** The error used when the native module is missing from the running app. */
export const bridgeUnavailableError = (): AutomationError =>
  new AutomationError(
    'bridge_unavailable',
    'The native automation module is not available. This build does not include ' +
      'the Android automation layer, or the app is running outside React Native.',
  );
