package com.mobileautomation.accessibility.selector

import com.mobileautomation.accessibility.model.UiNode

/**
 * Structural paths: how a node in a captured tree is addressed in the live hierarchy.
 *
 * A path is a dot-separated chain of child indices from the root — `0.2.1`. The accessibility service
 * re-walks it with `getChild(index)` against the *live* tree, because a parsed [UiNode] is an immutable
 * snapshot with no link back to the platform node it came from.
 *
 * ## Why this is shared rather than inlined
 *
 * The index in a path must be the child's **live platform position**, not its position in the parsed
 * children list. Those differ whenever a sibling was skipped, and `UiTreeWalker` skips every invisible
 * node — which on a long list is most of them.
 *
 * Getting that wrong was a real bug with no visible symptom: the resolver built paths from list positions
 * while the service resolved them against live indices, so `performClick` and `setText` acted on a
 * different node than the one that had been matched. A tap landed on the wrong row, and the runtime
 * reported success.
 *
 * Two places need the same answer — the resolver, building paths, and the runtime, walking back down one to
 * find a clickable ancestor or an editable child. A second copy of this rule would eventually disagree with
 * the first, and the disagreement would again be silent.
 */
object StructuralPath {
    /** Path assigned to the tree root; children extend it. */
    const val ROOT: String = "0"

    /**
     * Whether [node]'s children carry usable live indices.
     *
     * Duplicated indices mean they were never set — a hand-built tree, or a fixture. Positions are used
     * then, because a duplicated path would make two different nodes indistinguishable, which is worse than
     * an index that addresses nothing.
     */
    fun hasLiveIndices(node: UiNode): Boolean = node.children.map { it.index }.distinct().size == node.children.size

    /** The path of [node]'s child at list [position], extending [parentPath]. */
    fun childPath(
        parentPath: String,
        node: UiNode,
        position: Int,
    ): String {
        val child = node.children[position]
        val segment = if (hasLiveIndices(node)) child.index else position
        return "$parentPath.$segment"
    }

    /**
     * The node [path] addresses within [root], or null when it addresses none.
     *
     * Searches by the same rule [childPath] writes with, so a path produced by the resolver resolves back to
     * the node it was produced from.
     */
    fun nodeAt(
        root: UiNode,
        path: String,
    ): UiNode? {
        val segments = path.split('.')
        if (segments.size == 1) return root

        var current = root

        for (segment in segments.drop(1)) {
            val index = segment.toIntOrNull() ?: return null

            current =
                if (hasLiveIndices(current)) {
                    current.children.firstOrNull { it.index == index }
                } else {
                    current.children.getOrNull(index)
                } ?: return null
        }

        return current
    }
}
