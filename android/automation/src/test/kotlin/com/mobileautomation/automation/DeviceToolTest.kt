package com.mobileautomation.automation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DeviceToolTest {
    @Test
    fun `exposes the gesture tools`() {
        assertTrue(DeviceTool.toolNames.containsAll(listOf("click", "swipe", "typeText")))
    }

    @Test
    fun `exposes the perception tools the agent needs`() {
        assertTrue(DeviceTool.toolNames.containsAll(listOf("getUiTree", "takeScreenshot")))
    }

    @Test
    fun `exposes device api tools beyond the screen`() {
        assertTrue(DeviceTool.toolNames.containsAll(listOf("getContacts", "createAlarm")))
    }

    @Test
    fun `has no duplicate tool names`() {
        assertEquals(DeviceTool.toolNames.size, DeviceTool.toolNames.toSet().size)
    }

    @Test
    fun `resolves a tool from its wire name`() {
        assertEquals(DeviceTool.GET_UI_TREE, DeviceTool.fromToolName("getUiTree"))
    }

    @Test
    fun `rejects an unknown tool name`() {
        assertNull(DeviceTool.fromToolName("formatHardDrive"))
    }
}
