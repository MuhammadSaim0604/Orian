package com.mobileautomation.gestures

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GestureBuilderTest {
    // A typical 1080x2400 phone.
    private val builder = GestureBuilder(screenWidthPx = 1080, screenHeightPx = 2400)

    @Test
    fun `taps the point it was given when well inside the screen`() {
        assertEquals(Point(500, 1000), builder.tap(Point(500, 1000)).point)
    }

    @Test
    fun `taps the centre of a resolved element`() {
        val rect = Rect(900, 1800, 1050, 1950)
        assertEquals(Point(975, 1875), builder.tapCenterOf(rect).point)
    }

    @Test
    fun `clamps a point beyond the right edge back on screen`() {
        val tap = builder.tap(Point(5000, 1000))
        assertTrue(builder.isOnScreen(tap.point))
        assertEquals(1080 - 1 - GestureBuilder.DEFAULT_EDGE_INSET_PX, tap.point.x)
    }

    @Test
    fun `clamps a negative point inside the edge inset`() {
        val tap = builder.tap(Point(-50, -50))
        assertEquals(GestureBuilder.DEFAULT_EDGE_INSET_PX, tap.point.x)
        assertEquals(GestureBuilder.DEFAULT_EDGE_INSET_PX, tap.point.y)
    }

    @Test
    fun `keeps taps clear of the system gesture strip at the edges`() {
        // A tap at y=0 would be stolen by the notification pull-down.
        val tap = builder.tap(Point(0, 0))
        assertTrue(tap.point.x >= GestureBuilder.DEFAULT_EDGE_INSET_PX)
        assertTrue(tap.point.y >= GestureBuilder.DEFAULT_EDGE_INSET_PX)
    }

    @Test
    fun `swipes up by moving the finger from lower to higher on screen`() {
        val swipe = builder.swipeAcrossScreen(SwipeDirection.UP)

        assertTrue("finger should move up the screen", swipe.to.y < swipe.from.y)
        assertEquals(swipe.from.x, swipe.to.x)
    }

    @Test
    fun `swipes down by moving the finger downward`() {
        val swipe = builder.swipeAcrossScreen(SwipeDirection.DOWN)
        assertTrue(swipe.to.y > swipe.from.y)
    }

    @Test
    fun `swipes left and right along a constant y`() {
        val left = builder.swipeAcrossScreen(SwipeDirection.LEFT)
        val right = builder.swipeAcrossScreen(SwipeDirection.RIGHT)

        assertTrue(left.to.x < left.from.x)
        assertEquals(left.from.y, left.to.y)
        assertTrue(right.to.x > right.from.x)
    }

    @Test
    fun `keeps the whole swipe path on screen`() {
        for (direction in SwipeDirection.entries) {
            val swipe = builder.swipeAcrossScreen(direction, distanceFraction = 1.0)
            assertTrue(
                "$direction path left the screen",
                swipe.path.all { builder.isOnScreen(it) },
            )
        }
    }

    @Test
    fun `a longer distance fraction travels further`() {
        val short = builder.swipeAcrossScreen(SwipeDirection.UP, distanceFraction = 0.2)
        val long = builder.swipeAcrossScreen(SwipeDirection.UP, distanceFraction = 0.9)

        val shortTravel = short.from.y - short.to.y
        val longTravel = long.from.y - long.to.y
        assertTrue(longTravel > shortTravel)
    }

    @Test
    fun `rejects a distance fraction outside zero to one`() {
        assertTrue(
            runCatching { builder.swipeAcrossScreen(SwipeDirection.UP, distanceFraction = 0.0) }
                .exceptionOrNull() is IllegalArgumentException,
        )
        assertTrue(
            runCatching { builder.swipeAcrossScreen(SwipeDirection.UP, distanceFraction = 1.5) }
                .exceptionOrNull() is IllegalArgumentException,
        )
    }

    @Test
    fun `scrolling down moves the finger up`() {
        // The distinction that catches everyone: to see content further down the
        // list, the finger drags upward.
        val scroll = builder.scroll(SwipeDirection.DOWN)
        assertTrue("scrolling down should drag the finger up", scroll.to.y < scroll.from.y)
    }

    @Test
    fun `scrolling up moves the finger down`() {
        val scroll = builder.scroll(SwipeDirection.UP)
        assertTrue(scroll.to.y > scroll.from.y)
    }

    @Test
    fun `confines a swipe within a region`() {
        val list = Rect(0, 600, 1080, 1600)

        val swipe = builder.swipeWithin(list, SwipeDirection.UP)

        assertTrue(swipe.path.all { list.contains(it) })
        assertEquals(list.centerX, swipe.from.x)
    }

    @Test
    fun `rejects swiping within an empty region`() {
        assertTrue(
            runCatching { builder.swipeWithin(Rect(10, 10, 10, 10), SwipeDirection.UP) }
                .exceptionOrNull() is IllegalArgumentException,
        )
    }

    @Test
    fun `reports points off screen`() {
        assertTrue(builder.isOnScreen(Point(0, 0)))
        assertTrue(builder.isOnScreen(Point(1079, 2399)))
        assertFalse(builder.isOnScreen(Point(1080, 2400)))
        assertFalse(builder.isOnScreen(Point(-1, 100)))
    }

    @Test
    fun `rejects a non-positive screen size`() {
        assertTrue(
            runCatching { GestureBuilder(0, 100) }.exceptionOrNull() is IllegalArgumentException,
        )
    }

    @Test
    fun `works on a small screen without inverting the clamp range`() {
        // Edge inset wider than the screen would produce an invalid coerce range.
        val tiny = GestureBuilder(screenWidthPx = 40, screenHeightPx = 40, edgeInsetPx = 48)
        val tap = tiny.tap(Point(20, 20))
        assertEquals(48, tap.point.x)
    }
}
