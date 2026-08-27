package com.mobileautomation.accessibility.parser

import com.mobileautomation.accessibility.model.Bounds

/**
 * In-memory [NodeSource] for unit tests.
 *
 * Also tracks whether [recycle] was called, which lets tests assert the walker
 * releases every platform node it obtains - a leak that is otherwise invisible
 * until it degrades a real device.
 */
class FakeNodeSource(
    override val text: String? = null,
    override val resourceId: String? = null,
    override val className: String? = null,
    override val contentDescription: String? = null,
    override val packageName: String? = null,
    override val bounds: Bounds = Bounds.EMPTY,
    override val isClickable: Boolean = false,
    override val isLongClickable: Boolean = false,
    override val isScrollable: Boolean = false,
    override val isEditable: Boolean = false,
    override val isCheckable: Boolean = false,
    override val isChecked: Boolean = false,
    override val isSelected: Boolean = false,
    override val isFocused: Boolean = false,
    override val isEnabled: Boolean = true,
    override val isVisibleToUser: Boolean = true,
    private val children: List<FakeNodeSource> = emptyList(),
    /** When set, [childAt] returns null at this index to mimic a platform miss. */
    private val nullChildAt: Int? = null,
) : NodeSource {
    var recycled: Boolean = false
        private set

    override val childCount: Int get() = children.size

    override fun childAt(index: Int): NodeSource? {
        if (index == nullChildAt) return null
        return children.getOrNull(index)
    }

    override fun recycle() {
        recycled = true
    }

    /** Every node in this subtree, for asserting recycling across the whole walk. */
    fun subtree(): List<FakeNodeSource> = listOf(this) + children.flatMap { it.subtree() }
}
