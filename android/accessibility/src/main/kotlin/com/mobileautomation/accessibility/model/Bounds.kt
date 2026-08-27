package com.mobileautomation.accessibility.model

/**
 * On-screen rectangle of a UI element, in device pixels.
 *
 * Deliberately a plain Kotlin type rather than `android.graphics.Rect` so the
 * model and every consumer of it are unit-testable on the JVM without an
 * emulator.
 */
data class Bounds(
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int,
) {
    val width: Int get() = right - left

    val height: Int get() = bottom - top

    /**
     * Centre point. This is the coordinate a gesture falls back to when no
     * stronger selector strategy matched (ADR 0009).
     */
    val centerX: Int get() = left + (width / 2)

    val centerY: Int get() = top + (height / 2)

    val area: Int get() = if (width <= 0 || height <= 0) 0 else width * height

    /** An element with no area cannot be seen or tapped. */
    val isEmpty: Boolean get() = width <= 0 || height <= 0

    fun contains(
        x: Int,
        y: Int,
    ): Boolean = x >= left && x < right && y >= top && y < bottom

    fun intersects(other: Bounds): Boolean =
        left < other.right && other.left < right && top < other.bottom && other.top < bottom

    companion object {
        val EMPTY = Bounds(0, 0, 0, 0)

        /**
         * Parses the `[left,top][right,bottom]` form that Android's
         * `AccessibilityNodeInfo.toString()` and UIAutomator dumps use. Returns
         * null rather than throwing, because this parses untrusted text.
         */
        fun parse(value: String): Bounds? {
            val numbers = BOUNDS_PATTERN.find(value)?.groupValues ?: return null
            if (numbers.size != 5) return null
            return Bounds(
                left = numbers[1].toIntOrNull() ?: return null,
                top = numbers[2].toIntOrNull() ?: return null,
                right = numbers[3].toIntOrNull() ?: return null,
                bottom = numbers[4].toIntOrNull() ?: return null,
            )
        }

        private val BOUNDS_PATTERN =
            Regex("""\[(-?\d+),(-?\d+)]\[(-?\d+),(-?\d+)]""")
    }
}
