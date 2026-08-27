package com.mobileautomation.accessibility.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UiNodeTest {
    private val sendButton =
        UiNode(
            text = "Send",
            resourceId = "com.whatsapp:id/send_button",
            className = "android.widget.ImageButton",
            bounds = Bounds(900, 1800, 1050, 1950),
            clickable = true,
        )

    private val messageField =
        UiNode(
            resourceId = "com.whatsapp:id/entry",
            contentDescription = "Type a message",
            className = "android.widget.EditText",
            bounds = Bounds(60, 1800, 880, 1950),
            editable = true,
            clickable = true,
        )

    private val tree =
        UiNode(
            className = "android.widget.FrameLayout",
            bounds = Bounds(0, 0, 1080, 2400),
            children =
                listOf(
                    UiNode(
                        className = "android.widget.LinearLayout",
                        bounds = Bounds(0, 1750, 1080, 2000),
                        children = listOf(messageField, sendButton),
                    ),
                ),
        )

    @Test
    fun `prefers visible text over content description for the label`() {
        assertEquals("Send", sendButton.label)
    }

    @Test
    fun `falls back to content description when there is no text`() {
        assertEquals("Type a message", messageField.label)
    }

    @Test
    fun `ignores blank text when choosing a label`() {
        val blank = UiNode(text = "   ", contentDescription = "Attach")
        assertEquals("Attach", blank.label)
    }

    @Test
    fun `has no label when neither text nor description is present`() {
        assertNull(UiNode(className = "android.view.View").label)
    }

    @Test
    fun `extracts the short resource id name`() {
        assertEquals("send_button", sendButton.resourceIdName)
    }

    @Test
    fun `treats a clickable enabled visible node as actionable`() {
        assertTrue(sendButton.isActionable)
    }

    @Test
    fun `does not treat a disabled node as actionable`() {
        assertFalse(sendButton.copy(enabled = false).isActionable)
    }

    @Test
    fun `does not treat a zero-area node as actionable even when clickable`() {
        assertFalse(sendButton.copy(bounds = Bounds.EMPTY).isActionable)
    }

    @Test
    fun `treats an editable field as actionable so text can be typed into it`() {
        assertTrue(messageField.isActionable)
    }

    @Test
    fun `flattens the subtree depth-first in document order`() {
        val flattened = tree.flatten()
        assertEquals(4, flattened.size)
        assertEquals("android.widget.FrameLayout", flattened[0].className)
        assertEquals("com.whatsapp:id/entry", flattened[2].resourceId)
        assertEquals("com.whatsapp:id/send_button", flattened[3].resourceId)
    }

    @Test
    fun `finds the first node matching a predicate`() {
        val found = tree.find { it.resourceIdName == "send_button" }
        assertEquals("Send", found?.text)
    }

    @Test
    fun `returns null when nothing matches`() {
        assertNull(tree.find { it.text == "Nonexistent" })
    }

    @Test
    fun `filters to actionable nodes only`() {
        assertEquals(2, tree.filter { it.isActionable }.size)
    }

    @Test
    fun `reports subtree size and depth`() {
        assertEquals(4, tree.size())
        assertEquals(3, tree.depth())
        assertEquals(1, sendButton.depth())
    }

    @Test
    fun `identifies leaves`() {
        assertTrue(sendButton.isLeaf)
        assertFalse(tree.isLeaf)
    }
}
