package com.mobileautomation.overlays

/**
 * A point on screen in device pixels.
 *
 * Local to this module rather than shared: an overlay's position is a property of
 * the window, and the overlay layer must not depend on the accessibility or
 * gesture modules (dependency direction, `conventions/Coding_Conventions.md`).
 */
data class OverlayPoint(val x: Int, val y: Int)

/** A size in device pixels. */
data class OverlaySize(val widthPx: Int, val heightPx: Int) {
    init {
        require(widthPx > 0 && heightPx > 0) {
            "overlay size must be positive, was ${widthPx}x$heightPx"
        }
    }
}

/**
 * Where an overlay window sits and how large it is.
 *
 * Computed rather than hardcoded because the Configure-with-AI toolset must stay
 * usable on every screen: it has to remain fully on screen, clear of the status
 * and navigation bars, and small enough that the user can still see the app it is
 * configuring (Phase 8).
 */
data class OverlayWindowSpec(
    val position: OverlayPoint,
    val size: OverlaySize,
    val layout: OverlayLayout,
) {
    val left: Int get() = position.x

    val top: Int get() = position.y

    val right: Int get() = position.x + size.widthPx

    val bottom: Int get() = position.y + size.heightPx

    /** Fraction of the screen height this window occupies. */
    fun heightFractionOf(screenHeightPx: Int): Double {
        require(screenHeightPx > 0) { "screenHeightPx must be positive" }
        return size.heightPx.toDouble() / screenHeightPx
    }
}
