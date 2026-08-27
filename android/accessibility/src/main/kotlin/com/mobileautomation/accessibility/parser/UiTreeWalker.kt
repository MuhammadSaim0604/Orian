package com.mobileautomation.accessibility.parser

import com.mobileautomation.accessibility.model.UiNode

/**
 * Walks a [NodeSource] hierarchy into an immutable [UiNode] tree.
 *
 * Real-world screens produce hostile input: RecyclerViews with thousands of
 * off-screen children, deeply nested layouts, and occasionally cyclic or
 * self-referential node graphs. The walker therefore enforces hard limits and
 * always recycles what it obtains.
 *
 * @param maxDepth stop descending past this depth.
 * @param maxNodes stop after collecting this many nodes in total.
 * @param includeInvisible when false, nodes not visible to the user and their
 *   subtrees are skipped. Invisible nodes are noise for both the AI and the
 *   selector resolver, and they are the bulk of a long list.
 */
class UiTreeWalker(
    private val maxDepth: Int = DEFAULT_MAX_DEPTH,
    private val maxNodes: Int = DEFAULT_MAX_NODES,
    private val includeInvisible: Boolean = false,
) {
    init {
        require(maxDepth > 0) { "maxDepth must be positive, was $maxDepth" }
        require(maxNodes > 0) { "maxNodes must be positive, was $maxNodes" }
    }

    /** Result of a walk, including whether either limit truncated the tree. */
    data class Result(
        val root: UiNode,
        val nodeCount: Int,
        val truncatedByDepth: Boolean,
        val truncatedByNodeLimit: Boolean,
    ) {
        val wasTruncated: Boolean get() = truncatedByDepth || truncatedByNodeLimit
    }

    fun walk(root: NodeSource): Result {
        val state = WalkState()
        val node = visit(root, depth = 1, index = 0, state = state)
        return Result(
            root = node ?: UiNode(),
            nodeCount = state.visited,
            truncatedByDepth = state.truncatedByDepth,
            truncatedByNodeLimit = state.truncatedByNodeLimit,
        )
    }

    private fun visit(
        source: NodeSource,
        depth: Int,
        index: Int,
        state: WalkState,
    ): UiNode? {
        if (state.visited >= maxNodes) {
            state.truncatedByNodeLimit = true
            return null
        }

        if (!includeInvisible && !source.isVisibleToUser) return null

        state.visited++

        val children = ArrayList<UiNode>()
        if (depth >= maxDepth) {
            if (source.childCount > 0) state.truncatedByDepth = true
        } else {
            collectChildren(source, depth, state, children)
        }

        return UiNode(
            text = source.text?.takeIf { it.isNotEmpty() },
            resourceId = source.resourceId?.takeIf { it.isNotEmpty() },
            className = source.className?.takeIf { it.isNotEmpty() },
            contentDescription = source.contentDescription?.takeIf { it.isNotEmpty() },
            packageName = source.packageName?.takeIf { it.isNotEmpty() },
            bounds = source.bounds,
            clickable = source.isClickable,
            longClickable = source.isLongClickable,
            scrollable = source.isScrollable,
            editable = source.isEditable,
            checkable = source.isCheckable,
            checked = source.isChecked,
            selected = source.isSelected,
            focused = source.isFocused,
            enabled = source.isEnabled,
            visible = source.isVisibleToUser,
            index = index,
            children = children,
        )
    }

    private fun collectChildren(
        source: NodeSource,
        depth: Int,
        state: WalkState,
        into: MutableList<UiNode>,
    ) {
        for (childIndex in 0 until source.childCount) {
            if (state.visited >= maxNodes) {
                state.truncatedByNodeLimit = true
                return
            }
            val child = source.childAt(childIndex) ?: continue
            try {
                val parsed = visit(child, depth + 1, childIndex, state)
                if (parsed != null) into.add(parsed)
            } finally {
                // Always recycle, even if parsing this child threw: a leaked
                // AccessibilityNodeInfo is a permanent resource loss.
                child.recycle()
            }
        }
    }

    private class WalkState {
        var visited: Int = 0
        var truncatedByDepth: Boolean = false
        var truncatedByNodeLimit: Boolean = false
    }

    companion object {
        /**
         * Real Android hierarchies rarely exceed ~30 levels; past that it is
         * almost certainly a cycle or pathological layout.
         */
        const val DEFAULT_MAX_DEPTH: Int = 40

        /**
         * Enough for a dense screen, small enough that serialization and model
         * context stay bounded.
         */
        const val DEFAULT_MAX_NODES: Int = 3_000
    }
}
