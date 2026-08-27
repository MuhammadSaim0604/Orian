package com.mobileautomation.automation

/**
 * Why a tool call failed.
 *
 * A sealed hierarchy rather than exceptions or error strings, for three reasons:
 * the AI agent must decide whether to retry, replan, or stop; the bridge maps
 * these onto typed TypeScript errors (Phase 3); and the workflow engine chooses a
 * retry policy per error kind. A stringly-typed error would make all three guess.
 */
sealed interface AutomationError {
    /** Stable identifier, mirrored by the TypeScript error union. */
    val code: String

    /** Message for logs and the user; never contains screen content. */
    val message: String

    /** Whether the same call could plausibly succeed if repeated. */
    val isRetryable: Boolean get() = false

    /** Whether the user must do something before a retry can work. */
    val needsUserAction: Boolean get() = false

    /** The accessibility service is not connected. The user must enable it. */
    data object AccessibilityUnavailable : AutomationError {
        override val code = "accessibility_unavailable"
        override val message =
            "The accessibility service is not enabled, so the screen cannot be read or acted on"
        override val needsUserAction = true
    }

    /** A sensitive permission is missing. The user must grant it. */
    data class PermissionDenied(
        val permission: String,
        val requiresSettingsScreen: Boolean,
    ) : AutomationError {
        override val code = "permission_denied"
        override val message = "Missing permission: $permission"
        override val needsUserAction = true
    }

    /**
     * The selector matched nothing.
     *
     * Retryable because the screen may still be loading - which is the single most
     * common cause - and carries the strategies tried so a failure is diagnosable.
     */
    data class ElementNotFound(
        val attemptedStrategies: List<String>,
        val detail: String,
    ) : AutomationError {
        override val code = "element_not_found"
        override val message = "Element not found: $detail"
        override val isRetryable = true
    }

    /** The gesture was dispatched but the system cancelled it. */
    data class GestureFailed(
        val detail: String,
        override val isRetryable: Boolean = true,
    ) : AutomationError {
        override val code = "gesture_failed"
        override val message = "Gesture failed: $detail"
    }

    /** The foreground window is `FLAG_SECURE`; no retry will ever succeed. */
    data object SecureScreen : AutomationError {
        override val code = "secure_screen"
        override val message =
            "This app blocks screenshots, so the screen cannot be captured"
    }

    /** Screen-capture consent has not been granted for this session. */
    data object CaptureConsentRequired : AutomationError {
        override val code = "capture_consent_required"
        override val message = "Screen capture needs your permission for this session"
        override val needsUserAction = true
    }

    /** A wait or dispatch exceeded its budget. */
    data class Timeout(
        val operation: String,
        val timeoutMs: Long,
    ) : AutomationError {
        override val code = "timeout"
        override val message = "$operation timed out after ${timeoutMs}ms"
        override val isRetryable = true
    }

    /** The caller passed something the tool cannot act on. Never retryable. */
    data class InvalidArgument(
        val detail: String,
    ) : AutomationError {
        override val code = "invalid_argument"
        override val message = "Invalid argument: $detail"
    }

    /** The tool ran but the underlying Android API refused or failed. */
    data class ToolFailed(
        val tool: String,
        val detail: String,
    ) : AutomationError {
        override val code = "tool_failed"
        override val message = "$tool failed: $detail"
    }

    /** Something unforeseen. Deliberately not retryable: the cause is unknown. */
    data class Unexpected(
        val detail: String,
    ) : AutomationError {
        override val code = "unexpected"
        override val message = "Unexpected failure: $detail"
    }
}
