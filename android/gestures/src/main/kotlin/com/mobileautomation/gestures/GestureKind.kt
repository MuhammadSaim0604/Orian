package com.mobileautomation.gestures

/**
 * A point on screen in device pixels.
 */
data class Point(val x: Int, val y: Int)

/**
 * Gesture kinds the engine dispatches through `AccessibilityService.dispatchGesture()`.
 *
 * Durations are defaults; callers may override. Implementations land in Phase 2.
 */
enum class GestureKind(val defaultDurationMs: Long) {
    TAP(60L),
    LONG_PRESS(600L),
    SWIPE(300L),
    ;

    companion object {
        /**
         * Android treats a press as "long" past roughly 500ms, so a long press
         * must stay above that threshold to register.
         */
        const val LONG_PRESS_THRESHOLD_MS: Long = 500L
    }
}

/**
 * Validates a gesture before it reaches the system. A zero or negative duration
 * is rejected, and a long press shorter than the system threshold would be
 * delivered as a tap, which is a silent correctness bug worth catching early.
 */
fun isValidDuration(kind: GestureKind, durationMs: Long): Boolean =
    when {
        durationMs <= 0L -> false
        kind == GestureKind.LONG_PRESS -> durationMs >= GestureKind.LONG_PRESS_THRESHOLD_MS
        else -> true
    }
