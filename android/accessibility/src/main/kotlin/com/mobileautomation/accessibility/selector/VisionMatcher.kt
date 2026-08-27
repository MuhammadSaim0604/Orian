package com.mobileautomation.accessibility.selector

import com.mobileautomation.accessibility.model.Bounds

/**
 * The last step of the selector chain: find an element by looking at the screen.
 *
 * Vision is the documented seventh strategy (ADR 0009), reached only when every
 * structural clue has failed - which happens on canvas-rendered UIs, games, and
 * WebViews that expose no useful accessibility tree at all.
 *
 * It is an interface here rather than an implementation because matching needs a
 * screenshot and a model, both of which live above the accessibility layer: this
 * module must not depend on `screen` or on an AI provider. The resolver takes a
 * matcher when one is available and reports honestly when it is not, so the chain
 * is complete by construction instead of silently ending at coordinates.
 */
interface VisionMatcher {
    /**
     * True when a screenshot and model are available right now.
     *
     * Checked before attempting, so a run without screen-capture consent reports
     * "vision unavailable" rather than "element not found" - a different problem
     * with a different fix.
     */
    val isAvailable: Boolean

    /**
     * Locates the element [selector] describes by examining the screen.
     *
     * @return the bounds of the match, or null when nothing was found. Bounds
     *   rather than a node, because a vision match may have no corresponding
     *   accessibility node - that is precisely why vision was needed.
     */
    suspend fun locate(selector: Selector): VisionMatch?
}

/**
 * A region of the screen a vision matcher identified.
 *
 * [confidence] is carried through to the recorder: a low-confidence vision match
 * is the least durable step a workflow can contain, and the UI needs to be able
 * to say so rather than presenting it as equivalent to a resourceId match.
 */
data class VisionMatch(
    val bounds: Bounds,
    val confidence: Double,
    /** What the matcher believes it found, for logs and trace review. */
    val description: String? = null,
) {
    init {
        require(confidence in 0.0..1.0) { "confidence must be 0..1, was $confidence" }
    }

    val isConfident: Boolean get() = confidence >= CONFIDENT_THRESHOLD

    companion object {
        /**
         * Below this a match is reported but flagged. Deliberately high: acting on
         * a guess in someone else's app is worse than declining to act.
         */
        const val CONFIDENT_THRESHOLD: Double = 0.7
    }
}

/**
 * Stands in when no vision provider is configured.
 *
 * Exists so the resolver always has a matcher and the "vision was unavailable"
 * path is exercised in tests rather than being a null check.
 */
object UnavailableVisionMatcher : VisionMatcher {
    override val isAvailable: Boolean = false

    override suspend fun locate(selector: Selector): VisionMatch? = null
}
