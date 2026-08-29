package com.mobileautomation.overlays

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * dp-to-pixel conversion.
 *
 * Thin tests for a thin class, but the class exists because of a real defect: overlay sizes were written
 * as raw pixels, so on a 3x-density phone a 168px strip was 56dp and the stop button inside it was too
 * small to press. `WindowManager` takes physical pixels, which is what makes the mistake easy to make and
 * invisible on a low-density emulator.
 */
class DensityTest {
    @Test
    fun `is one to one at the reference density`() {
        assertEquals(132, Density.REFERENCE.toPx(132))
    }

    @Test
    fun `scales up on a high density screen`() {
        // The case that broke: 132dp must become 396px on a 3x screen, not stay 132.
        assertEquals(396, Density(3f).toPx(132))
    }

    @Test
    fun `rounds rather than truncating`() {
        // 2.75 is a real density (Pixel-class devices). 17dp is 46.75px: truncating gives 46, rounding
        // gives 47. Shaving a pixel off every dimension accumulates into a visibly off-by-one layout.
        assertEquals(47, Density(2.75f).toPx(17))
    }

    @Test
    fun `converts back to dp`() {
        assertEquals(132, Density(3f).toDp(396))
    }

    @Test
    fun `round trips`() {
        val density = Density(2.625f)

        assertEquals(96, density.toDp(density.toPx(96)))
    }

    @Test
    fun `refuses a zero density`() {
        // A zero would silently collapse every dimension to nothing, producing a window with no size.
        val failure = runCatching { Density(0f) }.exceptionOrNull()

        assertTrue(failure is IllegalArgumentException)
    }

    @Test
    fun `refuses a negative density`() {
        val failure = runCatching { Density(-2f) }.exceptionOrNull()

        assertTrue(failure is IllegalArgumentException)
    }
}

/**
 * The agent overlay at real screen densities.
 *
 * A separate class from [AgentOverlayGeometryTest] because these are the assertions the old tests were
 * missing. They all passed while the strip was unusable on a device: they checked that the window stayed
 * on screen, which a far-too-small window trivially does. The assertions here are about **size in dp** -
 * whether the thing can actually be operated.
 */
class AgentOverlayDensityTest {
    private fun phone(density: Float) =
        AgentOverlayGeometry(
            screenWidthPx = 1080,
            screenHeightPx = 2400,
            density = Density(density),
            statusBarHeightPx = 72,
            navigationBarHeightPx = 48,
        )

    @Test
    fun `the collapsed strip is usable at 3x`() {
        // The density the defect was reported at.
        val geometry = phone(3f)

        assertTrue(geometry.hasUsableControls(geometry.specFor(OverlayLayout.COMPACT)))
    }

    @Test
    fun `the collapsed strip is usable at every common density`() {
        for (density in listOf(1f, 1.5f, 2f, 2.625f, 3f, 3.5f)) {
            val geometry = phone(density)
            val spec = geometry.specFor(OverlayLayout.COMPACT)

            assertTrue(
                "unusable at ${density}x: ${spec.size.widthPx}x${spec.size.heightPx}px",
                geometry.hasUsableControls(spec),
            )
        }
    }

    @Test
    fun `the collapsed width is the dp constant converted, not the raw number`() {
        // The regression, stated directly. Before the fix this was 132px on every screen.
        val geometry = phone(3f)

        assertEquals(
            AgentOverlayGeometry.COLLAPSED_WIDTH_DP * 3,
            geometry.widthFor(OverlayLayout.COMPACT),
        )
    }

    @Test
    fun `the strip stays on screen at high density`() {
        val geometry = phone(3.5f)

        assertTrue(geometry.isFullyOnScreen(geometry.specFor(OverlayLayout.COMPACT)))
    }

    @Test
    fun `the strip still leaves the app visible at high density`() {
        // Converting dp made everything larger, so the "does not cover the screen" rule has to be
        // re-checked rather than assumed to survive the fix.
        val geometry = phone(3f)

        assertTrue(geometry.leavesAppVisible(geometry.specFor(OverlayLayout.COMPACT)))
    }

    @Test
    fun `the expanded panel leaves the app visible at high density`() {
        val geometry = phone(3f)

        assertTrue(geometry.leavesAppVisible(geometry.specFor(OverlayLayout.EXPANDED)))
    }

    @Test
    fun `a strip sized in raw pixels would be rejected`() {
        // Proves `hasUsableControls` actually catches the original bug rather than passing everything.
        // 168px at 3x is what shipped, and it must fail.
        val geometry = phone(3f)

        val asShipped =
            OverlayWindowSpec(
                position = OverlayPoint(0, 0),
                size = OverlaySize(widthPx = 168, heightPx = 384),
                layout = OverlayLayout.COMPACT,
            )

        assertFalse(geometry.hasUsableControls(asShipped))
    }

    @Test
    fun `the edge margin scales with density`() {
        val geometry = phone(3f)
        val spec = geometry.specFor(OverlayLayout.COMPACT)

        assertEquals(1080 - (AgentOverlayGeometry.EDGE_MARGIN_DP * 3), spec.right)
    }

    @Test
    fun `a small low-density screen still produces a valid window`() {
        // 480x800 at 1x: the dp minimums must be capped by the screen rather than producing a window
        // wider than the display.
        val geometry =
            AgentOverlayGeometry(
                screenWidthPx = 480,
                screenHeightPx = 800,
                density = Density(1f),
                statusBarHeightPx = 24,
                navigationBarHeightPx = 24,
            )

        for (layout in OverlayLayout.entries) {
            assertTrue(layout.name, geometry.isFullyOnScreen(geometry.specFor(layout)))
        }
    }
}
