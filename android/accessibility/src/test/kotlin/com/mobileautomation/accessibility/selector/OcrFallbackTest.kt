package com.mobileautomation.accessibility.selector

import com.mobileautomation.accessibility.model.Bounds
import com.mobileautomation.accessibility.model.UiNode
import com.mobileautomation.accessibility.model.UiTree
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tests for the sixth selector strategy.
 *
 * OCR sits between relative position and raw coordinates (ADR 0013), and the behaviour that matters is
 * **ordering**: it must be reached only after every structural strategy has failed, and it must be reached
 * before vision — which costs the user money on every look and cannot be verified.
 *
 * The other half is honesty. When OCR cannot run, the caller has to be told that rather than being handed a bare
 * "element not found", because "no screen-capture consent" is fixable by asking the user and "not on screen" is
 * not.
 */
class OcrFallbackTest {
    /** Returns a scripted match, and records whether it was consulted. */
    private class FakeOcrMatcher(
        override val isAvailable: Boolean = true,
        private val match: OcrTextMatch? = null,
    ) : OcrMatcher {
        var locateCalls: Int = 0
            private set

        var lastSelector: Selector? = null
            private set

        override suspend fun locate(selector: Selector): OcrTextMatch? {
            locateCalls++
            lastSelector = selector
            return match
        }
    }

    private class FakeVisionMatcher(
        override val isAvailable: Boolean = true,
        private val match: VisionMatch? = null,
    ) : VisionMatcher {
        var locateCalls: Int = 0
            private set

        override suspend fun locate(selector: Selector): VisionMatch? {
            locateCalls++
            return match
        }
    }

    private val sendButton =
        UiNode(
            text = "Send",
            resourceId = "com.whatsapp:id/send_button",
            packageName = "com.whatsapp",
            bounds = Bounds(900, 1800, 1050, 1950),
            clickable = true,
        )

    private val tree =
        UiTree(
            root =
                UiNode(
                    packageName = "com.whatsapp",
                    bounds = Bounds(0, 0, 1080, 2400),
                    children = listOf(sendButton),
                ),
            packageName = "com.whatsapp",
            activityName = "com.whatsapp.Conversation",
        )

    /** A canvas-rendered screen: bounds but no text, ids, or descriptions. Exactly what OCR is for. */
    private val opaqueTree =
        UiTree(
            root =
                UiNode(
                    className = "android.view.SurfaceView",
                    packageName = "com.example.game",
                    bounds = Bounds(0, 0, 1080, 2400),
                ),
            packageName = "com.example.game",
            activityName = "com.example.game.MainActivity",
        )

    private val startMatch =
        OcrTextMatch(
            bounds = Bounds(400, 1200, 700, 1300),
            recognisedText = "Start",
            confidence = 0.92,
        )

    // --- ordering ---------------------------------------------------------

    @Test
    fun `does not consult ocr when a structural strategy matches`() {
        // The cost is not money, as with vision, but a screenshot and a few hundred milliseconds on the thread
        // driving the phone - and the tree already answered.
        val matcher = FakeOcrMatcher(match = startMatch)
        val resolver = SelectorResolver(ocrMatcher = matcher)

        runTest {
            val result = resolver.resolveWithFallbacks(tree, Selector.byResourceId("send_button"))

            assertEquals(SelectorStrategy.RESOURCE_ID, (result as ResolutionResult.Match).strategy)
            assertEquals(0, matcher.locateCalls)
        }
    }

    @Test
    fun `falls through to ocr when the structural chain finds nothing`() {
        val matcher = FakeOcrMatcher(match = startMatch)
        val resolver = SelectorResolver(ocrMatcher = matcher)

        runTest {
            val result = resolver.resolveWithFallbacks(opaqueTree, Selector.byText("Start"))

            val match = result as ResolutionResult.Match
            assertEquals(SelectorStrategy.OCR_TEXT, match.strategy)
            assertEquals(Bounds(400, 1200, 700, 1300), match.node.bounds)
            assertEquals(1, matcher.locateCalls)
        }
    }

    @Test
    fun `ocr is tried before vision`() {
        // The decisive ordering test. OCR is on-device, free, and checkable; vision is a model guessing
        // coordinates that cannot be verified and costs money per look. Reversing them would spend the user's
        // money to get a worse answer.
        val ocr = FakeOcrMatcher(match = startMatch)
        val vision = FakeVisionMatcher(match = VisionMatch(Bounds(0, 0, 10, 10), 0.9))
        val resolver = SelectorResolver(ocrMatcher = ocr, visionMatcher = vision)

        runTest {
            val match = resolver.resolveWithFallbacks(opaqueTree, Selector.byText("Start"))

            assertEquals(SelectorStrategy.OCR_TEXT, (match as ResolutionResult.Match).strategy)
            assertEquals(1, ocr.locateCalls)
            assertEquals("vision must not be paid for when OCR answered", 0, vision.locateCalls)
        }
    }

    @Test
    fun `vision is still reached when ocr finds nothing`() {
        val ocr = FakeOcrMatcher(match = null)
        val vision = FakeVisionMatcher(match = VisionMatch(Bounds(100, 100, 200, 200), 0.8))
        val resolver = SelectorResolver(ocrMatcher = ocr, visionMatcher = vision)

        runTest {
            val match = resolver.resolveWithFallbacks(opaqueTree, Selector.byText("Start"))

            assertEquals(SelectorStrategy.VISION, (match as ResolutionResult.Match).strategy)
            assertEquals(1, ocr.locateCalls)
            assertEquals(1, vision.locateCalls)
        }
    }

    // --- when it is not attempted -----------------------------------------

    @Test
    fun `does not consult ocr for a selector with no text`() {
        // A resourceId does not appear on screen, so there is nothing for a recogniser to look for. Asking anyway
        // would cost a screenshot to learn nothing.
        val matcher = FakeOcrMatcher(match = startMatch)
        val resolver = SelectorResolver(ocrMatcher = matcher)

        runTest {
            resolver.resolveWithFallbacks(opaqueTree, Selector.byResourceId("missing_id"))

            assertEquals(0, matcher.locateCalls)
        }
    }

    @Test
    fun `does not consult ocr for an empty selector`() {
        val matcher = FakeOcrMatcher(match = startMatch)
        val resolver = SelectorResolver(ocrMatcher = matcher)

        runTest {
            val result = resolver.resolveWithFallbacks(tree, Selector())

            assertFalse(result.isMatch)
            assertEquals(0, matcher.locateCalls)
        }
    }

    @Test
    fun `says ocr was unavailable rather than just element not found`() {
        val resolver = SelectorResolver(ocrMatcher = FakeOcrMatcher(isAvailable = false))

        runTest {
            val notFound =
                resolver.resolveWithFallbacks(opaqueTree, Selector.byText("Start"))
                    as ResolutionResult.NotFound

            assertTrue(notFound.reason.contains("OCR was not attempted"))
            assertFalse(notFound.attempted.contains(SelectorStrategy.OCR_TEXT))
        }
    }

    @Test
    fun `records that ocr was attempted when it ran and found nothing`() {
        val matcher = FakeOcrMatcher(match = null)
        val resolver = SelectorResolver(ocrMatcher = matcher)

        runTest {
            val notFound =
                resolver.resolveWithFallbacks(opaqueTree, Selector.byText("Start"))
                    as ResolutionResult.NotFound

            assertTrue(notFound.attempted.contains(SelectorStrategy.OCR_TEXT))
            assertTrue(notFound.reason.contains("OCR did not find that text"))
        }
    }

    @Test
    fun `defaults to no ocr provider so the chain reports honestly`() {
        // The same decision as the vision default: a chain that silently ends early is indistinguishable from one
        // that tried and found nothing.
        val resolver = SelectorResolver()

        runTest {
            val notFound =
                resolver.resolveWithFallbacks(opaqueTree, Selector.byText("Start"))
                    as ResolutionResult.NotFound

            assertTrue(notFound.reason.contains("OCR was not attempted"))
        }
    }

    // --- what the match carries -------------------------------------------

    @Test
    fun `the recognised text is carried rather than the query`() {
        // They differ on a fuzzy match, and the difference is the whole reason a caller should check: "Contlnue"
        // matched "Continue", and the caller needs to see what was actually read.
        val matcher =
            FakeOcrMatcher(
                match =
                    OcrTextMatch(
                        bounds = Bounds(0, 0, 100, 40),
                        recognisedText = "Contlnue",
                        wasFuzzy = true,
                    ),
            )
        val resolver = SelectorResolver(ocrMatcher = matcher)

        runTest {
            val match =
                resolver.resolveWithFallbacks(opaqueTree, Selector.byText("Continue"))
                    as ResolutionResult.Match

            assertEquals("Contlnue", match.node.text)
        }
    }

    @Test
    fun `an ocr match is marked with its own structural path`() {
        // A distinct value from vision's, so a recorded trace says which fallback produced the step. The recorder
        // judges durability from that, and the two are not equally durable.
        val resolver = SelectorResolver(ocrMatcher = FakeOcrMatcher(match = startMatch))

        runTest {
            val match =
                resolver.resolveWithFallbacks(opaqueTree, Selector.byText("Start"))
                    as ResolutionResult.Match

            assertEquals(SelectorResolver.OCR_PATH, match.structuralPath)
        }
    }

    @Test
    fun `an ocr match carries no vision detail`() {
        val resolver = SelectorResolver(ocrMatcher = FakeOcrMatcher(match = startMatch))

        runTest {
            val match =
                resolver.resolveWithFallbacks(opaqueTree, Selector.byText("Start"))
                    as ResolutionResult.Match

            assertNull(match.visionMatch)
        }
    }

    @Test
    fun `the selector reaches the matcher unchanged`() {
        // Including exactText, which the adapter honours: a selector recorded with an exact-text requirement was
        // recorded that way for a reason, and relaxing it would tap something the author excluded.
        val matcher = FakeOcrMatcher(match = startMatch)
        val resolver = SelectorResolver(ocrMatcher = matcher)

        runTest {
            resolver.resolveWithFallbacks(opaqueTree, Selector.byText("Start", exact = true))

            assertEquals(true, matcher.lastSelector?.exactText)
        }
    }
}

class OcrTextMatchTest {
    @Test
    fun `an exact match with good confidence is strong`() {
        assertTrue(OcrTextMatch(Bounds(0, 0, 10, 10), "Send", confidence = 0.95).isStrong)
    }

    @Test
    fun `a fuzzy match is never strong however clearly it was read`() {
        // The two properties are independent: confidence is how clearly the pixels were read, fuzziness is how far
        // the string had to be bent. A crisply-recognised "Contlnue" is high confidence and still a guess.
        assertFalse(
            OcrTextMatch(Bounds(0, 0, 10, 10), "Contlnue", confidence = 0.99, wasFuzzy = true).isStrong,
        )
    }

    @Test
    fun `a low confidence match is not strong`() {
        assertFalse(OcrTextMatch(Bounds(0, 0, 10, 10), "Send", confidence = 0.3).isStrong)
    }

    @Test
    fun `an absent confidence does not make a match weak`() {
        // ML Kit omits confidence for some recognisers, and treating "not measured" as "measured low" would flag
        // every match on those devices.
        assertTrue(OcrTextMatch(Bounds(0, 0, 10, 10), "Send").isStrong)
    }

    @Test
    fun `rejects a confidence outside zero to one`() {
        assertTrue(
            runCatching { OcrTextMatch(Bounds(0, 0, 10, 10), "Send", confidence = 1.5) }
                .exceptionOrNull() is IllegalArgumentException,
        )
    }

    @Test
    fun `the unavailable matcher reports itself unavailable and finds nothing`() {
        runTest {
            assertFalse(UnavailableOcrMatcher.isAvailable)
            assertNull(UnavailableOcrMatcher.locate(Selector.byText("anything")))
        }
    }
}

class SelectorStrategyOrderTest {
    @Test
    fun `ocr sits between relative position and coordinates`() {
        // The ordering ADR 0013 requires, and the one the TypeScript SELECTOR_STRATEGIES must mirror.
        assertTrue(SelectorStrategy.RELATIVE_POSITION.isStrongerThan(SelectorStrategy.OCR_TEXT))
        assertTrue(SelectorStrategy.OCR_TEXT.isStrongerThan(SelectorStrategy.COORDINATES))
    }

    @Test
    fun `the wire names match the typescript list exactly, in order`() {
        assertEquals(
            listOf(
                "resourceId",
                "accessibilitySemantics",
                "text",
                "structural",
                "relativePosition",
                "ocrText",
                "coordinates",
                "vision",
            ),
            SelectorStrategy.wireNames,
        )
    }

    @Test
    fun `ocrText resolves from its wire name`() {
        assertEquals(SelectorStrategy.OCR_TEXT, SelectorStrategy.fromWireName("ocrText"))
    }
}
