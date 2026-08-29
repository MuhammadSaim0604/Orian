package com.mobileautomation.overlays

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OverlayGeometryTest {
    // A 1080x2400 phone with typical system bar insets.
    private val geometry =
        OverlayGeometry(
            screenWidthPx = 1080,
            screenHeightPx = 2400,
            statusBarHeightPx = 96,
            navigationBarHeightPx = 132,
        )

    @Test
    fun `usable area excludes the system bars`() {
        assertEquals(96, geometry.usableTop)
        assertEquals(2268, geometry.usableBottom)
        assertEquals(2172, geometry.usableHeight)
    }

    @Test
    fun `compact overlay is small enough to leave the app visible`() {
        val spec = geometry.specFor(OverlayLayout.COMPACT)

        assertTrue(geometry.leavesAppVisible(spec))
        assertTrue(spec.heightFractionOf(2400) <= OverlayLayout.MAX_COMPACT_HEIGHT_FRACTION)
    }

    @Test
    fun `expanded overlay is taller than compact`() {
        val compact = geometry.specFor(OverlayLayout.COMPACT)
        val expanded = geometry.specFor(OverlayLayout.EXPANDED)

        assertTrue(expanded.size.heightPx > compact.size.heightPx)
    }

    @Test
    fun `overlay stays fully within the usable area`() {
        for (layout in OverlayLayout.entries) {
            assertTrue("$layout escaped the screen", geometry.isFullyOnScreen(geometry.specFor(layout)))
        }
    }

    @Test
    fun `overlay is anchored near the bottom within thumb reach`() {
        val spec = geometry.specFor(OverlayLayout.COMPACT)

        // Bottom edge sits just above the navigation bar.
        assertEquals(geometry.usableBottom - OverlayGeometry.BOTTOM_MARGIN_DP, spec.bottom)
    }

    @Test
    fun `overlay keeps a margin from the side edges`() {
        val spec = geometry.specFor(OverlayLayout.COMPACT)

        assertEquals(OverlayGeometry.HORIZONTAL_MARGIN_DP, spec.left)
        assertEquals(1080 - OverlayGeometry.HORIZONTAL_MARGIN_DP, spec.right)
    }

    @Test
    fun `moving within the screen keeps the window fully visible`() {
        val spec = geometry.specFor(OverlayLayout.COMPACT)

        val moved = geometry.moveWithinScreen(spec, OverlayPoint(0, geometry.usableTop))

        assertTrue(geometry.isFullyOnScreen(moved))
    }

    @Test
    fun `clamps a drag that would push the overlay off the right edge`() {
        val spec = geometry.specFor(OverlayLayout.COMPACT)

        val moved = geometry.moveWithinScreen(spec, OverlayPoint(5000, 500))

        assertEquals(1080 - spec.size.widthPx, moved.left)
        assertTrue(geometry.isFullyOnScreen(moved))
    }

    @Test
    fun `clamps a drag under the status bar`() {
        val spec = geometry.specFor(OverlayLayout.COMPACT)

        val moved = geometry.moveWithinScreen(spec, OverlayPoint(100, -500))

        assertEquals(geometry.usableTop, moved.top)
    }

    @Test
    fun `clamps a drag below the navigation bar`() {
        val spec = geometry.specFor(OverlayLayout.COMPACT)

        val moved = geometry.moveWithinScreen(spec, OverlayPoint(100, 9999))

        assertEquals(geometry.usableBottom, moved.bottom)
        assertTrue(geometry.isFullyOnScreen(moved))
    }

    @Test
    fun `expanding pulls the overlay back on screen`() {
        val compact = geometry.specFor(OverlayLayout.COMPACT)
        // Drag it to the very bottom, then expand: naively resizing would push
        // the bottom edge past the navigation bar.
        val atBottom = geometry.moveWithinScreen(compact, OverlayPoint(compact.left, 9999))

        val expanded = geometry.applyLayout(atBottom, OverlayLayout.EXPANDED)

        assertEquals(OverlayLayout.EXPANDED, expanded.layout)
        assertTrue(geometry.isFullyOnScreen(expanded))
    }

    @Test
    fun `collapsing preserves the horizontal position`() {
        val expanded = geometry.specFor(OverlayLayout.EXPANDED)
        // x must be within the draggable range: a full-width overlay has little
        // horizontal slack, so 30 is valid where 200 would clamp back to 32.
        val moved = geometry.moveWithinScreen(expanded, OverlayPoint(30, 400))

        val collapsed = geometry.applyLayout(moved, OverlayLayout.COMPACT)

        assertEquals(30, collapsed.left)
        assertEquals(OverlayLayout.COMPACT, collapsed.layout)
    }

    @Test
    fun `clamps horizontal drag to the narrow slack of a full-width overlay`() {
        val spec = geometry.specFor(OverlayLayout.COMPACT)
        val slack = 1080 - spec.size.widthPx

        val moved = geometry.moveWithinScreen(spec, OverlayPoint(500, spec.top))

        assertEquals(slack, moved.left)
        assertTrue(geometry.isFullyOnScreen(moved))
    }

    @Test
    fun `enforces a minimum height on a very short screen`() {
        val tiny = OverlayGeometry(screenWidthPx = 480, screenHeightPx = 320)

        val height = tiny.heightFor(OverlayLayout.COMPACT)

        assertTrue(height >= OverlayGeometry.MIN_HEIGHT_DP)
        assertTrue(height <= tiny.usableHeight)
    }

    @Test
    fun `enforces a minimum width on a narrow screen`() {
        // 100px is narrower than the 120dp minimum, so the minimum is capped by the screen rather than
        // producing a window wider than the display. The rule being pinned is that the width never
        // collapses to the margins alone.
        val narrow = OverlayGeometry(screenWidthPx = 100, screenHeightPx = 800)
        val width = narrow.specFor(OverlayLayout.COMPACT).size.widthPx

        assertTrue("expected a usable width, got $width", width >= 100 - (2 * 16))
        assertTrue("expected to fit the screen, got $width", width <= 100)
    }

    @Test
    fun `works with no system bar insets`() {
        val fullscreen = OverlayGeometry(screenWidthPx = 1080, screenHeightPx = 2400)

        assertEquals(0, fullscreen.usableTop)
        assertEquals(2400, fullscreen.usableBottom)
        assertTrue(fullscreen.isFullyOnScreen(fullscreen.specFor(OverlayLayout.EXPANDED)))
    }

    @Test
    fun `handles landscape orientation`() {
        val landscape =
            OverlayGeometry(
                screenWidthPx = 2400,
                screenHeightPx = 1080,
                statusBarHeightPx = 0,
                navigationBarHeightPx = 96,
            )

        val spec = landscape.specFor(OverlayLayout.EXPANDED)

        assertTrue(landscape.isFullyOnScreen(spec))
    }

    @Test
    fun `rejects a non-positive screen size`() {
        assertTrue(
            runCatching { OverlayGeometry(0, 100) }.exceptionOrNull() is IllegalArgumentException,
        )
    }

    @Test
    fun `rejects negative system bar insets`() {
        assertTrue(
            runCatching { OverlayGeometry(1080, 2400, statusBarHeightPx = -1) }.exceptionOrNull()
                is IllegalArgumentException,
        )
    }

    @Test
    fun `rejects system bars that consume the whole screen`() {
        assertTrue(
            runCatching {
                OverlayGeometry(1080, 200, statusBarHeightPx = 150, navigationBarHeightPx = 150)
            }.exceptionOrNull() is IllegalArgumentException,
        )
    }
}

class OverlayWindowSpecTest {
    @Test
    fun `computes its edges from position and size`() {
        val spec =
            OverlayWindowSpec(
                position = OverlayPoint(16, 100),
                size = OverlaySize(1048, 600),
                layout = OverlayLayout.COMPACT,
            )

        assertEquals(16, spec.left)
        assertEquals(100, spec.top)
        assertEquals(1064, spec.right)
        assertEquals(700, spec.bottom)
    }

    @Test
    fun `reports the fraction of screen height it occupies`() {
        val spec =
            OverlayWindowSpec(
                position = OverlayPoint(0, 0),
                size = OverlaySize(100, 600),
                layout = OverlayLayout.COMPACT,
            )

        assertEquals(0.25, spec.heightFractionOf(2400), 0.001)
    }

    @Test
    fun `rejects a zero-sized overlay`() {
        assertTrue(
            runCatching { OverlaySize(0, 100) }.exceptionOrNull() is IllegalArgumentException,
        )
    }

    @Test
    fun `compact layout is verified as leaving the screen usable`() {
        assertTrue(leavesScreenUsable(OverlayLayout.COMPACT))
        assertTrue(leavesScreenUsable(OverlayLayout.EXPANDED))
        assertFalse(OverlayLayout.EXPANDED.maxScreenHeightFraction >= 1.0)
    }
}
