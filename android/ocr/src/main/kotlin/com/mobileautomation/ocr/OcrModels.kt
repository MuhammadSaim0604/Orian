package com.mobileautomation.ocr

// What OCR found on a screen.
//
// The whole point is that each piece of text arrives WITH its position. Recognised text without coordinates
// cannot be tapped, which is the only reason the agent runs OCR at all - so bounds are not optional metadata
// here, they are the payload.

/**
 * A rectangle in screen pixels.
 *
 * Declared here rather than reused from `accessibility`'s `Bounds` on purpose: this module must not depend on
 * that one (ADR 0017), because OCR is an independent way of seeing and coupling them would make the fallback
 * chain circular. The duplication is four integers, and the conversion happens where the two meet.
 */
data class OcrBounds(
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int,
) {
    init {
        require(right >= left) { "right ($right) cannot be left of left ($left)" }
        require(bottom >= top) { "bottom ($bottom) cannot be above top ($top)" }
    }

    val width: Int get() = right - left

    val height: Int get() = bottom - top

    val centerX: Int get() = left + width / 2

    val centerY: Int get() = top + height / 2

    val area: Int get() = width * height

    /** True when this box has no area, which a recogniser can occasionally return. */
    val isEmpty: Boolean get() = width <= 0 || height <= 0

    /**
     * Scales this box by [scaleX] and [scaleY].
     *
     * **The trap this exists to close.** A screenshot may be captured at a different resolution from the one
     * the accessibility tree describes — MediaProjection mirrors at the display's size, but a downscaled
     * capture is normal and the tree's coordinates never change. A box used unscaled lands *slightly* wrong,
     * which is worse than landing obviously wrong: the tap reports success and hits the row above.
     *
     * Rounded rather than truncated, so a centre point stays a centre point rather than drifting up and left.
     */
    fun scaled(
        scaleX: Double,
        scaleY: Double,
    ): OcrBounds =
        OcrBounds(
            left = Math.round(left * scaleX).toInt(),
            top = Math.round(top * scaleY).toInt(),
            right = Math.round(right * scaleX).toInt(),
            bottom = Math.round(bottom * scaleY).toInt(),
        )

    /** True when [x], [y] falls inside this box. */
    fun contains(
        x: Int,
        y: Int,
    ): Boolean = x in left..right && y in top..bottom
}

/**
 * One recognised piece of text.
 *
 * ML Kit reports a hierarchy of blocks, lines and elements. This is deliberately flattened to **lines**,
 * because a line is the unit a person points at: a block can be a whole paragraph and an element is a single
 * word, and neither answers "where do I tap to press Continue".
 */
data class OcrTextBlock(
    val text: String,
    val bounds: OcrBounds,
    /**
     * Recogniser confidence, 0..1, or null when the engine does not report one.
     *
     * Nullable rather than defaulted to 1.0, because ML Kit omits confidence for some recognisers and
     * inventing a perfect score would let a caller trust something it was never told.
     */
    val confidence: Double? = null,
    /** BCP-47 language tag the recogniser inferred, when it reports one. */
    val language: String? = null,
) {
    init {
        require(confidence == null || confidence in 0.0..1.0) {
            "confidence must be 0..1, was $confidence"
        }
    }

    /** A point that can be tapped to hit this text. */
    val centerX: Int get() = bounds.centerX

    val centerY: Int get() = bounds.centerY

    /** Normalised for comparison: collapsed whitespace, trimmed, lowercased. */
    val normalisedText: String get() = text.trim().replace(WHITESPACE, " ").lowercase()

    private companion object {
        val WHITESPACE = Regex("\\s+")
    }
}

/**
 * Everything recognised on one screen.
 *
 * Carries the source dimensions so a caller can tell whether the boxes were scaled and by how much. A result
 * that silently lost that context is one nobody can debug when a tap lands wrong.
 */
data class OcrResult(
    val blocks: List<OcrTextBlock>,
    /** Width the boxes are expressed in, after any scaling. */
    val screenWidthPx: Int,
    val screenHeightPx: Int,
    /** How long recognition took, so a slow device shows up in a trace rather than as a stall. */
    val durationMs: Long = 0L,
) {
    val isEmpty: Boolean get() = blocks.isEmpty()

    val blockCount: Int get() = blocks.size

    /** All recognised text as one string, for a caller that just wants to read the screen. */
    val fullText: String get() = blocks.joinToString("\n") { it.text }

    companion object {
        fun empty(
            screenWidthPx: Int = 0,
            screenHeightPx: Int = 0,
        ): OcrResult = OcrResult(blocks = emptyList(), screenWidthPx = screenWidthPx, screenHeightPx = screenHeightPx)
    }
}

/**
 * Outcome of an OCR attempt.
 *
 * A sealed result rather than a nullable one, for the same reason `CaptureResult` is: the caller must
 * distinguish "there is no text on this screen" from "OCR could not run". The first is an answer the agent can
 * act on — descend to vision, or report that the screen is blank. The second means asking again will fail the
 * same way until something changes.
 */
sealed interface OcrOutcome {
    data class Success(val result: OcrResult) : OcrOutcome

    /**
     * The screen could not be captured.
     *
     * Carries the reason from the capture layer verbatim, because "you have not granted screen recording" and
     * "this app blocks capture" need different responses and OCR has no business paraphrasing either.
     */
    data class CaptureFailed(val reason: String) : OcrOutcome

    /** Recognition itself failed — a corrupt bitmap, or the recogniser erroring. */
    data class RecognitionFailed(val reason: String) : OcrOutcome

    val resultOrNull: OcrResult? get() = (this as? Success)?.result

    val isSuccess: Boolean get() = this is Success
}
