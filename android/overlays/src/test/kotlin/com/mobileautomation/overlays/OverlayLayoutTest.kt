package com.mobileautomation.overlays

import org.junit.Assert.assertTrue
import org.junit.Test

class OverlayLayoutTest {
    @Test
    fun `compact mode shows fewer tools than expanded`() {
        assertTrue(OverlayLayout.COMPACT.visibleToolCount < OverlayLayout.EXPANDED.visibleToolCount)
    }

    @Test
    fun `compact mode leaves most of the screen visible`() {
        assertTrue(leavesScreenUsable(OverlayLayout.COMPACT))
    }

    @Test
    fun `expanded mode never covers the whole screen`() {
        assertTrue(leavesScreenUsable(OverlayLayout.EXPANDED))
        assertTrue(OverlayLayout.EXPANDED.maxScreenHeightFraction < 1.0)
    }
}
