package com.mobileautomation.accessibility.service

/**
 * Performs actions directly on a live node.
 *
 * Separate from [ScreenReader] because reading and acting are different trust
 * levels, and because most callers only need to read.
 *
 * Nodes are addressed by structural path - the child-index chain from the root, as
 * produced by the selector resolver - because a parsed [com.mobileautomation.accessibility.model.UiNode]
 * is an immutable snapshot with no link back to the platform node it came from.
 * The path lets the service re-walk to the live node it must act on.
 */
interface NodeActionPerformer {
    /**
     * Sets the text of an editable node.
     *
     * Preferred over synthesising key events: injection depends on the active
     * keyboard, drops non-ASCII characters, and silently does nothing on some
     * input fields.
     */
    fun setText(
        structuralPath: String,
        text: String,
    ): Boolean

    /**
     * Invokes the node's own click action.
     *
     * Sometimes succeeds where a coordinate tap fails - a node overlapped by
     * another view, or one whose touch target sits outside its reported bounds.
     */
    fun performClick(structuralPath: String): Boolean

    /** Focuses a node, which some fields require before they accept text. */
    fun performFocus(structuralPath: String): Boolean
}
