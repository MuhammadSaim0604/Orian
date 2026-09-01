package com.mobileautomation.ocr

import android.graphics.Bitmap

/**
 * Recognises text in a bitmap.
 *
 * An interface so everything above it is testable without a device: ML Kit needs a real recogniser and a real
 * image, neither of which exists in a JVM test, and the rules worth testing — matching, scaling, ordering —
 * are all above this line.
 */
interface TextRecogniser {
    /** True when recognition can run now. Bundled model, so this is effectively always true (ADR 0017). */
    val isAvailable: Boolean

    /**
     * Recognises text in [bitmap].
     *
     * @param scaleToWidthPx when set with [scaleToHeightPx], boxes are scaled into that coordinate space.
     *   This is how OCR results become tappable: the bitmap may be a different size from the display the
     *   accessibility tree describes, and an unscaled box lands slightly wrong while reporting success.
     */
    suspend fun recognise(
        bitmap: Bitmap,
        scaleToWidthPx: Int? = null,
        scaleToHeightPx: Int? = null,
    ): OcrOutcome

    /** Releases the recogniser. ML Kit holds native resources that outlive garbage collection. */
    fun close()
}

/**
 * Scaling between a captured bitmap and the coordinate space taps happen in.
 *
 * Its own object because this is the single most likely thing to be wrong in the whole OCR path, and it fails
 * silently: an unscaled or wrongly-scaled box produces a tap that lands near the target, so the tool reports
 * success and something else gets pressed. Keeping the arithmetic in one tested place is the same decision as
 * `StructuralPath` — two copies of a transform will eventually disagree.
 */
object OcrScaling {
    /**
     * Scales [blocks] from a [sourceWidthPx] × [sourceHeightPx] bitmap into [targetWidthPx] × [targetHeightPx].
     *
     * Returns the blocks unchanged when the spaces already match, which is the common case: MediaProjection
     * usually mirrors at display resolution, and skipping the arithmetic avoids rounding a coordinate that was
     * already exact.
     */
    fun scaleBlocks(
        blocks: List<OcrTextBlock>,
        sourceWidthPx: Int,
        sourceHeightPx: Int,
        targetWidthPx: Int,
        targetHeightPx: Int,
    ): List<OcrTextBlock> {
        require(sourceWidthPx > 0 && sourceHeightPx > 0) {
            "source dimensions must be positive, were ${sourceWidthPx}x$sourceHeightPx"
        }

        if (targetWidthPx <= 0 || targetHeightPx <= 0) return blocks
        if (sourceWidthPx == targetWidthPx && sourceHeightPx == targetHeightPx) return blocks

        val scaleX = targetWidthPx.toDouble() / sourceWidthPx
        val scaleY = targetHeightPx.toDouble() / sourceHeightPx

        return blocks.map { block -> block.copy(bounds = block.bounds.scaled(scaleX, scaleY)) }
    }
}
