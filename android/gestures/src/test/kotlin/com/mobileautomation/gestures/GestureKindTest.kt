package com.mobileautomation.gestures

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GestureKindTest {
    @Test
    fun `a long press default clears the system threshold`() {
        assertTrue(GestureKind.LONG_PRESS.defaultDurationMs >= GestureKind.LONG_PRESS_THRESHOLD_MS)
    }

    @Test
    fun `a tap is shorter than a long press`() {
        assertTrue(GestureKind.TAP.defaultDurationMs < GestureKind.LONG_PRESS.defaultDurationMs)
    }

    @Test
    fun `rejects a zero duration`() {
        assertFalse(isValidDuration(GestureKind.TAP, 0L))
    }

    @Test
    fun `rejects a long press that would register as a tap`() {
        assertFalse(isValidDuration(GestureKind.LONG_PRESS, 100L))
    }

    @Test
    fun `accepts a swipe with a positive duration`() {
        assertTrue(isValidDuration(GestureKind.SWIPE, 250L))
    }

    @Test
    fun `keeps point coordinates as given`() {
        val point = Point(421, 832)
        assertEquals(421, point.x)
        assertEquals(832, point.y)
    }
}
