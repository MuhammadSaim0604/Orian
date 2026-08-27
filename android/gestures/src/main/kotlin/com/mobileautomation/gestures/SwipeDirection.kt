package com.mobileautomation.gestures

/**
 * Cardinal directions for a swipe.
 *
 * Named directions exist because "scroll down" is what a caller means, while the
 * gesture that achieves it moves the finger *up*. Encoding that inversion once,
 * here, prevents every call site from getting it wrong.
 */
enum class SwipeDirection {
    UP,
    DOWN,
    LEFT,
    RIGHT,
    ;

    /**
     * The direction content moves when the finger moves in this direction.
     * Dragging the finger up scrolls the content down, revealing what is below.
     */
    val scrollsContent: SwipeDirection
        get() =
            when (this) {
                UP -> DOWN
                DOWN -> UP
                LEFT -> RIGHT
                RIGHT -> LEFT
            }

    val isVertical: Boolean get() = this == UP || this == DOWN

    val isHorizontal: Boolean get() = !isVertical
}
