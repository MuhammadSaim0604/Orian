package com.mobileautomation.accessibility.serialization

import com.mobileautomation.accessibility.UI_TREE_SCHEMA_VERSION
import com.mobileautomation.accessibility.model.Bounds
import com.mobileautomation.accessibility.model.UiNode
import com.mobileautomation.accessibility.model.UiTree
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UiTreeSerializerTest {
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
                                resourceId = "com.whatsapp:id/send_button",
                                bounds = Bounds(900, 1800, 1050, 1950),
                                clickable = true,
                                index = 0,
                            ),
                        ),
                ),
            packageName = "com.whatsapp",
            activityName = "com.whatsapp.Conversation",
            capturedAtEpochMs = 1_700_000_000_000L,
            screenWidthPx = 1080,
            screenHeightPx = 2400,
        )

    @Test
    fun `emits the schema version so the other side can reject stale payloads`() {
        assertTrue(UiTreeSerializer.toJson(tree).contains("\"schemaVersion\":$UI_TREE_SCHEMA_VERSION"))
    }

    @Test
    fun `emits the screen identity alongside the tree`() {
        val json = UiTreeSerializer.toJson(tree)
        assertTrue(json.contains("\"packageName\":\"com.whatsapp\""))
        assertTrue(json.contains("\"activityName\":\"com.whatsapp.Conversation\""))
        assertTrue(json.contains("\"capturedAtEpochMs\":1700000000000"))
    }

    @Test
    fun `emits bounds as an object with the four edges`() {
        assertTrue(
            UiTreeSerializer.toJson(tree)
                .contains("\"bounds\":{\"left\":900,\"top\":1800,\"right\":1050,\"bottom\":1950}"),
        )
    }

    @Test
    fun `nests children under the parent`() {
        val json = UiTreeSerializer.toJson(tree)
        assertTrue(json.contains("\"children\":["))
        assertTrue(json.contains("\"resourceId\":\"com.whatsapp:id/send_button\""))
    }

    @Test
    fun `produces valid json with no trailing commas`() {
        val json = UiTreeSerializer.toJson(tree)
        assertFalse(json.contains(",}"))
        assertFalse(json.contains(",]"))
        assertEquals(json.count { it == '{' }, json.count { it == '}' })
        assertEquals(json.count { it == '[' }, json.count { it == ']' })
    }

    @Test
    fun `is deterministic for the same input`() {
        assertEquals(UiTreeSerializer.toJson(tree), UiTreeSerializer.toJson(tree))
    }

    @Test
    fun `emits null for absent optional fields in full mode`() {
        assertTrue(UiTreeSerializer.toJson(tree).contains("\"text\":null"))
    }

    @Test
    fun `omits absent and default fields in compact mode`() {
        val compact = UiTreeSerializer.toJson(tree, compact = true)
        assertFalse(compact.contains("\"text\":null"))
        assertFalse(compact.contains("\"checkable\":false"))
        assertFalse(compact.contains("\"enabled\":true"))
        assertTrue(compact.contains("\"text\":\"Send\""))
    }

    @Test
    fun `compact mode is materially smaller than full mode`() {
        val full = UiTreeSerializer.toJson(tree)
        val compact = UiTreeSerializer.toJson(tree, compact = true)
        assertTrue("compact should be smaller", compact.length < full.length)
    }

    @Test
    fun `escapes quotes and newlines in text so the json stays parseable`() {
        val node = UiNode(text = "say \"hi\"\nnow\ttabbed")
        val json = UiTreeSerializer.nodeToJson(node)
        assertTrue(json.contains("\\\"hi\\\""))
        assertTrue(json.contains("\\n"))
        assertTrue(json.contains("\\t"))
    }

    @Test
    fun `escapes a backslash`() {
        assertTrue(UiTreeSerializer.nodeToJson(UiNode(text = "C:\\path")).contains("C:\\\\path"))
    }

    @Test
    fun `escapes control characters as unicode`() {
        assertTrue(UiTreeSerializer.nodeToJson(UiNode(text = "a\u0001b")).contains("\\u0001"))
    }

    @Test
    fun `serializes emoji unchanged`() {
        assertTrue(UiTreeSerializer.nodeToJson(UiNode(text = "Send 🚀")).contains("Send 🚀"))
    }

    @Test
    fun `serializes a childless node without an empty children array in compact mode`() {
        val json = UiTreeSerializer.nodeToJson(UiNode(text = "leaf"), compact = true)
        assertFalse(json.contains("\"children\""))
    }
}
