package com.mobileautomation.accessibility.selector

import com.mobileautomation.accessibility.model.Bounds

/**
 * The sixth step of the selector chain: find an element by the text a recogniser read off the screen.
 *
 * Sits between relative position and raw coordinates (ADR 0013). Weaker than anything structural, because it
 * depends on pixels — but stronger than a coordinate, for a reason worth stating: a text match is **checkable**.
 * The string either matched or it did not, and the box comes from where that string actually is. A coordinate
 * cannot fail; it just lands somewhere and reports success.
 *
 * An interface here rather than an implementation for the same reason [VisionMatcher] is one: matching needs a
 * screenshot and a recogniser, and this module must not depend on `screen` or `ocr`. That is not tidiness —
 * ADR 0017 requires OCR to be independent of the accessibility tree, because the screens that need OCR are
 * exactly the ones whose tree is empty, and a circular dependency there would mean neither could be built
 * without the other.
 */
interface OcrMatcher {
    /**
     * True when a screenshot and a recogniser are available right now.
     *
     * Checked before attempting, so a run without screen-capture consent reports "OCR unavailable" rather than
     * "element not found" — a different problem, with a different fix, and one the user can act on.
     */
    val isAvailable: Boolean

    /**
     * Locates the text [selector] describes by recognising the screen.
     *
     * Uses the selector's `text` when it has one, since that is the only field OCR can look for: a resourceId
     * does not appear on screen and a structural path is not a thing a recogniser can see.
     *
     * @return where the text was found, or null when it was not on screen.
     */
    suspend fun locate(selector: Selector): OcrTextMatch?
}

/**
 * Text a recogniser found, and how confidently.
 *
 * [wasFuzzy] is carried separately from [confidence] because they answer different questions. Confidence is the
 * recogniser's view of how clearly it read the pixels; fuzziness is *our* view of how far the string had to be
 * bent to match. A crisply-recognised "Contlnue" matched against "Continue" is high confidence and fuzzy, and
 * the recorder needs to say so — that step will tap the wrong thing one day.
 */
data class OcrTextMatch(
    val bounds: Bounds,
    /** What the recogniser actually read, which may differ from what was asked for. */
    val recognisedText: String,
    /** 0..1, or null when the recogniser reports no confidence. */
    val confidence: Double? = null,
    /** True when the match tolerated a misread rather than being exact. */
    val wasFuzzy: Boolean = false,
) {
    init {
        require(confidence == null || confidence in 0.0..1.0) {
            "confidence must be 0..1, was $confidence"
        }
    }

    /** True when this match is as solid as OCR gets: read clearly and matched exactly. */
    val isStrong: Boolean get() = !wasFuzzy && (confidence == null || confidence >= CONFIDENT_THRESHOLD)

    companion object {
        /** Below this a match is reported but flagged, mirroring [VisionMatch]. */
        const val CONFIDENT_THRESHOLD: Double = 0.7
    }
}

/**
 * Stands in when OCR is not configured.
 *
 * Exists so the resolver always has a matcher and the "OCR was unavailable" path is a tested case rather than a
 * null check — the same decision as [UnavailableVisionMatcher], and for the same reason: a chain that silently
 * ends early is indistinguishable from a chain that tried and found nothing.
 */
object UnavailableOcrMatcher : OcrMatcher {
    override val isAvailable: Boolean = false

    override suspend fun locate(selector: Selector): OcrTextMatch? = null
}
