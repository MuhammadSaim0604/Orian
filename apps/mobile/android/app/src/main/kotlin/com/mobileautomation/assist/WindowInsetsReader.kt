package com.mobileautomation.assist

import android.graphics.Rect
import android.os.Build
import android.view.View
import android.view.WindowInsets

/**
 * How much room the system bars take, for the panel to sit above them.
 *
 * ## The defect this fixes
 *
 * The panel was drawn **under the navigation bar**: its bottom row sat behind the back and home buttons, so the
 * send button was partly unreachable. A voice-interaction session's window is full-screen and the platform does
 * not inset its content, which is easy to miss because it looks correct on a device using gesture navigation with
 * a thin pill.
 *
 * ## Why the value is read here rather than in React
 *
 * `react-native-safe-area-context` reads its values from the **activity's** window. This panel is in the
 * session's window, which has different insets and is not the activity at all — so the RN provider reports
 * whatever the app's last known insets were, or zero. Reading the real window and passing the number up is the
 * only way to get it right.
 *
 * Values are in **physical pixels**, converted to dp before crossing the bridge, because the panel styles in dp.
 */
object WindowInsetsReader {
    /** Navigation and status bar heights in dp, as the panel needs them. */
    data class BarInsets(
        val topDp: Int,
        val bottomDp: Int,
    )

    /**
     * Reads the system bar insets from [view]'s window.
     *
     * Falls back to a sensible bottom inset rather than zero when the platform gives nothing: a panel flush against
     * the bottom edge on a device with button navigation has an unreachable send button, whereas a panel with 24dp
     * of unnecessary padding merely looks slightly loose. The asymmetry decides the default.
     */
    fun read(view: View): BarInsets {
        val density = view.resources.displayMetrics.density.takeIf { it > 0f } ?: 1f

        val pixels =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                fromWindowInsets(view)
            } else {
                fromStableInsets(view)
            }

        return BarInsets(
            topDp = (pixels.top / density).toInt(),
            // Never below the fallback. A wrong zero is unreachable UI; a wrong 24 is slightly loose spacing.
            bottomDp = maxOf((pixels.bottom / density).toInt(), MIN_BOTTOM_DP),
        )
    }

    private fun fromWindowInsets(view: View): Rect {
        val insets = view.rootWindowInsets ?: return Rect(0, 0, 0, FALLBACK_BOTTOM_PX)

        val bars =
            insets.getInsets(
                WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout(),
            )

        return Rect(0, bars.top, 0, bars.bottom)
    }

    /**
     * API 26 to 29.
     *
     * `stableInsetBottom` rather than `systemWindowInsetBottom`: the latter is zero on a window that has not been
     * laid out yet, and this is read early. Stable insets describe where the bars are regardless of the current
     * window's flags, which is exactly the question being asked.
     */
    @Suppress("DEPRECATION")
    private fun fromStableInsets(view: View): Rect {
        val insets = view.rootWindowInsets ?: return Rect(0, 0, 0, FALLBACK_BOTTOM_PX)

        return Rect(0, insets.stableInsetTop, 0, insets.stableInsetBottom)
    }

    /**
     * Used when the platform reports nothing at all.
     *
     * 48 physical pixels is roughly a button-navigation bar on a low-density device — deliberately conservative,
     * since the failure it prevents is a control the user cannot press.
     */
    private const val FALLBACK_BOTTOM_PX = 48

    /**
     * A floor on the bottom inset in dp.
     *
     * Applies even under gesture navigation, where the real inset is a thin pill: content flush against the very
     * bottom edge of a phone is uncomfortable to tap regardless of what is behind it.
     */
    private const val MIN_BOTTOM_DP = 12
}
