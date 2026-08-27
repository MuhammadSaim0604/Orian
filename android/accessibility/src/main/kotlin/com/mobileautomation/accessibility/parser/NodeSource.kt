package com.mobileautomation.accessibility.parser

import com.mobileautomation.accessibility.model.Bounds

/**
 * A source of node data, abstracted away from `AccessibilityNodeInfo`.
 *
 * The real implementation wraps a platform node; tests supply a fake. This is
 * what makes the tree walker - the trickiest part of the accessibility layer,
 * with its recursion, depth limits, and cycle detection - testable as plain
 * JUnit rather than only on a device.
 */
interface NodeSource {
    val text: String?
    val resourceId: String?
    val className: String?
    val contentDescription: String?
    val packageName: String?
    val bounds: Bounds
    val isClickable: Boolean
    val isLongClickable: Boolean
    val isScrollable: Boolean
    val isEditable: Boolean
    val isCheckable: Boolean
    val isChecked: Boolean
    val isSelected: Boolean
    val isFocused: Boolean
    val isEnabled: Boolean
    val isVisibleToUser: Boolean
    val childCount: Int

    /** Child at [index], or null when the platform returns nothing. */
    fun childAt(index: Int): NodeSource?

    /**
     * Releases the underlying platform node.
     *
     * `AccessibilityNodeInfo` instances come from a pooled allocator and leak if
     * not recycled, so the walker calls this for every node it obtains.
     */
    fun recycle()
}
