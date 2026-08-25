package com.mobileautomation.screen

/**
 * Screen capture policy.
 *
 * Screenshots are written to app-private storage and referenced by path; the
 * bytes are never passed inline across the React Native bridge, because that
 * would block the JS thread (see Phase 3).
 *
 * MediaProjection consent is per-session by design - the app does not attempt
 * to persist a capture token (conventions/Permission_Model.md).
 */
object CapturePolicy {
    /** Screenshots are referenced by file path across the bridge, not inlined. */
    const val PASS_BY_REFERENCE: Boolean = true

    /** A capture token is never persisted across process restarts. */
    const val PERSIST_PROJECTION_TOKEN: Boolean = false

    /** Image format written to disk. PNG keeps text legible for the model. */
    const val IMAGE_FORMAT: String = "png"

    /**
     * Largest edge, in pixels, a screenshot is downscaled to before being sent
     * to a model. Full-resolution captures waste tokens without improving
     * recognition.
     */
    const val MAX_MODEL_IMAGE_EDGE_PX: Int = 1280

    /** Downscale factor to fit [MAX_MODEL_IMAGE_EDGE_PX], or 1.0 when it already fits. */
    fun scaleFactorFor(widthPx: Int, heightPx: Int): Double {
        val longestEdge = maxOf(widthPx, heightPx)
        if (longestEdge <= MAX_MODEL_IMAGE_EDGE_PX) return 1.0
        return MAX_MODEL_IMAGE_EDGE_PX.toDouble() / longestEdge.toDouble()
    }
}
