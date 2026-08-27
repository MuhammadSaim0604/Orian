package com.mobileautomation.gestures

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GestureSpecTest {
    @Test
    fun `a tap has a single-point path`() {
        val tap = GestureSpec.Tap(Point(100, 200))
        assertEquals(listOf(Point(100, 200)), tap.path)
        assertEquals(GestureKind.TAP, tap.kind)
    }

    @Test
    fun `a long press defaults above the system threshold`() {
        val press = GestureSpec.LongPress(Point(10, 10))
        assertTrue(press.durationMs >= GestureKind.LONG_PRESS_THRESHOLD_MS)
    }

    @Test
    fun `rejects a long press that would register as a tap`() {
        val error =
            runCatching { GestureSpec.LongPress(Point(10, 10), durationMs = 100L) }
                .exceptionOrNull()

        assertTrue(error is IllegalArgumentException)
        assertTrue(error!!.message!!.contains("would register as a tap"))
    }

    @Test
    fun `rejects a zero duration`() {
        assertTrue(
            runCatching { GestureSpec.Tap(Point(1, 1), durationMs = 0L) }.exceptionOrNull()
                is IllegalArgumentException,
        )
    }

    @Test
    fun `rejects a negative duration`() {
        assertTrue(
            runCatching { GestureSpec.Tap(Point(1, 1), durationMs = -5L) }.exceptionOrNull()
                is IllegalArgumentException,
        )
    }

    @Test
    fun `rejects a swipe that does not move`() {
        val error =
            runCatching { GestureSpec.Swipe(Point(10, 10), Point(10, 10)) }.exceptionOrNull()

        assertTrue(error is IllegalArgumentException)
        assertTrue(error!!.message!!.contains("must move"))
    }

    @Test
    fun `rejects a swipe with no steps`() {
        assertTrue(
            runCatching { GestureSpec.Swipe(Point(0, 0), Point(100, 0), steps = 0) }.exceptionOrNull()
                is IllegalArgumentException,
        )
    }

    @Test
    fun `interpolates a swipe path from start to end`() {
        val swipe = GestureSpec.Swipe(Point(0, 0), Point(100, 0), steps = 4)

        assertEquals(5, swipe.path.size)
        assertEquals(Point(0, 0), swipe.path.first())
        assertEquals(Point(100, 0), swipe.path.last())
        assertEquals(listOf(0, 25, 50, 75, 100), swipe.path.map { it.x })
    }

    @Test
    fun `produces enough intermediate points by default to read as a drag`() {
        val swipe = GestureSpec.Swipe(Point(0, 0), Point(0, 500))
        assertEquals(GestureSpec.DEFAULT_SWIPE_STEPS + 1, swipe.path.size)
    }

    @Test
    fun `interpolates a diagonal swipe on both axes`() {
        val swipe = GestureSpec.Swipe(Point(0, 0), Point(100, 200), steps = 2)

        assertEquals(Point(0, 0), swipe.path[0])
        assertEquals(Point(50, 100), swipe.path[1])
        assertEquals(Point(100, 200), swipe.path[2])
    }

    @Test
    fun `exposes start and end points`() {
        val swipe = GestureSpec.Swipe(Point(5, 5), Point(50, 60))
        assertEquals(Point(5, 5), swipe.startPoint)
        assertEquals(Point(50, 60), swipe.endPoint)
    }
}

class SwipeDirectionTest {
    @Test
    fun `scrolling content inverts the finger direction`() {
        assertEquals(SwipeDirection.DOWN, SwipeDirection.UP.scrollsContent)
        assertEquals(SwipeDirection.UP, SwipeDirection.DOWN.scrollsContent)
        assertEquals(SwipeDirection.RIGHT, SwipeDirection.LEFT.scrollsContent)
        assertEquals(SwipeDirection.LEFT, SwipeDirection.RIGHT.scrollsContent)
    }

    @Test
    fun `inverting twice returns the original direction`() {
        assertTrue(SwipeDirection.entries.all { it.scrollsContent.scrollsContent == it })
    }

    @Test
    fun `classifies axes`() {
        assertTrue(SwipeDirection.UP.isVertical)
        assertFalse(SwipeDirection.UP.isHorizontal)
        assertTrue(SwipeDirection.LEFT.isHorizontal)
    }
}

class RectTest {
    @Test
    fun `computes the centre used as a tap target`() {
        val rect = Rect(100, 200, 300, 400)
        assertEquals(Point(200, 300), rect.center)
    }

    @Test
    fun `contains is inclusive at the top-left and exclusive at the bottom-right`() {
        val rect = Rect(0, 0, 100, 100)
        assertTrue(rect.contains(Point(0, 0)))
        assertTrue(rect.contains(Point(99, 99)))
        assertFalse(rect.contains(Point(100, 100)))
    }
}
