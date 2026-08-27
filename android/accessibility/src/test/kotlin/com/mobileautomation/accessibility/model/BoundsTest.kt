package com.mobileautomation.accessibility.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BoundsTest {
    @Test
    fun `computes width and height`() {
        val bounds = Bounds(left = 100, top = 700, right = 900, bottom = 850)
        assertEquals(800, bounds.width)
        assertEquals(150, bounds.height)
    }

    @Test
    fun `computes the centre point used for coordinate fallback`() {
        val bounds = Bounds(left = 100, top = 700, right = 900, bottom = 850)
        assertEquals(500, bounds.centerX)
        assertEquals(775, bounds.centerY)
    }

    @Test
    fun `treats a zero-area rect as empty`() {
        assertTrue(Bounds(10, 10, 10, 10).isEmpty)
        assertEquals(0, Bounds(10, 10, 10, 10).area)
    }

    @Test
    fun `treats an inverted rect as empty rather than negative area`() {
        val inverted = Bounds(left = 100, top = 100, right = 50, bottom = 50)
        assertTrue(inverted.isEmpty)
        assertEquals(0, inverted.area)
    }

    @Test
    fun `contains is inclusive of the top-left and exclusive of the bottom-right`() {
        val bounds = Bounds(0, 0, 100, 100)
        assertTrue(bounds.contains(0, 0))
        assertTrue(bounds.contains(99, 99))
        assertFalse(bounds.contains(100, 100))
    }

    @Test
    fun `detects intersection and separation`() {
        val a = Bounds(0, 0, 100, 100)
        assertTrue(a.intersects(Bounds(50, 50, 150, 150)))
        assertFalse(a.intersects(Bounds(100, 0, 200, 100)))
    }

    @Test
    fun `parses the android bounds string form`() {
        val parsed = Bounds.parse("[48,1218][1032,1330]")
        assertEquals(Bounds(48, 1218, 1032, 1330), parsed)
    }

    @Test
    fun `parses negative coordinates from an off-screen node`() {
        assertEquals(Bounds(-10, -20, 30, 40), Bounds.parse("[-10,-20][30,40]"))
    }

    @Test
    fun `returns null for unparseable bounds rather than throwing`() {
        assertNull(Bounds.parse("not bounds"))
        assertNull(Bounds.parse("[1,2]"))
    }
}
