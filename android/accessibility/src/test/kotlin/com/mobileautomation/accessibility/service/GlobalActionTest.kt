package com.mobileautomation.accessibility.service

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GlobalActionTest {
    @Test
    fun `back and home are available on the minimum supported api level`() {
        assertTrue(GlobalAction.BACK.isSupportedOn(26))
        assertTrue(GlobalAction.HOME.isSupportedOn(26))
    }

    @Test
    fun `lock screen is unavailable below api 28`() {
        assertFalse(GlobalAction.LOCK_SCREEN.isSupportedOn(26))
        assertFalse(GlobalAction.LOCK_SCREEN.isSupportedOn(27))
        assertTrue(GlobalAction.LOCK_SCREEN.isSupportedOn(28))
    }

    @Test
    fun `take screenshot is unavailable below api 30`() {
        assertFalse(GlobalAction.TAKE_SCREENSHOT.isSupportedOn(29))
        assertTrue(GlobalAction.TAKE_SCREENSHOT.isSupportedOn(30))
    }

    @Test
    fun `platform constants match the framework values`() {
        // Hardcoded rather than referenced so a wrong value is caught here
        // instead of silently performing a different action on a device.
        assertEquals(1, GlobalAction.BACK.platformConstant)
        assertEquals(2, GlobalAction.HOME.platformConstant)
        assertEquals(3, GlobalAction.RECENTS.platformConstant)
        assertEquals(4, GlobalAction.NOTIFICATIONS.platformConstant)
    }

    @Test
    fun `every action has a distinct platform constant`() {
        val constants = GlobalAction.entries.map { it.platformConstant }
        assertEquals(constants.size, constants.toSet().size)
    }
}
