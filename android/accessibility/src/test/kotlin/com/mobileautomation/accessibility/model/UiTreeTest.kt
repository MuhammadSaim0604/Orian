package com.mobileautomation.accessibility.model

import com.mobileautomation.accessibility.UI_TREE_SCHEMA_VERSION
import org.junit.Assert.assertEquals
import org.junit.Test

class UiTreeTest {
    private val tree =
        UiTree(
            root =
                UiNode(
                    className = "android.widget.FrameLayout",
                    bounds = Bounds(0, 0, 1080, 2400),
                    children =
                        listOf(
                            UiNode(
                                text = "Send",
                                bounds = Bounds(900, 1800, 1050, 1950),
                                clickable = true,
                            ),
                            UiNode(
                                text = "Disabled",
                                bounds = Bounds(60, 1800, 880, 1950),
                                clickable = true,
                                enabled = false,
                            ),
                            UiNode(className = "android.view.View", bounds = Bounds(0, 0, 10, 10)),
                        ),
                ),
            packageName = "com.whatsapp",
            activityName = "com.whatsapp.Conversation",
            screenWidthPx = 1080,
            screenHeightPx = 2400,
        )

    @Test
    fun `reports node count and depth from the root`() {
        assertEquals(4, tree.nodeCount)
        assertEquals(2, tree.maxDepth)
    }

    @Test
    fun `exposes only genuinely actionable nodes`() {
        val actionable = tree.actionableNodes()
        assertEquals(1, actionable.size)
        assertEquals("Send", actionable.first().text)
    }

    @Test
    fun `exposes labelled nodes for model context`() {
        assertEquals(2, tree.labelledNodes().size)
    }

    @Test
    fun `captures the screen identity a selector is only valid on`() {
        assertEquals("com.whatsapp", tree.packageName)
        assertEquals("com.whatsapp.Conversation", tree.activityName)
    }

    @Test
    fun `defaults to the current schema version`() {
        assertEquals(UI_TREE_SCHEMA_VERSION, tree.schemaVersion)
    }
}
