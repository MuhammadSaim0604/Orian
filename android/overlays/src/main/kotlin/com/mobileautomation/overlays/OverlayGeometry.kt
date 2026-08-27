package com.mobileautomation.overlays

/**
 * Computes overlay geometry for a given screen.
 *
 * All the arithmetic that decides whether the floating toolset is usable lives
 * here, in one pure class, because getting it wrong produces an overlay that
 * covers the thing the user is trying to configure, or drifts off screen where it
 * cannot be dismissed - and neither is recoverable without killing the app.
 *
 * @param screenWidthPx display width in pixels.
 * @param screenHeightPx display height in pixels.
 * @param statusBarHeightPx inset at the top the overlay must not cover.
 * @param navigationBarHeightPx inset at the bottom, likewise.
 */
class OverlayGeometry(
    private val screenWidthPx: Int,
    private val screenHeightPx: Int,
    private val statusBarHeightPx: Int = 0,
    private val navigationBarHeightPx: Int = 0,
) {
    init {
        require(screenWidthPx > 0 && screenHeightPx > 0) {
            "screen size must be positive, was ${screenWidthPx}x$screenHeightPx"
        }
        require(statusBarHeightPx >= 0 && navigationBarHeightPx >= 0) {
            "system bar insets cannot be negative"
        }
        require(statusBarHeightPx + navigationBarHeightPx < screenHeightPx) {
            "system bars cannot consume the whole screen"
        }
    }

    /** Top edge of the area an overlay may occupy. */
    val usableTop: Int get() = statusBarHeightPx

    /** Bottom edge, exclusive. */
    val usableBottom: Int get() = screenHeightPx - navigationBarHeightPx

    val usableHeight: Int get() = usableBottom - usableTop

    /**
     * Builds a spec for [layout], anchored near the bottom of the screen where a
     * thumb can reach it, sized to that layout's height budget.
     */
    fun specFor(layout: OverlayLayout): OverlayWindowSpec {
        val height = heightFor(layout)
        val width = (screenWidthPx - (2 * HORIZONTAL_MARGIN_PX)).coerceAtLeast(MIN_WIDTH_PX)

        // Anchored above the navigation bar: the toolset is operated by thumb, and
        // content the user is inspecting is usually higher up the screen.
        val top = (usableBottom - height - BOTTOM_MARGIN_PX).coerceAtLeast(usableTop)

        return OverlayWindowSpec(
            position = OverlayPoint(x = HORIZONTAL_MARGIN_PX, y = top),
            size = OverlaySize(widthPx = width, heightPx = height),
            layout = layout,
        )
    }

    /**
     * Height for [layout], capped so the overlay can never exceed its own budget
     * or the usable area.
     */
    fun heightFor(layout: OverlayLayout): Int {
        val requested = (usableHeight * layout.maxScreenHeightFraction).toInt()
        return requested.coerceIn(MIN_HEIGHT_PX, usableHeight)
    }

    /**
     * Moves [spec] to [target], keeping the whole window on screen.
     *
     * Clamping rather than rejecting: the user drags the toolset around, and a
     * drag that would push it half off screen should stop at the edge rather than
     * snap back or strand the window somewhere unreachable.
     */
    fun moveWithinScreen(
        spec: OverlayWindowSpec,
        target: OverlayPoint,
    ): OverlayWindowSpec {
        val maxX = (screenWidthPx - spec.size.widthPx).coerceAtLeast(0)
        val maxY = (usableBottom - spec.size.heightPx).coerceAtLeast(usableTop)

        return spec.copy(
            position =
                OverlayPoint(
                    x = target.x.coerceIn(0, maxX),
                    y = target.y.coerceIn(usableTop, maxY),
                ),
        )
    }

    /**
     * Switches [spec] to [layout], resizing it and pulling it back on screen if
     * expanding would push it past the bottom.
     */
    fun applyLayout(
        spec: OverlayWindowSpec,
        layout: OverlayLayout,
    ): OverlayWindowSpec {
        val resized =
            spec.copy(
                size = OverlaySize(spec.size.widthPx, heightFor(layout)),
                layout = layout,
            )
        return moveWithinScreen(resized, resized.position)
    }

    /** True when the whole window lies inside the usable area. */
    fun isFullyOnScreen(spec: OverlayWindowSpec): Boolean =
        spec.left >= 0 &&
            spec.right <= screenWidthPx &&
            spec.top >= usableTop &&
            spec.bottom <= usableBottom

    /**
     * True when the overlay still leaves enough of the app visible to be worth
     * configuring against.
     */
    fun leavesAppVisible(spec: OverlayWindowSpec): Boolean =
        leavesScreenUsable(spec.layout) &&
            spec.heightFractionOf(screenHeightPx) <=
            spec.layout.maxScreenHeightFraction + FRACTION_TOLERANCE

    companion object {
        /** Keeps the toolset clear of the screen edges and rounded corners. */
        const val HORIZONTAL_MARGIN_PX: Int = 16

        /** Gap above the navigation bar so the overlay is not flush against it. */
        const val BOTTOM_MARGIN_PX: Int = 24

        /** Below this an overlay cannot show a usable control. */
        const val MIN_WIDTH_PX: Int = 120
        const val MIN_HEIGHT_PX: Int = 96

        /** Rounding slack when comparing computed height against its budget. */
        const val FRACTION_TOLERANCE: Double = 0.01
    }
}
