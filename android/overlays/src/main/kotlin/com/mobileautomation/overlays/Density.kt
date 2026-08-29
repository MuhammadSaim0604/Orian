package com.mobileautomation.overlays

/**
 * Converts density-independent pixels to physical pixels.
 *
 * **Overlay sizes must be declared in dp**, and getting this wrong is not a subtle bug. The agent status
 * strip was first written with a 168-pixel width; on a 3x-density phone that is 56dp, so the strip
 * rendered at a third of its intended size with a stop button too small to hit. `WindowManager` takes
 * physical pixels, which is exactly why the mistake is easy to make and invisible on a low-density
 * emulator.
 *
 * A value class so it costs nothing at runtime and cannot be confused with a plain `Float`.
 *
 * @param density `DisplayMetrics.density` - physical pixels per dp. 1.0 on a 160dpi screen, 3.0 on a
 *   480dpi one.
 */
@JvmInline
value class Density(
    val density: Float,
) {
    init {
        require(density > 0f) { "density must be positive, was $density" }
    }

    /** Rounds rather than truncating, so a 0.5px difference does not silently shave a border off. */
    fun toPx(dp: Int): Int = Math.round(dp * density)

    fun toPx(dp: Float): Int = Math.round(dp * density)

    fun toDp(px: Int): Int = Math.round(px / density)

    companion object {
        /**
         * A 1:1 mapping, for tests and for the 160dpi reference device.
         *
         * Named rather than written as `Density(1f)` at call sites so a test asserting on dp values reads
         * as deliberate rather than as a forgotten conversion.
         */
        val REFERENCE = Density(1f)
    }
}
