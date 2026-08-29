package com.mobileautomation.overlays

/**
 * Geometry for the **agent status overlay**.
 *
 * A separate class from [OverlayGeometry] rather than a parameter on it, because the two overlays are
 * different shapes with different rules and merging them would produce a class made of `if` branches:
 *
 * - the node toolset is a wide panel anchored near the bottom, where a thumb reaches it;
 * - the agent status overlay is a **narrow strip on the right edge**, vertically centred, obscuring as
 *   little as possible - the user is watching their own phone being driven and needs to see what is
 *   happening underneath.
 *
 * Collapsed it is a thin tab showing the current task and a stop button. Expanded it becomes a panel
 * wide enough for a compact chat, still leaving the app visible above and below.
 *
 * @param screenWidthPx display width in pixels.
 * @param screenHeightPx display height in pixels.
 * @param statusBarHeightPx inset at the top the overlay must not cover.
 * @param navigationBarHeightPx inset at the bottom, likewise.
 */
class AgentOverlayGeometry(
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

    val usableTop: Int get() = statusBarHeightPx

    val usableBottom: Int get() = screenHeightPx - navigationBarHeightPx

    val usableHeight: Int get() = usableBottom - usableTop

    /**
     * Builds a spec for [layout], on the right edge and vertically centred.
     *
     * Right edge rather than left: on-screen content - message text, list items - is left-aligned in
     * every language this will first ship in, so the right edge covers less of what the user is
     * reading.
     *
     * Vertically centred rather than top-anchored, so it does not sit over an app's toolbar, which is
     * usually where the controls the agent is about to press are.
     */
    fun specFor(layout: OverlayLayout): OverlayWindowSpec {
        val width = widthFor(layout)
        val height = heightFor(layout)

        val x = (screenWidthPx - width - EDGE_MARGIN_PX).coerceAtLeast(0)
        val y = (usableTop + ((usableHeight - height) / 2)).coerceIn(usableTop, maxTopFor(height))

        return OverlayWindowSpec(
            position = OverlayPoint(x = x, y = y),
            size = OverlaySize(widthPx = width, heightPx = height),
            layout = layout,
        )
    }

    /**
     * Width for [layout].
     *
     * Collapsed is a fixed narrow strip: it holds a status line and a stop button, and scaling it with
     * the screen would make it a slab on a tablet. Expanded is a capped fraction of the width, so it is
     * a readable chat column on a phone and not an absurd one on a tablet.
     */
    fun widthFor(layout: OverlayLayout): Int =
        when (layout) {
            OverlayLayout.COMPACT -> COLLAPSED_WIDTH_PX.coerceAtMost(screenWidthPx - EDGE_MARGIN_PX)
            OverlayLayout.EXPANDED ->
                (screenWidthPx * EXPANDED_WIDTH_FRACTION)
                    .toInt()
                    .coerceIn(
                        MIN_EXPANDED_WIDTH_PX.coerceAtMost(screenWidthPx - EDGE_MARGIN_PX),
                        screenWidthPx - EDGE_MARGIN_PX,
                    )
        }

    /** Height for [layout], capped to the usable area. */
    fun heightFor(layout: OverlayLayout): Int {
        val fraction =
            when (layout) {
                OverlayLayout.COMPACT -> COLLAPSED_HEIGHT_FRACTION
                OverlayLayout.EXPANDED -> EXPANDED_HEIGHT_FRACTION
            }

        return (usableHeight * fraction).toInt().coerceIn(
            MIN_HEIGHT_PX.coerceAtMost(usableHeight),
            usableHeight,
        )
    }

    private fun maxTopFor(height: Int): Int = (usableBottom - height).coerceAtLeast(usableTop)

    /**
     * Moves [spec] to [target], keeping the whole window on screen.
     *
     * The user can drag the strip up and down to uncover something beneath it. Clamped rather than
     * rejected: a drag that would push it half off screen stops at the edge instead of snapping back.
     */
    fun moveWithinScreen(
        spec: OverlayWindowSpec,
        target: OverlayPoint,
    ): OverlayWindowSpec {
        val maxX = (screenWidthPx - spec.size.widthPx).coerceAtLeast(0)

        return spec.copy(
            position =
                OverlayPoint(
                    x = target.x.coerceIn(0, maxX),
                    y = target.y.coerceIn(usableTop, maxTopFor(spec.size.heightPx)),
                ),
        )
    }

    /**
     * Switches [spec] to [layout].
     *
     * Both dimensions change, and x is re-pinned to the right edge afterwards: expanding in place would
     * grow the window rightwards from its current x, pushing it off the screen rather than widening it.
     * The vertical position the user chose is kept.
     */
    fun applyLayout(
        spec: OverlayWindowSpec,
        layout: OverlayLayout,
    ): OverlayWindowSpec {
        val width = widthFor(layout)
        val height = heightFor(layout)

        val resized = spec.copy(size = OverlaySize(width, height), layout = layout)

        return moveWithinScreen(
            resized,
            OverlayPoint(
                x = (screenWidthPx - width - EDGE_MARGIN_PX).coerceAtLeast(0),
                y = resized.position.y,
            ),
        )
    }

    fun isFullyOnScreen(spec: OverlayWindowSpec): Boolean =
        spec.left >= 0 &&
            spec.right <= screenWidthPx &&
            spec.top >= usableTop &&
            spec.bottom <= usableBottom

    /**
     * True when the overlay leaves enough of the app visible to watch.
     *
     * The point of the status overlay is that the user can see what the agent is doing to their phone.
     * An overlay that covers the action defeats itself.
     */
    fun leavesAppVisible(spec: OverlayWindowSpec): Boolean {
        val areaFraction =
            (spec.size.widthPx.toDouble() * spec.size.heightPx) /
                (screenWidthPx.toDouble() * screenHeightPx)

        return areaFraction <= MAX_COVERED_AREA_FRACTION
    }

    companion object {
        /** Gap from the screen edge, so the strip clears rounded corners and edge gestures. */
        const val EDGE_MARGIN_PX: Int = 8

        /** Fixed, because it holds one status line and a stop button at any screen size. */
        const val COLLAPSED_WIDTH_PX: Int = 168

        const val MIN_EXPANDED_WIDTH_PX: Int = 280

        /** Wide enough to read a chat, narrow enough to still see the app beside it. */
        const val EXPANDED_WIDTH_FRACTION: Double = 0.82

        const val COLLAPSED_HEIGHT_FRACTION: Double = 0.16
        const val EXPANDED_HEIGHT_FRACTION: Double = 0.62

        const val MIN_HEIGHT_PX: Int = 96

        /** Above this the overlay obscures the very thing the user opened it to watch. */
        const val MAX_COVERED_AREA_FRACTION: Double = 0.60
    }
}
