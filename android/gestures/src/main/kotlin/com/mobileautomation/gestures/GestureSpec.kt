package com.mobileautomation.gestures

/**
 * A gesture described in screen coordinates, ready to dispatch.
 *
 * Validated at construction so an impossible gesture - zero duration, a path off
 * screen, a long press too short to register - fails loudly here rather than
 * being silently dropped by the platform, which reports nothing useful when it
 * rejects a `GestureDescription`.
 */
sealed interface GestureSpec {
    val kind: GestureKind
    val durationMs: Long

    /** Ordered points the finger travels through. Always at least one. */
    val path: List<Point>

    /** Where the gesture begins, which is what a caller usually reasons about. */
    val startPoint: Point get() = path.first()

    val endPoint: Point get() = path.last()

    data class Tap(
        val point: Point,
        override val durationMs: Long = GestureKind.TAP.defaultDurationMs,
    ) : GestureSpec {
        override val kind: GestureKind get() = GestureKind.TAP
        override val path: List<Point> get() = listOf(point)

        init {
            requireValidDuration(kind, durationMs)
        }
    }

    data class LongPress(
        val point: Point,
        override val durationMs: Long = GestureKind.LONG_PRESS.defaultDurationMs,
    ) : GestureSpec {
        override val kind: GestureKind get() = GestureKind.LONG_PRESS
        override val path: List<Point> get() = listOf(point)

        init {
            requireValidDuration(kind, durationMs)
        }
    }

    data class Swipe(
        val from: Point,
        val to: Point,
        override val durationMs: Long = GestureKind.SWIPE.defaultDurationMs,
        /**
         * Intermediate points. More steps produce a smoother drag, which some
         * apps require before they recognise the gesture as a fling rather than
         * a jump.
         */
        val steps: Int = DEFAULT_SWIPE_STEPS,
    ) : GestureSpec {
        override val kind: GestureKind get() = GestureKind.SWIPE

        override val path: List<Point> = interpolate(from, to, steps)

        init {
            requireValidDuration(kind, durationMs)
            require(steps >= 1) { "steps must be at least 1, was $steps" }
            require(from != to) { "a swipe must move: from and to are both $from" }
        }
    }

    companion object {
        /**
         * Enough intermediate points that apps treat the movement as a drag.
         * A two-point path is often interpreted as a teleport and ignored.
         */
        const val DEFAULT_SWIPE_STEPS: Int = 10

        private fun requireValidDuration(
            kind: GestureKind,
            durationMs: Long,
        ) {
            require(isValidDuration(kind, durationMs)) {
                if (durationMs <= 0L) {
                    "duration must be positive, was $durationMs ms"
                } else {
                    "a ${kind.name} of $durationMs ms would register as a tap; " +
                        "it must be at least ${GestureKind.LONG_PRESS_THRESHOLD_MS} ms"
                }
            }
        }

        private fun interpolate(
            from: Point,
            to: Point,
            steps: Int,
        ): List<Point> =
            (0..steps).map { step ->
                val progress = step.toDouble() / steps
                Point(
                    x = from.x + ((to.x - from.x) * progress).toInt(),
                    y = from.y + ((to.y - from.y) * progress).toInt(),
                )
            }
    }
}
