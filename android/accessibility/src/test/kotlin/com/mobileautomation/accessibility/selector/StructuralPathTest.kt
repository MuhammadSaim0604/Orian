package com.mobileautomation.accessibility.selector

import com.mobileautomation.accessibility.model.Bounds
import com.mobileautomation.accessibility.model.UiNode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Structural paths, and the bug they exist to prevent.
 *
 * A path is resolved by the accessibility service with `getChild(index)` against the **live** hierarchy. The
 * resolver builds paths from a parsed tree whose children have been *filtered* - `UiTreeWalker` skips every
 * invisible node, which on a long list is most of them.
 *
 * So a path built from a child's position in the parsed list addresses a different node than the one it was
 * built for. That failed silently: the resolver matched the right element, the service acted on the wrong one,
 * and the runtime reported success. These tests hold the two halves in agreement.
 */
class StructuralPathTest {
    private fun node(
        index: Int,
        text: String,
        children: List<UiNode> = emptyList(),
    ) = UiNode(text = text, index = index, bounds = Bounds(0, 0, 10, 10), children = children)

    @Test
    fun `child path uses the live platform index, not the list position`() {
        // Children 0, 2 and 5 survived the walk; 1, 3 and 4 were invisible. The second surviving child is at
        // list position 1 but live index 2, and the live index is what the service will ask for.
        val parent =
            node(0, "row", listOf(node(0, "first"), node(2, "second"), node(5, "third")))

        assertEquals("0.2", StructuralPath.childPath("0", parent, 1))
        assertEquals("0.5", StructuralPath.childPath("0", parent, 2))
    }

    @Test
    fun `falls back to list positions when indices were never set`() {
        // A hand-built tree, or a fixture: every child reports index 0. Duplicated paths would make two
        // different nodes indistinguishable, which is worse than an index that addresses nothing.
        val parent = node(0, "row", listOf(node(0, "a"), node(0, "b"), node(0, "c")))

        assertEquals("0.0", StructuralPath.childPath("0", parent, 0))
        assertEquals("0.1", StructuralPath.childPath("0", parent, 1))
        assertEquals("0.2", StructuralPath.childPath("0", parent, 2))
    }

    @Test
    fun `detects usable indices`() {
        assertTrue(StructuralPath.hasLiveIndices(node(0, "row", listOf(node(0, "a"), node(3, "b")))))
        assertFalse(StructuralPath.hasLiveIndices(node(0, "row", listOf(node(1, "a"), node(1, "b")))))
    }

    @Test
    fun `a path resolves back to the node it was built for`() {
        // The property that matters. If these two ever disagree, a tap lands on a neighbouring row.
        val target = node(4, "target")
        val parent = node(0, "row", listOf(node(0, "first"), target))
        val root = node(0, "root", listOf(parent))

        val path = StructuralPath.childPath(StructuralPath.childPath("0", root, 0), parent, 1)

        assertEquals("0.0.4", path)
        assertEquals("target", StructuralPath.nodeAt(root, path)?.text)
    }

    @Test
    fun `the root path addresses the root`() {
        val root = node(0, "root")
        assertEquals("root", StructuralPath.nodeAt(root, StructuralPath.ROOT)?.text)
    }

    @Test
    fun `an index no child carries addresses nothing`() {
        // Reported as absent rather than silently clamped to a neighbour: acting on the wrong node is the
        // failure being avoided.
        val root = node(0, "root", listOf(node(0, "only")))

        assertNull(StructuralPath.nodeAt(root, "0.7"))
    }

    @Test
    fun `a non-numeric segment addresses nothing`() {
        // `SelectorResolver` reports a vision match with the path "vision", which is deliberately not a path.
        val root = node(0, "root", listOf(node(0, "only")))

        assertNull(StructuralPath.nodeAt(root, "0.vision"))
    }
}
