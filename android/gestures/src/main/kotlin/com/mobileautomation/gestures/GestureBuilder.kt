package com.mobileautomation.gestures

/**
 * Builds gesture specs for the cases callers actually ask for.
 *
 * The arithmetic here is where coordinate bugs hide - off-by-one centres, swipes
 * that start or end off screen, scroll gestures that begin under the system
 * navigation bar and get swallowed. Centralising it means those bugs are fixed
 * once and covered by unit tests rather than rediscovered on each device.
 *
 * @param screenWidthPx display width, used to clamp paths on screen.
 * @param screenHeightPx display height, used likewise.
 * @param edgeInsetPx how far to stay clear of the screen edges. Gestures that
 *   start in the edge strip are intercepted by the system for back navigation
 *   and notification pull-down, so a scroll must begin inside this inset.
 */
class GestureBuilder(
    private val screenWidthPx: Int,
    private val screenHeightPx: Int,
    private val edgeInsetPx: Int = DEFAULT_EDGE_INSET_PX,
) {
    init {
        require(screenWidthPx > 0 && screenHeightPx > 0) {
            "screen size must be positive, was ${screenWidthPx}x$screenHeightPx"
        }
        require(edgeInsetPx >= 0) { "edgeInsetPx cannot be negative, was $edgeInsetPx" }
    }

    fun tap(point: Point): GestureSpec.Tap = GestureSpec.Tap(clamp(point))

    /** Taps the centre of [rect], which is what a resolved selector yields. */
    fun tapCenterOf(rect: Rect): GestureSpec.Tap = tap(rect.center)

    fun longPress(
        point: Point,
        durationMs: Long = GestureKind.LONG_PRESS.defaultDurationMs,
    ): GestureSpec.LongPress = GestureSpec.LongPress(clamp(point), durationMs)

    fun longPressCenterOf(
        rect: Rect,
        durationMs: Long = GestureKind.LONG_PRESS.defaultDurationMs,
    ): GestureSpec.LongPress = longPress(rect.center, durationMs)

    fun swipe(
        from: Point,
        to: Point,
        durationMs: Long = GestureKind.SWIPE.defaultDurationMs,
    ): GestureSpec.Swipe = GestureSpec.Swipe(clamp(from), clamp(to), durationMs)

    /**
     * A directional swipe across the middle of the screen.
     *
     * @param direction the direction the *finger* moves. To scroll content down,
     *   the finger moves up - see [SwipeDirection.scrollsContent].
     * @param distanceFraction how much of the screen to travel, 0 to 1.
     */
    fun swipeAcrossScreen(
        direction: SwipeDirection,
        distanceFraction: Double = DEFAULT_SWIPE_FRACTION,
        durationMs: Long = GestureKind.SWIPE.defaultDurationMs,
    ): GestureSpec.Swipe {
        require(distanceFraction > 0.0 && distanceFraction <= 1.0) {
            "distanceFraction must be in (0, 1], was $distanceFraction"
        }

        val centerX = screenWidthPx / 2
        val centerY = screenHeightPx / 2

        // Half the travel each side of centre keeps the whole path on screen.
        val verticalReach = ((usableHeight() / 2) * distanceFraction).toInt()
        val horizontalReach = ((usableWidth() / 2) * distanceFraction).toInt()

        val (from, to) =
            when (direction) {
                SwipeDirection.UP ->
                    Point(centerX, centerY + verticalReach) to Point(centerX, centerY - verticalReach)
                SwipeDirection.DOWN ->
                    Point(centerX, centerY - verticalReach) to Point(centerX, centerY + verticalReach)
                SwipeDirection.LEFT ->
                    Point(centerX + horizontalReach, centerY) to Point(centerX - horizontalReach, centerY)
                SwipeDirection.RIGHT ->
                    Point(centerX - horizontalReach, centerY) to Point(centerX + horizontalReach, centerY)
            }

        return swipe(from, to, durationMs)
    }

    /**
     * Scrolls the content in [direction] - the caller's intent, not the finger's
     * movement. Scrolling down reveals content further down the list.
     */
    fun scroll(
        direction: SwipeDirection,
        distanceFraction: Double = DEFAULT_SWIPE_FRACTION,
        durationMs: Long = GestureKind.SWIPE.defaultDurationMs,
    ): GestureSpec.Swipe = swipeAcrossScreen(direction.scrollsContent, distanceFraction, durationMs)

    /** A swipe confined to [rect], for scrolling one list among several. */
    fun swipeWithin(
        rect: Rect,
        direction: SwipeDirection,
        distanceFraction: Double = DEFAULT_SWIPE_FRACTION,
        durationMs: Long = GestureKind.SWIPE.defaultDurationMs,
    ): GestureSpec.Swipe {
        require(distanceFraction > 0.0 && distanceFraction <= 1.0) {
            "distanceFraction must be in (0, 1], was $distanceFraction"
        }
        require(rect.width > 1 && rect.height > 1) { "cannot swipe within an empty rect: $rect" }

        val verticalReach = ((rect.height / 2) * distanceFraction).toInt().coerceAtLeast(1)
        val horizontalReach = ((rect.width / 2) * distanceFraction).toInt().coerceAtLeast(1)
        val cx = rect.centerX
        val cy = rect.centerY

        val (from, to) =
            when (direction) {
                SwipeDirection.UP -> Point(cx, cy + verticalReach) to Point(cx, cy - verticalReach)
                SwipeDirection.DOWN -> Point(cx, cy - verticalReach) to Point(cx, cy + verticalReach)
                SwipeDirection.LEFT -> Point(cx + horizontalReach, cy) to Point(cx - horizontalReach, cy)
                SwipeDirection.RIGHT -> Point(cx - horizontalReach, cy) to Point(cx + horizontalReach, cy)
            }

        return swipe(from, to, durationMs)
    }

    /** True when the point lies on screen, ignoring the edge inset. */
    fun isOnScreen(point: Point): Boolean =
        point.x >= 0 && point.x < screenWidthPx && point.y >= 0 && point.y < screenHeightPx

    /**
     * Pulls a point inside the usable area.
     *
     * A gesture whose path leaves the screen is rejected wholesale by the
     * platform, so clamping degrades gracefully instead of failing.
     */
    private fun clamp(point: Point): Point =
        Point(
            x = point.x.coerceIn(edgeInsetPx, (screenWidthPx - 1 - edgeInsetPx).coerceAtLeast(edgeInsetPx)),
            y = point.y.coerceIn(edgeInsetPx, (screenHeightPx - 1 - edgeInsetPx).coerceAtLeast(edgeInsetPx)),
        )

    private fun usableWidth(): Int = (screenWidthPx - (2 * edgeInsetPx)).coerceAtLeast(1)

    private fun usableHeight(): Int = (screenHeightPx - (2 * edgeInsetPx)).coerceAtLeast(1)

    companion object {
        /**
         * Roughly the width of the system gesture strip on modern Android. Paths
         * starting inside it are stolen by the OS for back/notification
         * gestures, so automation stays clear of it.
         */
        const val DEFAULT_EDGE_INSET_PX: Int = 48

        /**
         * Travelling most of the screen produces a reliable scroll; a short
         * swipe is often treated as a tap or ignored.
         */
        const val DEFAULT_SWIPE_FRACTION: Double = 0.8
    }
}
