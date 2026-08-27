package com.mobileautomation.screen

/**
 * A captured screenshot, referenced by file path rather than carried inline.
 *
 * Passing bytes across the React Native bridge would block the JS thread on
 * every capture, and a full-resolution screen is several megabytes. The path is
 * handed over instead and the file read only where it is needed.
 */
data class Screenshot(
    val filePath: String,
    val widthPx: Int,
    val heightPx: Int,
    val capturedAtEpochMs: Long,
    val sizeBytes: Long = 0L,
    /** Package that was in the foreground, for correlating with a UI tree. */
    val packageName: String? = null,
) {
    val isLandscape: Boolean get() = widthPx > heightPx

    /** Longest edge, which is what downscaling for a model is based on. */
    val longestEdgePx: Int get() = maxOf(widthPx, heightPx)

    /** True when this capture already fits inside the model's input limit. */
    val fitsModelLimit: Boolean get() = longestEdgePx <= CapturePolicy.MAX_MODEL_IMAGE_EDGE_PX
}

/**
 * Outcome of a capture attempt.
 *
 * Screen capture fails for reasons the caller must distinguish: the user has not
 * consented this session, the foreground app has marked its window secure, or the
 * capture pipeline errored. Collapsing those into null would make the agent retry
 * things that can never succeed.
 */
sealed interface CaptureResult {
    data class Success(val screenshot: Screenshot) : CaptureResult

    /** The user has not granted a MediaProjection session. Ask, then retry. */
    data object ConsentRequired : CaptureResult

    /**
     * The window is `FLAG_SECURE` - banking apps, password managers, DRM video.
     * The capture surface yields black frames, so this is reported honestly
     * rather than returning a blank image the model would hallucinate over.
     */
    data object SecureWindow : CaptureResult

    data class Failed(val reason: String) : CaptureResult

    val screenshotOrNull: Screenshot? get() = (this as? Success)?.screenshot

    val isSuccess: Boolean get() = this is Success

    /** Whether asking the user for consent could make a retry succeed. */
    val needsUserAction: Boolean get() = this is ConsentRequired
}
