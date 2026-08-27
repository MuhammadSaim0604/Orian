package com.mobileautomation.gestures

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.os.Build
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

/**
 * Dispatches gestures through `AccessibilityService.dispatchGesture()`.
 *
 * The platform API is callback-based and can hang indefinitely if the system
 * never delivers a verdict, so this wraps it in a cancellable coroutine with a
 * timeout. Without the timeout a single swallowed gesture would stall a whole
 * workflow.
 *
 * Not unit-tested on the JVM - `GestureDescription` and `Path` need a real
 * framework. Covered by instrumentation tests instead; the logic worth testing
 * lives in [GestureBuilder] and [GestureEngine], which are pure.
 */
class AccessibilityGestureDispatcher(
    private val service: AccessibilityService,
    private val isServiceConnected: () -> Boolean = { true },
) : GestureDispatcher {
    override val isAvailable: Boolean
        get() = isServiceConnected()

    override suspend fun dispatch(spec: GestureSpec): GestureOutcome {
        if (!isAvailable) return GestureOutcome.Unavailable

        val description =
            buildDescription(spec)
                ?: return GestureOutcome.Failed("Could not build a gesture description for $spec")

        // Allow the gesture its own duration plus headroom for the system to
        // report back, then give up rather than blocking the caller forever.
        val timeoutMs = spec.durationMs + CALLBACK_GRACE_MS

        return withTimeoutOrNull(timeoutMs) {
            suspendCancellableCoroutine { continuation ->
                val callback =
                    object : AccessibilityService.GestureResultCallback() {
                        override fun onCompleted(gestureDescription: GestureDescription?) {
                            if (continuation.isActive) continuation.resume(GestureOutcome.Completed)
                        }

                        override fun onCancelled(gestureDescription: GestureDescription?) {
                            if (continuation.isActive) continuation.resume(GestureOutcome.Cancelled)
                        }
                    }

                val accepted = service.dispatchGesture(description, callback, null)
                if (!accepted && continuation.isActive) {
                    // The service refused outright: usually a malformed path or a
                    // gesture arriving while another is still in flight.
                    continuation.resume(GestureOutcome.Failed("dispatchGesture returned false"))
                }
            }
        } ?: GestureOutcome.Failed("Gesture timed out after ${timeoutMs}ms")
    }

    private fun buildDescription(spec: GestureSpec): GestureDescription? =
        runCatching {
            val path =
                Path().apply {
                    val first = spec.path.first()
                    moveTo(first.x.toFloat(), first.y.toFloat())
                    for (point in spec.path.drop(1)) {
                        lineTo(point.x.toFloat(), point.y.toFloat())
                    }
                }

            val stroke =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    GestureDescription.StrokeDescription(path, START_DELAY_MS, spec.durationMs, false)
                } else {
                    GestureDescription.StrokeDescription(path, START_DELAY_MS, spec.durationMs)
                }

            GestureDescription.Builder().addStroke(stroke).build()
        }.getOrNull()

    private companion object {
        /** Dispatch immediately; the caller already decided when to act. */
        const val START_DELAY_MS = 0L

        /**
         * Headroom for the system to deliver its callback after the gesture's own
         * duration elapses. Generous because a loaded device can be slow to
         * report, and a false timeout looks like a failed tap.
         */
        const val CALLBACK_GRACE_MS = 2_000L
    }
}
