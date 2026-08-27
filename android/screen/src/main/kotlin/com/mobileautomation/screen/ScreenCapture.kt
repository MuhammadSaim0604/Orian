package com.mobileautomation.screen

/**
 * Captures the screen.
 *
 * An interface so the tool layer and the agent can be tested with a fake that
 * returns fixture images: MediaProjection needs a live consent token and a real
 * display, neither of which exists in a JVM test.
 */
interface ScreenCapture {
    /** True when a capture session is active and a screenshot can be taken now. */
    val isReady: Boolean

    suspend fun capture(): CaptureResult

    /** Releases the capture session. Called when automation stops. */
    fun release()
}
