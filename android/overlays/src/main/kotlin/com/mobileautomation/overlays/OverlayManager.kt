package com.mobileautomation.overlays

/**
 * Shows and hides the floating overlay.
 *
 * An interface so the Phase 8 Configure-with-AI flow can be driven in tests
 * without a `WindowManager`, and so the RN-hosting implementation can be swapped
 * in without touching callers.
 *
 * Every overlay is bound to a node id: the AI is always configuring one specific
 * node, and an unbound overlay would leave the model guessing what it is looking
 * at.
 */
interface OverlayManager {
    /** True when an overlay is currently displayed. */
    val isShowing: Boolean

    /** Node id the visible overlay is bound to, or null when nothing is shown. */
    val boundNodeId: String?

    /** Geometry of the visible overlay, or null when nothing is shown. */
    val currentSpec: OverlayWindowSpec?

    /**
     * Shows the overlay for [nodeId].
     *
     * Returns false when the overlay permission has not been granted - the user
     * must allow "display over other apps" in system settings first, and there is
     * no way to grant it silently.
     */
    fun show(
        nodeId: String,
        layout: OverlayLayout = OverlayLayout.COMPACT,
    ): Boolean

    /** Switches between the compact and expanded toolsets. */
    fun setLayout(layout: OverlayLayout): Boolean

    /** Moves the overlay, clamped on screen. */
    fun moveTo(
        x: Int,
        y: Int,
    ): Boolean

    /** Hides the overlay and releases its window. */
    fun hide()
}
