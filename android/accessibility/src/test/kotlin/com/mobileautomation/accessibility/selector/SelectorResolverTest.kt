package com.mobileautomation.accessibility.selector

import com.mobileautomation.accessibility.model.Bounds
import com.mobileautomation.accessibility.model.UiNode
import com.mobileautomation.accessibility.model.UiTree
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tests for the priority chain that makes replay durable.
 *
 * The scenario throughout is a messaging screen, because that is the plan's
 * driving example ("send Robert a WhatsApp message").
 */
class SelectorResolverTest {
    private val resolver = SelectorResolver()

    private val sendButton =
        UiNode(
            text = "Send",
            resourceId = "com.whatsapp:id/send_button",
            contentDescription = "Send message",
            className = "android.widget.ImageButton",
            packageName = "com.whatsapp",
            bounds = Bounds(900, 1800, 1050, 1950),
            clickable = true,
        )

    private val messageField =
        UiNode(
            resourceId = "com.whatsapp:id/entry",
            contentDescription = "Type a message",
            className = "android.widget.EditText",
            packageName = "com.whatsapp",
            bounds = Bounds(60, 1800, 880, 1950),
            clickable = true,
            editable = true,
        )

    private val attachButton =
        UiNode(
            contentDescription = "Attach",
            className = "android.widget.ImageButton",
            packageName = "com.whatsapp",
            bounds = Bounds(60, 1800, 200, 1950),
            clickable = true,
        )

    private val tree =
        UiTree(
            root =
                UiNode(
                    className = "android.widget.FrameLayout",
                    packageName = "com.whatsapp",
                    bounds = Bounds(0, 0, 1080, 2400),
                    children =
                        listOf(
                            UiNode(
                                className = "android.widget.LinearLayout",
                                packageName = "com.whatsapp",
                                bounds = Bounds(0, 1750, 1080, 2000),
                                children = listOf(attachButton, messageField, sendButton),
                            ),
                        ),
                ),
            packageName = "com.whatsapp",
            activityName = "com.whatsapp.Conversation",
        )

    // --- resourceId: the strongest strategy -------------------------------

    @Test
    fun `resolves by fully qualified resource id`() {
        val result = resolver.resolve(tree, Selector.byResourceId("com.whatsapp:id/send_button"))

        val match = assertMatch(result)
        assertEquals(SelectorStrategy.RESOURCE_ID, match.strategy)
        assertEquals("Send", match.node.text)
    }

    @Test
    fun `resolves by short resource id name`() {
        val match = assertMatch(resolver.resolve(tree, Selector.byResourceId("send_button")))
        assertEquals(SelectorStrategy.RESOURCE_ID, match.strategy)
        assertEquals("com.whatsapp:id/send_button", match.node.resourceId)
    }

    @Test
    fun `prefers resource id over text when both are present`() {
        val selector =
            Selector(resourceId = "com.whatsapp:id/send_button", text = "Send", contentDescription = "Send message")
        assertEquals(SelectorStrategy.RESOURCE_ID, assertMatch(resolver.resolve(tree, selector)).strategy)
    }

    // --- fallback ordering ------------------------------------------------

    @Test
    fun `falls back to accessibility semantics when the resource id is gone`() {
        val selector = Selector(resourceId = "com.whatsapp:id/renamed_in_update", contentDescription = "Attach")

        val match = assertMatch(resolver.resolve(tree, selector))

        assertEquals(SelectorStrategy.ACCESSIBILITY_SEMANTICS, match.strategy)
        assertEquals("Attach", match.node.contentDescription)
    }

    @Test
    fun `falls back to text when neither id nor description matches`() {
        val selector =
            Selector(
                resourceId = "com.whatsapp:id/gone",
                contentDescription = "No such description",
                text = "Send",
            )

        assertEquals(SelectorStrategy.TEXT, assertMatch(resolver.resolve(tree, selector)).strategy)
    }

    @Test
    fun `falls back to the structural path when all semantic clues fail`() {
        val selector =
            Selector(
                resourceId = "com.whatsapp:id/gone",
                text = "Vanished",
                structuralPath = "0.0.2",
            )

        val match = assertMatch(resolver.resolve(tree, selector))

        assertEquals(SelectorStrategy.STRUCTURAL, match.strategy)
        assertEquals("com.whatsapp:id/send_button", match.node.resourceId)
    }

    @Test
    fun `falls back to relative position when the element merely shifted`() {
        val selector =
            Selector(
                resourceId = "com.whatsapp:id/gone",
                text = "Vanished",
                structuralPath = "9.9.9",
                // Recorded slightly off from where the send button now sits.
                bounds = Bounds(910, 1810, 1060, 1960),
            )

        val match = assertMatch(resolver.resolve(tree, selector))

        assertEquals(SelectorStrategy.RELATIVE_POSITION, match.strategy)
        assertEquals("com.whatsapp:id/send_button", match.node.resourceId)
    }

    @Test
    fun `falls back to coordinates only as a last resort`() {
        val selector =
            Selector(
                resourceId = "com.whatsapp:id/gone",
                text = "Vanished",
                structuralPath = "9.9.9",
                // Far from any recorded centre, so relative position misses, but
                // the point still lands inside the send button.
                bounds = Bounds(0, 0, 4, 4),
                coordinates = Point(975, 1875),
            )

        val match = assertMatch(resolver.resolve(tree, selector))

        assertEquals(SelectorStrategy.COORDINATES, match.strategy)
        assertEquals("com.whatsapp:id/send_button", match.node.resourceId)
        assertTrue("a coordinate match is fragile", match.isFragile)
    }

    @Test
    fun `picks the smallest node containing a coordinate rather than a parent`() {
        val match = assertMatch(resolver.resolve(tree, Selector.byCoordinates(975, 1875)))
        assertEquals(SelectorStrategy.COORDINATES, match.strategy)
        assertEquals("com.whatsapp:id/send_button", match.node.resourceId)
    }

    // --- text matching nuances -------------------------------------------

    @Test
    fun `matches text case-insensitively by default`() {
        assertEquals("Send", assertMatch(resolver.resolve(tree, Selector.byText("send"))).node.text)
    }

    @Test
    fun `respects exact text matching when asked`() {
        val result = resolver.resolve(tree, Selector.byText("send", exact = true))
        assertTrue(result is ResolutionResult.NotFound)
    }

    @Test
    fun `matches a label that contains the recorded text`() {
        val withCount =
            UiTree(
                root =
                    UiNode(
                        bounds = Bounds(0, 0, 1080, 2400),
                        children =
                            listOf(
                                UiNode(
                                    text = "Chats (3)",
                                    bounds = Bounds(0, 100, 500, 200),
                                    clickable = true,
                                ),
                            ),
                    ),
            )

        val match = assertMatch(resolver.resolve(withCount, Selector.byText("Chats")))

        assertEquals("Chats (3)", match.node.text)
    }

    @Test
    fun `ignores surrounding whitespace when matching text`() {
        val padded =
            UiTree(
                root =
                    UiNode(
                        bounds = Bounds(0, 0, 100, 100),
                        children = listOf(UiNode(text = "  Send  ", bounds = Bounds(0, 0, 50, 50), clickable = true)),
                    ),
            )

        assertTrue(resolver.resolve(padded, Selector.byText("Send")).isMatch)
    }

    // --- disambiguation ---------------------------------------------------

    @Test
    fun `prefers an actionable node over a decorative wrapper`() {
        val wrapped =
            UiTree(
                root =
                    UiNode(
                        bounds = Bounds(0, 0, 1080, 2400),
                        children =
                            listOf(
                                // Wrapper carries the same text but cannot be tapped.
                                UiNode(
                                    text = "Send",
                                    className = "android.widget.FrameLayout",
                                    bounds = Bounds(880, 1780, 1070, 1970),
                                    children =
                                        listOf(
                                            UiNode(
                                                text = "Send",
                                                className = "android.widget.Button",
                                                bounds = Bounds(900, 1800, 1050, 1950),
                                                clickable = true,
                                            ),
                                        ),
                                ),
                            ),
                    ),
            )

        val match = assertMatch(resolver.resolve(wrapped, Selector.byText("Send")))

        assertEquals("android.widget.Button", match.node.className)
        assertTrue(match.node.clickable)
    }

    @Test
    fun `reports ambiguity when several nodes match equally`() {
        val duplicated =
            UiTree(
                root =
                    UiNode(
                        bounds = Bounds(0, 0, 1080, 2400),
                        children =
                            listOf(
                                UiNode(text = "Delete", bounds = Bounds(0, 100, 200, 200), clickable = true),
                                UiNode(text = "Delete", bounds = Bounds(0, 300, 200, 400), clickable = true),
                                UiNode(text = "Delete", bounds = Bounds(0, 500, 200, 600), clickable = true),
                            ),
                    ),
            )

        val match = assertMatch(resolver.resolve(duplicated, Selector.byText("Delete")))

        assertTrue(match.isAmbiguous)
        assertEquals(2, match.alternativeCount)
    }

    @Test
    fun `narrows an ambiguous selector by class name`() {
        val mixed =
            UiTree(
                root =
                    UiNode(
                        bounds = Bounds(0, 0, 1080, 2400),
                        children =
                            listOf(
                                UiNode(
                                    text = "Send",
                                    className = "android.widget.TextView",
                                    bounds = Bounds(0, 100, 200, 200),
                                ),
                                UiNode(
                                    text = "Send",
                                    className = "android.widget.Button",
                                    bounds = Bounds(0, 300, 200, 400),
                                    clickable = true,
                                ),
                            ),
                    ),
            )

        val selector = Selector(text = "Send", className = "android.widget.Button")
        val match = assertMatch(resolver.resolve(mixed, selector))

        assertEquals("android.widget.Button", match.node.className)
        assertFalse(match.isAmbiguous)
    }

    @Test
    fun `honours requireActionable by refusing a non-actionable match`() {
        val staticOnly =
            UiTree(
                root =
                    UiNode(
                        bounds = Bounds(0, 0, 100, 100),
                        children = listOf(UiNode(text = "Send", bounds = Bounds(0, 0, 50, 50))),
                    ),
            )

        val result = resolver.resolve(staticOnly, Selector(text = "Send", requireActionable = true))

        assertTrue(result is ResolutionResult.NotFound)
    }

    // --- guards -----------------------------------------------------------

    @Test
    fun `refuses an empty selector with a clear reason`() {
        val result = resolver.resolve(tree, Selector())

        val notFound = result as ResolutionResult.NotFound
        assertTrue(notFound.reason.contains("no locating information"))
        assertTrue(notFound.attempted.isEmpty())
    }

    @Test
    fun `refuses to act when the selector targets a different app`() {
        val selector = Selector(resourceId = "com.whatsapp:id/send_button", packageName = "com.telegram")

        val notFound = resolver.resolve(tree, selector) as ResolutionResult.NotFound

        assertTrue(notFound.reason.contains("com.telegram"))
    }

    @Test
    fun `refuses to act when the selector was recorded on a different screen`() {
        // Same app, different activity: a "Send" selector from a conversation must
        // not resolve against the chat list, where it could find a plausible but
        // wrong element.
        val selector =
            Selector(
                text = "Send",
                packageName = "com.whatsapp",
                activityName = "com.whatsapp.HomeActivity",
            )

        val notFound = resolver.resolve(tree, selector) as ResolutionResult.NotFound

        assertTrue(notFound.reason.contains("activity"))
        assertTrue(notFound.reason.contains("com.whatsapp.HomeActivity"))
    }

    @Test
    fun `resolves when the recorded screen matches`() {
        val selector =
            Selector(
                resourceId = "send_button",
                packageName = "com.whatsapp",
                activityName = "com.whatsapp.Conversation",
            )

        assertTrue(resolver.resolve(tree, selector).isMatch)
    }

    @Test
    fun `does not refuse when the tree cannot report its activity`() {
        // A hand-built tree, or a transient window with no activity known: the
        // guard must not make the resolver unusable.
        val unknownScreen = tree.copy(activityName = null)
        val selector = Selector(resourceId = "send_button", activityName = "com.whatsapp.Conversation")

        assertTrue(resolver.resolve(unknownScreen, selector).isMatch)
    }

    @Test
    fun `scopedTo pins an existing selector to a screen`() {
        val scoped = Selector.byText("Send").scopedTo("com.whatsapp", "com.whatsapp.Conversation")

        assertEquals("com.whatsapp", scoped.packageName)
        assertEquals("com.whatsapp.Conversation", scoped.activityName)
        assertEquals("Send", scoped.text)
    }

    @Test
    fun `reports every strategy it tried when nothing matches`() {
        val selector =
            Selector(
                resourceId = "com.whatsapp:id/nope",
                contentDescription = "nope",
                text = "nope",
            )

        val notFound = resolver.resolve(tree, selector) as ResolutionResult.NotFound

        assertEquals(
            listOf(
                SelectorStrategy.RESOURCE_ID,
                SelectorStrategy.ACCESSIBILITY_SEMANTICS,
                SelectorStrategy.TEXT,
            ),
            notFound.attempted,
        )
    }

    @Test
    fun `does not claim a vision match since vision needs a screenshot and a model`() {
        val selector = Selector(text = "nope", bounds = Bounds(5000, 5000, 5010, 5010))

        val notFound = resolver.resolve(tree, selector) as ResolutionResult.NotFound

        assertFalse(notFound.attempted.contains(SelectorStrategy.VISION))
    }

    @Test
    fun `reports the structural path of a match so the selector can be strengthened`() {
        val match = assertMatch(resolver.resolve(tree, Selector.byResourceId("send_button")))
        assertEquals("0.0.2", match.structuralPath)
    }

    @Test
    fun `treats a resource id match as durable rather than fragile`() {
        assertFalse(assertMatch(resolver.resolve(tree, Selector.byResourceId("send_button"))).isFragile)
    }

    @Test
    fun `respects a tighter position tolerance by falling through to coordinates`() {
        val strict = SelectorResolver(positionTolerancePx = 2)
        // Recorded centre is 20px from the send button's current centre, and it
        // still lands inside the button.
        val selector = Selector(bounds = Bounds(910, 1810, 1060, 1960))

        val lenient = assertMatch(resolver.resolve(tree, selector))
        val tight = assertMatch(strict.resolve(tree, selector))

        assertEquals(SelectorStrategy.RELATIVE_POSITION, lenient.strategy)
        // Still resolves, but has degraded to the fragile strategy.
        assertEquals(SelectorStrategy.COORDINATES, tight.strategy)
        assertTrue(tight.isFragile)
        assertEquals("com.whatsapp:id/send_button", tight.node.resourceId)
    }

    @Test
    fun `finds nothing when the recorded position is off screen entirely`() {
        val selector = Selector(bounds = Bounds(5000, 5000, 5100, 5100))

        val result = resolver.resolve(tree, selector)

        assertFalse(result.isMatch)
    }

    private fun assertMatch(result: ResolutionResult): ResolutionResult.Match {
        assertTrue("expected a match but got $result", result is ResolutionResult.Match)
        return result as ResolutionResult.Match
    }
}
