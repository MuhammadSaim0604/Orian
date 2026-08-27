package com.mobileautomation.accessibility.parser

import android.graphics.Rect
import android.view.accessibility.AccessibilityNodeInfo
import com.mobileautomation.accessibility.model.Bounds

/**
 * Adapts a platform [AccessibilityNodeInfo] to [NodeSource].
 *
 * All Android-specific handling lives here, so [UiTreeWalker] stays pure and
 * testable. Nothing in this class is unit-tested on the JVM - it is covered by
 * instrumentation tests, because `AccessibilityNodeInfo` cannot be constructed
 * meaningfully off-device.
 */
class AccessibilityNodeSource(
    private val node: AccessibilityNodeInfo,
) : NodeSource {
    override val text: String? get() = node.text?.toString()

    override val resourceId: String? get() = node.viewIdResourceName

    override val className: String? get() = node.className?.toString()

    override val contentDescription: String? get() = node.contentDescription?.toString()

    override val packageName: String? get() = node.packageName?.toString()

    override val bounds: Bounds
        get() {
            val rect = Rect()
            node.getBoundsInScreen(rect)
            return Bounds(rect.left, rect.top, rect.right, rect.bottom)
        }

    override val isClickable: Boolean get() = node.isClickable

    override val isLongClickable: Boolean get() = node.isLongClickable

    override val isScrollable: Boolean get() = node.isScrollable

    override val isEditable: Boolean get() = node.isEditable

    override val isCheckable: Boolean get() = node.isCheckable

    override val isChecked: Boolean get() = node.isChecked

    override val isSelected: Boolean get() = node.isSelected

    override val isFocused: Boolean get() = node.isFocused

    override val isEnabled: Boolean get() = node.isEnabled

    override val isVisibleToUser: Boolean get() = node.isVisibleToUser

    override val childCount: Int get() = node.childCount

    override fun childAt(index: Int): NodeSource? = node.getChild(index)?.let { AccessibilityNodeSource(it) }

    @Suppress("DEPRECATION")
    override fun recycle() {
        // recycle() is deprecated from API 33 where it became a no-op, but on
        // API 26-32 - which this app supports - failing to call it leaks.
        runCatching { node.recycle() }
    }
}
