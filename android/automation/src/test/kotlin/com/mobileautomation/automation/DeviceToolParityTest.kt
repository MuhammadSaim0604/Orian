package com.mobileautomation.automation

import com.mobileautomation.tools.MediaCommand
import com.mobileautomation.tools.RingerMode
import com.mobileautomation.tools.VolumeDirection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Guards the tool vocabulary against drift.
 *
 * `DeviceTool` names must match `@mobile-automation/tool-sdk`'s `TOOL_NAMES`
 * exactly (ADR 0008): the AI agent, the MCP server, and `android-nodes` all name
 * tools from the TypeScript list, while the runtime implements the Kotlin one. If
 * they diverge, the model can name a tool that cannot be called - and the failure
 * shows up as a confusing agent loop rather than a build error.
 *
 * The TypeScript list is duplicated here as a literal on purpose. Kotlin cannot
 * read it at compile time, so restating it means a change on either side breaks
 * this test and forces both to be updated together.
 */
class DeviceToolParityTest {
    /**
     * Mirror of `TOOL_NAMES` in `packages/tool-sdk/src/index.ts`.
     *
     * Keep in the same order as the TypeScript file so a diff is easy to read.
     */
    private val typeScriptToolNames =
        listOf(
            "click",
            "longPress",
            "swipe",
            "typeText",
            "findElement",
            "waitForElement",
            "getUiTree",
            "takeScreenshot",
            "pressBack",
            "pressHome",
            "openApp",
            "openAppByName",
            "listApps",
            "getCurrentScreen",
            "getContacts",
            "findContacts",
            "createAlarm",
            "readClipboard",
            "writeClipboard",
            "sendNotification",
            "launchIntent",
            "getSystemSetting",
            "controlMedia",
            "adjustVolume",
            "sendSms",
            "readSms",
            "placeCall",
            "endCall",
            "setSystemSetting",
            "setRingerMode",
        )

    @Test
    fun `kotlin tool names match the typescript tool sdk exactly`() {
        assertEquals(typeScriptToolNames, DeviceTool.toolNames)
    }

    @Test
    fun `every tool name is unique`() {
        assertEquals(DeviceTool.toolNames.size, DeviceTool.toolNames.toSet().size)
    }

    @Test
    fun `every declared tool has a runtime method of the same name`() {
        // Java reflection rather than kotlin-reflect, which is not on the test
        // classpath. Suspend functions still appear as declared methods.
        val runtimeMethods =
            AutomationRuntime::class.java.declaredMethods.map { it.name }.toSet()

        // One-directional on purpose: every tool must exist as a method, but not
        // every method is a named tool - openAppByName, clickAt, and swipeBetween
        // are convenience overloads outside the vocabulary.
        val missing = DeviceTool.toolNames.filterNot { it in runtimeMethods }

        assertTrue(
            "declared as a tool but not implemented on AutomationRuntime: $missing",
            missing.isEmpty(),
        )
    }

    @Test
    fun `a tool can be resolved from its wire name`() {
        assertEquals(DeviceTool.GET_UI_TREE, DeviceTool.fromToolName("getUiTree"))
        assertEquals(null, DeviceTool.fromToolName("telepathy"))
    }

    @Test
    fun `media control is part of the tool surface`() {
        // Listed as a Phase 2 Android Tool Layer deliverable.
        assertTrue(DeviceTool.toolNames.contains("controlMedia"))
        assertTrue(DeviceTool.toolNames.contains("adjustVolume"))
    }

    @Test
    fun `media commands cover the controls a user would ask for`() {
        assertTrue(MediaCommand.names.containsAll(listOf("play_pause", "next", "previous", "pause")))
    }

    @Test
    fun `media command key codes match the platform constants`() {
        // Hardcoded rather than referenced from KeyEvent, so a wrong value fails
        // here instead of sending the wrong key to the user's music player.
        assertEquals(85, MediaCommand.PLAY_PAUSE.keyCode)
        assertEquals(87, MediaCommand.NEXT.keyCode)
        assertEquals(88, MediaCommand.PREVIOUS.keyCode)
    }

    @Test
    fun `volume directions map to the platform adjust constants`() {
        assertEquals(1, VolumeDirection.UP.platformDirection)
        assertEquals(-1, VolumeDirection.DOWN.platformDirection)
    }

    @Test
    fun `command and direction names resolve case-insensitively`() {
        // The AI supplies these as free text, so matching must not be brittle.
        assertEquals(MediaCommand.PLAY_PAUSE, MediaCommand.fromName("Play_Pause"))
        assertEquals(VolumeDirection.UP, VolumeDirection.fromName("up"))
        assertEquals(null, MediaCommand.fromName("moonwalk"))
    }

    @Test
    fun `messaging and call tools are part of the tool surface`() {
        assertTrue(DeviceTool.toolNames.containsAll(listOf("sendSms", "readSms", "placeCall", "endCall")))
    }

    @Test
    fun `device configuration tools are part of the tool surface`() {
        assertTrue(DeviceTool.toolNames.containsAll(listOf("setSystemSetting", "setRingerMode")))
    }

    @Test
    fun `ringer modes match the tool sdk enum`() {
        // Mirrors RINGER_MODES in packages/tool-sdk/src/arguments.ts. A mode the model can name but the
        // runtime cannot parse would fail validation-free, deep in the tool call.
        assertEquals(listOf("normal", "vibrate", "silent"), RingerMode.names)
    }

    @Test
    fun `only silent and vibrate need do not disturb access`() {
        // Returning a phone to normal should never be the call that fails for want of a permission.
        assertTrue(RingerMode.SILENT.requiresPolicyAccess)
        assertTrue(RingerMode.VIBRATE.requiresPolicyAccess)
        assertTrue(!RingerMode.NORMAL.requiresPolicyAccess)
    }

    @Test
    fun `ringer mode names resolve case-insensitively`() {
        assertEquals(RingerMode.VIBRATE, RingerMode.fromName("Vibrate"))
        assertEquals(null, RingerMode.fromName("loud"))
    }
}
