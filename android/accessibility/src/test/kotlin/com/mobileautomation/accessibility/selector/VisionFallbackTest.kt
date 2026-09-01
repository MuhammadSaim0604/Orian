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
 * Tests for the last selector strategy.
 *
 * Vision exists for screens that expose no useful accessibility tree - canvas
 * UIs, games, some WebViews. The behaviour that matters is ordering and honesty:
 * it must be reached only after every structural strategy has failed, and when it
 * cannot run the caller must be told that rather than being handed a bare
 * "element not found".
 */
class VisionFallbackTest {
    /** Returns a scripted match, and records whether it was consulted. */
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

    /** A canvas-rendered screen: bounds but no text, ids, or descriptions. */
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

    @Test
    fun `does not consult vision when a structural strategy matches`() {
        val matcher = FakeVisionMatcher(match = VisionMatch(Bounds(0, 0, 10, 10), 0.9))
        val resolver = SelectorResolver(visionMatcher = matcher)

        runTest {
            val result = resolver.resolveWithFallbacks(tree, Selector.byResourceId("send_button"))

            assertEquals(SelectorStrategy.RESOURCE_ID, (result as ResolutionResult.Match).strategy)
            assertEquals("vision must not be paid for when the tree answers", 0, matcher.locateCalls)
        }
    }

    @Test
    fun `falls through to vision when the structural chain finds nothing`() {
        val matcher =
            FakeVisionMatcher(
                match = VisionMatch(Bounds(400, 1200, 700, 1300), 0.88, "green Start button"),
            )
        val resolver = SelectorResolver(visionMatcher = matcher)

        runTest {
            val result = resolver.resolveWithFallbacks(opaqueTree, Selector.byText("Start"))

            val match = result as ResolutionResult.Match
            assertEquals(SelectorStrategy.VISION, match.strategy)
            assertEquals(1, matcher.locateCalls)
            assertEquals(Bounds(400, 1200, 700, 1300), match.node.bounds)
        }
    }

    @Test
    fun `a vision match is reported as fragile`() {
        val resolver =
            SelectorResolver(
                visionMatcher = FakeVisionMatcher(match = VisionMatch(Bounds(0, 0, 50, 50), 0.95)),
            )

        runTest {
            val match = resolver.resolveWithFallbacks(opaqueTree, Selector.byText("Start"))

            assertTrue((match as ResolutionResult.Match).isFragile)
        }
    }

    @Test
    fun `a vision match carries its confidence for the recorder`() {
        val resolver =
            SelectorResolver(
                visionMatcher = FakeVisionMatcher(match = VisionMatch(Bounds(0, 0, 50, 50), 0.42)),
            )

        runTest {
            val match =
                resolver.resolveWithFallbacks(opaqueTree, Selector.byText("Start"))
                    as ResolutionResult.Match

            assertEquals(0.42, match.visionMatch!!.confidence, 0.001)
            assertFalse("a 0.42 match must not be presented as confident", match.visionMatch!!.isConfident)
        }
    }

    @Test
    fun `says vision was unavailable rather than just element not found`() {
        // The distinction matters: "no screenshot consent" is fixable by asking the
        // user, "not on screen" is not.
        val resolver = SelectorResolver(visionMatcher = FakeVisionMatcher(isAvailable = false))

        runTest {
            val notFound =
                resolver.resolveWithFallbacks(opaqueTree, Selector.byText("Start"))
                    as ResolutionResult.NotFound

            assertTrue(notFound.reason.contains("vision was not attempted"))
            assertFalse(notFound.attempted.contains(SelectorStrategy.VISION))
        }
    }

    @Test
    fun `records that vision was attempted when it ran and found nothing`() {
        val matcher = FakeVisionMatcher(match = null)
        val resolver = SelectorResolver(visionMatcher = matcher)

        runTest {
            val notFound =
                resolver.resolveWithFallbacks(opaqueTree, Selector.byText("Start"))
                    as ResolutionResult.NotFound

            assertTrue(notFound.attempted.contains(SelectorStrategy.VISION))
            assertTrue(notFound.reason.contains("vision found nothing"))
            assertEquals(1, matcher.locateCalls)
        }
    }

    @Test
    fun `does not consult vision for an empty selector`() {
        val matcher = FakeVisionMatcher(match = VisionMatch(Bounds(0, 0, 10, 10), 0.9))
        val resolver = SelectorResolver(visionMatcher = matcher)

        runTest {
            val result = resolver.resolveWithFallbacks(tree, Selector())

            assertFalse(result.isMatch)
            assertEquals("nothing was described, so there is nothing to look for", 0, matcher.locateCalls)
        }
    }

    @Test
    fun `does not consult vision when the selector belongs to another screen`() {
        val matcher = FakeVisionMatcher(match = VisionMatch(Bounds(0, 0, 10, 10), 0.9))
        val resolver = SelectorResolver(visionMatcher = matcher)

        runTest {
            val selector = Selector(text = "Send", packageName = "com.telegram")

            resolver.resolveWithFallbacks(tree, selector)

            assertEquals("we should not be looking at this screen at all", 0, matcher.locateCalls)
        }
    }

    @Test
    fun `defaults to no vision provider so the chain reports honestly`() {
        val resolver = SelectorResolver()

        runTest {
            val notFound =
                resolver.resolveWithFallbacks(opaqueTree, Selector.byText("Start"))
                    as ResolutionResult.NotFound

            assertTrue(notFound.reason.contains("vision was not attempted"))
        }
    }

    @Test
    fun `a structural match carries no vision detail`() {
        val resolver = SelectorResolver()

        runTest {
            val match =
                resolver.resolveWithFallbacks(tree, Selector.byResourceId("send_button"))
                    as ResolutionResult.Match

            assertNull(match.visionMatch)
        }
    }
}

class VisionMatchTest {
    @Test
    fun `treats a high score as confident`() {
        assertTrue(VisionMatch(Bounds(0, 0, 10, 10), 0.95).isConfident)
    }

    @Test
    fun `treats a low score as not confident`() {
        // Acting on a guess inside someone else's app is worse than declining.
        assertFalse(VisionMatch(Bounds(0, 0, 10, 10), 0.3).isConfident)
    }

    @Test
    fun `rejects a confidence outside zero to one`() {
        assertTrue(
            runCatching { VisionMatch(Bounds(0, 0, 10, 10), 1.5) }.exceptionOrNull()
                is IllegalArgumentException,
        )
        assertTrue(
            runCatching { VisionMatch(Bounds(0, 0, 10, 10), -0.1) }.exceptionOrNull()
                is IllegalArgumentException,
        )
    }

    @Test
    fun `the unavailable matcher reports itself unavailable and finds nothing`() {
        runTest {
            assertFalse(UnavailableVisionMatcher.isAvailable)
            assertNull(UnavailableVisionMatcher.locate(Selector.byText("anything")))
        }
    }
}
