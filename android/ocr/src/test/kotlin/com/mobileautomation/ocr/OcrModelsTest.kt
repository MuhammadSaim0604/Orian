package com.mobileautomation.ocr

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The OCR models, and the arithmetic that decides where a tap lands.
 *
 * `OcrScaling` gets the most attention here for a reason worth stating: a wrongly-scaled box does not fail, it
 * lands **slightly** wrong. The tool reports success, the agent believes the button was pressed, and something
 * one row away was pressed instead. That is the hardest class of bug to diagnose from a user's report, so the
 * transform is tested rather than trusted.
 */
class OcrBoundsTest {
    @Test
    fun `centre is the middle of the box`() {
        val bounds = OcrBounds(left = 100, top = 200, right = 300, bottom = 400)

        assertEquals(200, bounds.centerX)
        assertEquals(300, bounds.centerY)
    }

    @Test
    fun `dimensions are derived rather than stored`() {
        val bounds = OcrBounds(left = 10, top = 20, right = 110, bottom = 70)

        assertEquals(100, bounds.width)
        assertEquals(50, bounds.height)
        assertEquals(5_000, bounds.area)
    }

    @Test
    fun `a zero-area box is recognised as empty`() {
        // A recogniser can return one, and tapping it would tap nothing. Callers filter on this rather than
        // discovering it as a gesture that silently did nothing.
        assertTrue(OcrBounds(left = 10, top = 10, right = 10, bottom = 50).isEmpty)
        assertTrue(OcrBounds(left = 10, top = 10, right = 50, bottom = 10).isEmpty)
        assertFalse(OcrBounds(left = 10, top = 10, right = 50, bottom = 50).isEmpty)
    }

    @Test
    fun `an inverted box is rejected at construction`() {
        // Rejected rather than normalised. A box we had to repair is a box we do not understand, and quietly
        // swapping the edges would hide a real bug in whatever produced it.
        val inverted =
            runCatching { OcrBounds(left = 100, top = 10, right = 50, bottom = 50) }

        assertTrue(inverted.isFailure)
    }

    @Test
    fun `scaling rounds rather than truncating`() {
        // Truncation drifts every box up and to the left. Over a full screen that is enough to move a centre
        // point off a small control.
        val bounds = OcrBounds(left = 10, top = 10, right = 21, bottom = 21)

        val scaled = bounds.scaled(scaleX = 1.5, scaleY = 1.5)

        assertEquals(15, scaled.left)
        assertEquals(32, scaled.right)
    }

    @Test
    fun `scaling down keeps the box proportional`() {
        val bounds = OcrBounds(left = 200, top = 400, right = 400, bottom = 600)

        val scaled = bounds.scaled(scaleX = 0.5, scaleY = 0.5)

        assertEquals(OcrBounds(left = 100, top = 200, right = 200, bottom = 300), scaled)
    }

    @Test
    fun `contains answers whether a point is inside`() {
        val bounds = OcrBounds(left = 10, top = 10, right = 100, bottom = 50)

        assertTrue(bounds.contains(50, 30))
        assertTrue("edges count as inside", bounds.contains(10, 10))
        assertFalse(bounds.contains(5, 30))
        assertFalse(bounds.contains(50, 60))
    }
}

class OcrTextBlockTest {
    @Test
    fun `normalised text collapses whitespace and case`() {
        // What matching compares. Without collapsing, a recognised "Send   Message" never equals "send message"
        // and the match fails on text a person reads as identical.
        val block = block("  Send   MESSAGE \n")

        assertEquals("send message", block.normalisedText)
    }

    @Test
    fun `centre comes from the bounds, not from a separate field`() {
        val block = OcrTextBlock(text = "Send", bounds = OcrBounds(0, 0, 100, 40))

        assertEquals(50, block.centerX)
        assertEquals(20, block.centerY)
    }

    @Test
    fun `confidence is optional`() {
        // ML Kit omits it for some recognisers. Null rather than 1.0, because inventing a perfect score tells
        // the caller something it was never given.
        assertEquals(null, block("Send").confidence)
        assertEquals(0.9, block("Send", confidence = 0.9).confidence)
    }

    @Test
    fun `a confidence outside zero to one is rejected`() {
        assertTrue(runCatching { block("Send", confidence = 1.4) }.isFailure)
    }
}

class OcrResultTest {
    @Test
    fun `full text joins the lines in order`() {
        val result =
            OcrResult(
                blocks = listOf(block("First"), block("Second")),
                screenWidthPx = 1080,
                screenHeightPx = 2400,
            )

        assertEquals("First\nSecond", result.fullText)
        assertEquals(2, result.blockCount)
    }

    @Test
    fun `an empty result is recognisable without inspecting the list`() {
        assertTrue(OcrResult.empty(1080, 2400).isEmpty)
    }

    @Test
    fun `it carries the space the boxes are expressed in`() {
        // Without this, nobody can tell whether a wrong tap was a scaling bug or a recognition one.
        val result = OcrResult.empty(screenWidthPx = 1080, screenHeightPx = 2400)

        assertEquals(1080, result.screenWidthPx)
        assertEquals(2400, result.screenHeightPx)
    }
}

class OcrOutcomeTest {
    @Test
    fun `a capture failure is distinguishable from an empty screen`() {
        // The distinction the whole sealed type exists for: "there is no text here" is an answer the agent acts
        // on, while "OCR could not run" means asking again fails the same way until something changes.
        val empty: OcrOutcome = OcrOutcome.Success(OcrResult.empty())
        val failed: OcrOutcome = OcrOutcome.CaptureFailed("no consent")

        assertTrue(empty.isSuccess)
        assertTrue(empty.resultOrNull!!.isEmpty)
        assertFalse(failed.isSuccess)
        assertEquals(null, failed.resultOrNull)
    }

    @Test
    fun `a capture reason is carried verbatim`() {
        // OCR has no business paraphrasing "you have not granted screen recording" into "OCR failed" - they
        // need different responses from the caller.
        val failed = OcrOutcome.CaptureFailed("screen capture needs the user's permission for this session")

        assertTrue(failed.reason.contains("permission"))
    }
}

class OcrScalingTest {
    private val blocks =
        listOf(
            OcrTextBlock(text = "Send", bounds = OcrBounds(100, 200, 300, 260)),
            OcrTextBlock(text = "Cancel", bounds = OcrBounds(400, 200, 600, 260)),
        )

    @Test
    fun `matching spaces are left untouched`() {
        // The common case: MediaProjection usually mirrors at display resolution. Skipping the arithmetic avoids
        // rounding coordinates that were already exact.
        val scaled =
            OcrScaling.scaleBlocks(
                blocks = blocks,
                sourceWidthPx = 1080,
                sourceHeightPx = 2400,
                targetWidthPx = 1080,
                targetHeightPx = 2400,
            )

        assertEquals(blocks, scaled)
    }

    @Test
    fun `a downscaled capture is scaled up into display coordinates`() {
        // The case this exists for. A capture at half resolution puts every box at half the coordinate it should
        // be, and a tap would land in the top-left quadrant of where the user can see the control.
        val scaled =
            OcrScaling.scaleBlocks(
                blocks = blocks,
                sourceWidthPx = 540,
                sourceHeightPx = 1200,
                targetWidthPx = 1080,
                targetHeightPx = 2400,
            )

        assertEquals(OcrBounds(200, 400, 600, 520), scaled[0].bounds)
        assertEquals(OcrBounds(800, 400, 1200, 520), scaled[1].bounds)
    }

    @Test
    fun `axes scale independently`() {
        // Aspect ratio is not guaranteed to be preserved by a capture pipeline, and assuming one factor for both
        // is how a box ends up correct horizontally and wrong vertically.
        val scaled =
            OcrScaling.scaleBlocks(
                blocks = listOf(OcrTextBlock(text = "Send", bounds = OcrBounds(100, 100, 200, 200))),
                sourceWidthPx = 500,
                sourceHeightPx = 1000,
                targetWidthPx = 1000,
                targetHeightPx = 1500,
            )

        assertEquals(OcrBounds(200, 150, 400, 300), scaled[0].bounds)
    }

    @Test
    fun `the text is preserved through scaling`() {
        val scaled =
            OcrScaling.scaleBlocks(blocks, 540, 1200, 1080, 2400)

        assertEquals(listOf("Send", "Cancel"), scaled.map { it.text })
    }

    @Test
    fun `a non-positive target is treated as no scaling`() {
        // Better than throwing: a display metric read as zero is a transient platform state, and refusing to
        // return any text would turn it into a failed run rather than an unscaled one.
        assertEquals(blocks, OcrScaling.scaleBlocks(blocks, 540, 1200, 0, 0))
    }

    @Test
    fun `a non-positive source is rejected`() {
        // Unlike a bad target, this cannot be worked around - dividing by it would produce infinities and every
        // box would be nonsense.
        assertTrue(runCatching { OcrScaling.scaleBlocks(blocks, 0, 1200, 1080, 2400) }.isFailure)
    }
}

private fun block(
    text: String,
    confidence: Double? = null,
): OcrTextBlock =
    OcrTextBlock(
        text = text,
        bounds = OcrBounds(left = 0, top = 0, right = 100, bottom = 40),
        confidence = confidence,
    )
