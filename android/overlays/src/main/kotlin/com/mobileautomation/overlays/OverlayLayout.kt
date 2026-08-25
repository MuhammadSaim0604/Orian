package com.mobileautomation.overlays

/**
 * Layout modes for the Configure-with-AI floating toolset.
 *
 * The overlay hosts React Native content and is bound to a node id, so the AI
 * always knows which node it is configuring (Phase 8). The compact mode exists
 * because the toolset must not cover the screen the user is inspecting - an
 * eye toggle reveals the rest of the tools.
 */
enum class OverlayLayout(val visibleToolCount: Int, val maxScreenHeightFraction: Double) {
    /** A few essential tools, deliberately small. */
    COMPACT(4, 0.30),

    /** Everything revealed by the eye toggle. */
    EXPANDED(12, 0.75),
    ;

    companion object {
        /**
         * The compact toolset must leave most of the screen visible, otherwise
         * the user cannot see what they are configuring.
         */
        const val MAX_COMPACT_HEIGHT_FRACTION: Double = 0.40
    }
}

/** True when a layout leaves enough of the underlying screen visible to be usable. */
fun leavesScreenUsable(layout: OverlayLayout): Boolean =
    when (layout) {
        OverlayLayout.COMPACT ->
            layout.maxScreenHeightFraction <= OverlayLayout.MAX_COMPACT_HEIGHT_FRACTION
        OverlayLayout.EXPANDED -> layout.maxScreenHeightFraction < 1.0
    }
