package com.mobileautomation.accessibility.selector

import com.mobileautomation.accessibility.model.UiNode

/**
 * Outcome of resolving a [Selector] against a UI tree.
 *
 * Reporting *which* strategy matched is not a nicety: it tells the recorder how
 * durable the step was, lets the UI warn when automation has degraded to
 * coordinates, and makes failures diagnosable rather than mysterious.
 */
sealed interface ResolutionResult {
    data class Match(
        val node: UiNode,
        val strategy: SelectorStrategy,
        /** Structural path of the matched node, so the selector can be strengthened. */
        val structuralPath: String,
        /** Other nodes that also matched, when the selector was ambiguous. */
        val alternativeCount: Int = 0,
        /**
         * Present only for a vision match, which has bounds but may have no
         * accessibility node behind it - the reason vision was needed at all.
         */
        val visionMatch: VisionMatch? = null,
    ) : ResolutionResult {
        val isAmbiguous: Boolean get() = alternativeCount > 0

        /** True when the match relies on raw coordinates or vision. */
        val isFragile: Boolean
            get() = strategy == SelectorStrategy.COORDINATES || strategy == SelectorStrategy.VISION
    }

    /**
     * Nothing matched.
     *
     * [attempted] lists every strategy that was tried, which is what makes a
     * failure actionable - "resourceId and text both missed" is a different
     * problem from "the selector carried nothing to try".
     */
    data class NotFound(
        val attempted: List<SelectorStrategy>,
        val reason: String,
    ) : ResolutionResult

    val matchedNode: UiNode?
        get() = (this as? Match)?.node

    val isMatch: Boolean
        get() = this is Match
}
