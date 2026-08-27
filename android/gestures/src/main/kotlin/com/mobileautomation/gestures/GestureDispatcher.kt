package com.mobileautomation.gestures

/**
 * Dispatches a gesture to the system.
 *
 * An interface so the gesture engine can be unit-tested with a recording fake:
 * the real implementation needs a live `AccessibilityService`, which cannot exist
 * off-device.
 */
interface GestureDispatcher {
    /** True when gestures can currently be dispatched. */
    val isAvailable: Boolean

    /**
     * Dispatches [spec] and waits for the system's verdict.
     *
     * Returns whether the gesture completed. A gesture can be cancelled by the
     * system - another app taking focus, a competing touch, a secure window - and
     * that is a normal outcome to handle rather than an exception.
     */
    suspend fun dispatch(spec: GestureSpec): GestureOutcome
}

/**
 * Result of a dispatch attempt.
 *
 * A sealed hierarchy rather than a boolean, because the three failure modes call
 * for different responses: retry, wait for the service, or give up.
 */
sealed interface GestureOutcome {
    data object Completed : GestureOutcome

    /** The system cancelled the gesture; usually worth one retry. */
    data object Cancelled : GestureOutcome

    /** The accessibility service is not connected, so nothing was attempted. */
    data object Unavailable : GestureOutcome

    /** The gesture was rejected or timed out. */
    data class Failed(val reason: String) : GestureOutcome

    val isSuccess: Boolean get() = this is Completed

    /** Whether retrying could plausibly succeed. */
    val isRetryable: Boolean get() = this is Cancelled
}
