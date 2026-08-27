package com.mobileautomation.accessibility.parser

import com.mobileautomation.accessibility.model.Bounds
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UiTreeWalkerTest {
    @Test
    fun `copies every attribute across to the parsed node`() {
        val source =
            FakeNodeSource(
                text = "Send",
                resourceId = "com.whatsapp:id/send_button",
                className = "android.widget.ImageButton",
                contentDescription = "Send message",
                packageName = "com.whatsapp",
                bounds = Bounds(900, 1800, 1050, 1950),
                isClickable = true,
                isEnabled = true,
            )

        val node = UiTreeWalker().walk(source).root

        assertEquals("Send", node.text)
        assertEquals("com.whatsapp:id/send_button", node.resourceId)
        assertEquals("android.widget.ImageButton", node.className)
        assertEquals("Send message", node.contentDescription)
        assertEquals("com.whatsapp", node.packageName)
        assertEquals(Bounds(900, 1800, 1050, 1950), node.bounds)
        assertTrue(node.clickable)
    }

    @Test
    fun `normalises empty strings to null so selectors do not match on blanks`() {
        val node = UiTreeWalker().walk(FakeNodeSource(text = "", resourceId = "")).root
        assertEquals(null, node.text)
        assertEquals(null, node.resourceId)
    }

    @Test
    fun `preserves sibling order and index`() {
        val source =
            FakeNodeSource(
                children =
                    listOf(
                        FakeNodeSource(text = "first"),
                        FakeNodeSource(text = "second"),
                        FakeNodeSource(text = "third"),
                    ),
            )

        val children = UiTreeWalker().walk(source).root.children

        assertEquals(listOf("first", "second", "third"), children.map { it.text })
        assertEquals(listOf(0, 1, 2), children.map { it.index })
    }

    @Test
    fun `skips invisible nodes and their subtrees by default`() {
        val source =
            FakeNodeSource(
                children =
                    listOf(
                        FakeNodeSource(text = "visible"),
                        FakeNodeSource(
                            text = "hidden",
                            isVisibleToUser = false,
                            children = listOf(FakeNodeSource(text = "hidden child")),
                        ),
                    ),
            )

        val result = UiTreeWalker().walk(source)

        assertEquals(1, result.root.children.size)
        assertEquals("visible", result.root.children.first().text)
        assertEquals(2, result.nodeCount)
    }

    @Test
    fun `includes invisible nodes when asked to`() {
        val source =
            FakeNodeSource(
                children = listOf(FakeNodeSource(text = "hidden", isVisibleToUser = false)),
            )

        val result = UiTreeWalker(includeInvisible = true).walk(source)

        assertEquals(1, result.root.children.size)
        assertFalse(result.root.children.first().visible)
    }

    @Test
    fun `stops descending at the depth limit and reports truncation`() {
        val deep = chain(depth = 10)

        val result = UiTreeWalker(maxDepth = 3).walk(deep)

        assertEquals(3, result.root.depth())
        assertTrue(result.truncatedByDepth)
        assertTrue(result.wasTruncated)
    }

    @Test
    fun `does not report depth truncation when the tree fits`() {
        val result = UiTreeWalker(maxDepth = 10).walk(chain(depth = 3))
        assertFalse(result.truncatedByDepth)
        assertFalse(result.wasTruncated)
    }

    @Test
    fun `stops at the node limit on a huge list and reports truncation`() {
        val hugeList =
            FakeNodeSource(
                className = "androidx.recyclerview.widget.RecyclerView",
                children = (1..500).map { FakeNodeSource(text = "row $it") },
            )

        val result = UiTreeWalker(maxNodes = 50).walk(hugeList)

        assertEquals(50, result.nodeCount)
        assertTrue(result.truncatedByNodeLimit)
    }

    @Test
    fun `recycles every child node it obtains`() {
        val source =
            FakeNodeSource(
                children =
                    listOf(
                        FakeNodeSource(text = "a", children = listOf(FakeNodeSource(text = "a1"))),
                        FakeNodeSource(text = "b"),
                    ),
            )

        UiTreeWalker().walk(source)

        val children = source.subtree().drop(1)
        assertTrue(children.isNotEmpty())
        assertTrue(children.all { it.recycled })
    }

    @Test
    fun `tolerates a null child from the platform`() {
        val source =
            FakeNodeSource(
                children = listOf(FakeNodeSource(text = "a"), FakeNodeSource(text = "b")),
                nullChildAt = 0,
            )

        val result = UiTreeWalker().walk(source)

        assertEquals(1, result.root.children.size)
        assertEquals("b", result.root.children.first().text)
    }

    @Test
    fun `rejects a non-positive depth limit`() {
        val error = runCatching { UiTreeWalker(maxDepth = 0) }.exceptionOrNull()
        assertTrue(error is IllegalArgumentException)
    }

    @Test
    fun `rejects a non-positive node limit`() {
        val error = runCatching { UiTreeWalker(maxNodes = 0) }.exceptionOrNull()
        assertTrue(error is IllegalArgumentException)
    }

    private fun chain(depth: Int): FakeNodeSource =
        if (depth <= 1) {
            FakeNodeSource(text = "leaf")
        } else {
            FakeNodeSource(text = "level$depth", children = listOf(chain(depth - 1)))
        }
}
