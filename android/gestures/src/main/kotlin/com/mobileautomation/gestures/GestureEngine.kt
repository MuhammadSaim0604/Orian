package com.mobileautomation.gestures

import kotlinx.coroutines.delay

/**
 * The gesture API the rest of the app uses: tap, long press, swipe, scroll.
 *
 * Adds the behaviour that every caller would otherwise reimplement - building a
 * valid path for the current screen, retrying a gesture the system cancelled,
 * and settling briefly afterwards so the UI has time to react before the next
 * step reads the screen.
 *
 * @param retryCancelled how many times to retry a cancelled gesture. Cancellation
 *   is usually transient (a competing touch, a window animation), so one retry
 *   recovers most cases without masking a real failure.
 * @param settleDelayMs pause after a successful gesture. Without it the next step
 *   frequently reads the pre-gesture screen and makes the wrong decision.
 */
class GestureEngine(
    private val dispatcher: GestureDispatcher,
    private val builder: GestureBuilder,
    private val retryCancelled: Int = DEFAULT_RETRY_COUNT,
    private val settleDelayMs: Long = DEFAULT_SETTLE_DELAY_MS,
) {
    init {
        require(retryCancelled >= 0) { "retryCancelled cannot be negative, was $retryCancelled" }
        require(settleDelayMs >= 0) { "settleDelayMs cannot be negative, was $settleDelayMs" }
    }

    val isAvailable: Boolean get() = dispatcher.isAvailable

    suspend fun tap(
        x: Int,
        y: Int,
    ): GestureOutcome = perform(builder.tap(Point(x, y)))

    /** Taps the centre of a resolved element's bounds. */
    suspend fun tapCenterOf(rect: Rect): GestureOutcome = perform(builder.tapCenterOf(rect))

    suspend fun longPress(
        x: Int,
        y: Int,
        durationMs: Long = GestureKind.LONG_PRESS.defaultDurationMs,
    ): GestureOutcome = perform(builder.longPress(Point(x, y), durationMs))

    suspend fun longPressCenterOf(
        rect: Rect,
        durationMs: Long = GestureKind.LONG_PRESS.defaultDurationMs,
    ): GestureOutcome = perform(builder.longPressCenterOf(rect, durationMs))

    suspend fun swipe(
        fromX: Int,
        fromY: Int,
        toX: Int,
        toY: Int,
        durationMs: Long = GestureKind.SWIPE.defaultDurationMs,
    ): GestureOutcome = perform(builder.swipe(Point(fromX, fromY), Point(toX, toY), durationMs))

    /**
     * Scrolls the content in [direction]: `DOWN` reveals what is further down the
     * list, which is what a caller means even though the finger moves up.
     */
    suspend fun scroll(
        direction: SwipeDirection,
        distanceFraction: Double = GestureBuilder.DEFAULT_SWIPE_FRACTION,
    ): GestureOutcome = perform(builder.scroll(direction, distanceFraction))

    /** Scrolls within a single scrollable region rather than the whole screen. */
    suspend fun scrollWithin(
        rect: Rect,
        direction: SwipeDirection,
        distanceFraction: Double = GestureBuilder.DEFAULT_SWIPE_FRACTION,
    ): GestureOutcome = perform(builder.swipeWithin(rect, direction.scrollsContent, distanceFraction))

    /**
     * Dispatches [spec], retrying while the system reports cancellation.
     *
     * Unavailable and outright failures are never retried: the service being off
     * will not fix itself within a retry loop, and a rejected path stays rejected.
     */
    suspend fun perform(spec: GestureSpec): GestureOutcome {
        var attempt = 0
        while (true) {
            val outcome = dispatcher.dispatch(spec)

            if (outcome.isSuccess) {
                if (settleDelayMs > 0) delay(settleDelayMs)
                return outcome
            }

            if (!outcome.isRetryable || attempt >= retryCancelled) return outcome

            attempt++
            delay(RETRY_BACKOFF_MS)
        }
    }

    companion object {
        const val DEFAULT_RETRY_COUNT: Int = 1

        /**
         * Long enough for a typical screen transition or list animation to
         * finish, short enough not to make automation feel sluggish.
         */
        const val DEFAULT_SETTLE_DELAY_MS: Long = 250L

        /** Brief pause before retrying, to let whatever interrupted us pass. */
        const val RETRY_BACKOFF_MS: Long = 150L
    }
}
