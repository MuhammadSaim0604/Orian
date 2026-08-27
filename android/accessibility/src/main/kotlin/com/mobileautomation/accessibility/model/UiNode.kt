package com.mobileautomation.accessibility.model

/**
 * One element of the on-screen UI hierarchy.
 *
 * This is the single most important data structure in the product: the AI reads
 * it to understand the screen, the selector resolver searches it, and the
 * recorder stores it. It is a pure Kotlin type with no Android dependency so it
 * can be built in tests and serialized identically everywhere.
 *
 * Field names must match `UiNodeAttribute` and the TypeScript
 * `screen-inspector` contract.
 */
data class UiNode(
    val text: String? = null,
    val resourceId: String? = null,
    val className: String? = null,
    val contentDescription: String? = null,
    val packageName: String? = null,
    val bounds: Bounds = Bounds.EMPTY,
    val clickable: Boolean = false,
    val longClickable: Boolean = false,
    val scrollable: Boolean = false,
    val editable: Boolean = false,
    val checkable: Boolean = false,
    val checked: Boolean = false,
    val selected: Boolean = false,
    val focused: Boolean = false,
    val enabled: Boolean = true,
    val visible: Boolean = true,
    /** Position among its siblings, so a structural path can be rebuilt. */
    val index: Int = 0,
    val children: List<UiNode> = emptyList(),
) {
    val isLeaf: Boolean get() = children.isEmpty()

    /**
     * Whether this node can be acted on directly. A node that is disabled or
     * has no area is not a usable target even when it claims to be clickable.
     */
    val isActionable: Boolean
        get() = (clickable || longClickable || editable) && enabled && visible && !bounds.isEmpty

    /** Human-meaningful label, preferring visible text over the a11y description. */
    val label: String?
        get() = text?.takeIf { it.isNotBlank() } ?: contentDescription?.takeIf { it.isNotBlank() }

    /**
     * The last segment of a fully-qualified resource id
     * (`com.example:id/send_button` becomes `send_button`).
     */
    val resourceIdName: String?
        get() = resourceId?.substringAfterLast('/')?.takeIf { it.isNotBlank() }

    /** This node followed by every descendant, depth-first in document order. */
    fun flatten(): List<UiNode> {
        val collected = ArrayList<UiNode>()
        collectInto(collected)
        return collected
    }

    /** Depth-first search for the first node matching [predicate]. */
    fun find(predicate: (UiNode) -> Boolean): UiNode? {
        if (predicate(this)) return this
        for (child in children) {
            val match = child.find(predicate)
            if (match != null) return match
        }
        return null
    }

    fun filter(predicate: (UiNode) -> Boolean): List<UiNode> = flatten().filter(predicate)

    /** Total node count of this subtree, used to guard against runaway trees. */
    fun size(): Int = 1 + children.sumOf { it.size() }

    /** Deepest nesting level below this node; a leaf has depth 1. */
    fun depth(): Int = 1 + (children.maxOfOrNull { it.depth() } ?: 0)

    private fun collectInto(target: MutableList<UiNode>) {
        target.add(this)
        for (child in children) {
            child.collectInto(target)
        }
    }
}
