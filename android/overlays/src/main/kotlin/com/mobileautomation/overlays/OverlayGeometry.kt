package com.mobileautomation.overlays

/**
 * Computes overlay geometry for a given screen.
 *
 * All the arithmetic that decides whether the floating toolset is usable lives
 * here, in one pure class, because getting it wrong produces an overlay that
 * covers the thing the user is trying to configure, or drifts off screen where it
 * cannot be dismissed - and neither is recoverable without killing the app.
 *
 * Margins and minimum sizes are **dp**, converted here for `WindowManager`, which wants physical
 * pixels. The two are interchangeable only on a 160dpi screen, so declaring them as pixels produces a
 * panel that shrinks as screen density rises - which is exactly what happened to the agent status strip.
 *
 * @param screenWidthPx display width in physical pixels.
 * @param screenHeightPx display height in physical pixels.
 * @param density physical pixels per dp, from `DisplayMetrics.density`.
 * @param statusBarHeightPx inset at the top the overlay must not cover, in physical pixels.
 * @param navigationBarHeightPx inset at the bottom, likewise.
 */
class OverlayGeometry(
    private val screenWidthPx: Int,
    private val screenHeightPx: Int,
    private val density: Density = Density.REFERENCE,
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

    private val horizontalMarginPx: Int get() = density.toPx(HORIZONTAL_MARGIN_DP)

    private val bottomMarginPx: Int get() = density.toPx(BOTTOM_MARGIN_DP)

    /**
     * Builds a spec for [layout], anchored near the bottom of the screen where a
     * thumb can reach it, sized to that layout's height budget.
     */
    fun specFor(layout: OverlayLayout): OverlayWindowSpec {
        val height = heightFor(layout)
        val width =
            (screenWidthPx - (2 * horizontalMarginPx))
                .coerceAtLeast(density.toPx(MIN_WIDTH_DP).coerceAtMost(screenWidthPx))

        // Anchored above the navigation bar: the toolset is operated by thumb, and
        // content the user is inspecting is usually higher up the screen.
        val top = (usableBottom - height - bottomMarginPx).coerceAtLeast(usableTop)

        return OverlayWindowSpec(
            position = OverlayPoint(x = horizontalMarginPx, y = top),
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
        val minimum = density.toPx(MIN_HEIGHT_DP).coerceAtMost(usableHeight)
        return requested.coerceIn(minimum, usableHeight)
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
        const val HORIZONTAL_MARGIN_DP: Int = 16

        /** Gap above the navigation bar so the overlay is not flush against it. */
        const val BOTTOM_MARGIN_DP: Int = 24

        /** Below this an overlay cannot show a usable control. */
        const val MIN_WIDTH_DP: Int = 120
        const val MIN_HEIGHT_DP: Int = 96

        /** Rounding slack when comparing computed height against its budget. */
        const val FRACTION_TOLERANCE: Double = 0.01
    }
}
