package com.mobileautomation.tools

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MediaToolTest {
    @Test
    fun `covers the playback controls a user would ask for`() {
        assertTrue(MediaCommand.names.contains("play_pause"))
        assertTrue(MediaCommand.names.contains("play"))
        assertTrue(MediaCommand.names.contains("pause"))
        assertTrue(MediaCommand.names.contains("next"))
        assertTrue(MediaCommand.names.contains("previous"))
    }

    @Test
    fun `key codes match the platform media key constants`() {
        // Hardcoded rather than referenced from KeyEvent so a wrong value fails
        // here, not by sending the wrong key to the user's music player.
        assertEquals(85, MediaCommand.PLAY_PAUSE.keyCode)
        assertEquals(126, MediaCommand.PLAY.keyCode)
        assertEquals(127, MediaCommand.PAUSE.keyCode)
        assertEquals(86, MediaCommand.STOP.keyCode)
        assertEquals(87, MediaCommand.NEXT.keyCode)
        assertEquals(88, MediaCommand.PREVIOUS.keyCode)
        assertEquals(89, MediaCommand.REWIND.keyCode)
        assertEquals(90, MediaCommand.FAST_FORWARD.keyCode)
    }

    @Test
    fun `every command has a distinct key code`() {
        val codes = MediaCommand.entries.map { it.keyCode }
        assertEquals(codes.size, codes.toSet().size)
    }

    @Test
    fun `resolves a command from free text case-insensitively`() {
        // The AI supplies these as text, so matching must not be brittle.
        assertEquals(MediaCommand.PLAY_PAUSE, MediaCommand.fromName("PLAY_PAUSE"))
        assertEquals(MediaCommand.NEXT, MediaCommand.fromName("next"))
        assertEquals(MediaCommand.PREVIOUS, MediaCommand.fromName("Previous"))
    }

    @Test
    fun `returns null for an unknown command`() {
        assertNull(MediaCommand.fromName("moonwalk"))
        assertNull(MediaCommand.fromName(""))
    }

    @Test
    fun `volume directions map to the platform adjust constants`() {
        assertEquals(1, VolumeDirection.UP.platformDirection)
        assertEquals(-1, VolumeDirection.DOWN.platformDirection)
    }

    @Test
    fun `resolves a volume direction from free text`() {
        assertEquals(VolumeDirection.UP, VolumeDirection.fromName("UP"))
        assertEquals(VolumeDirection.DOWN, VolumeDirection.fromName("down"))
        assertNull(VolumeDirection.fromName("sideways"))
    }

    @Test
    fun `media control needs no sensitive capability`() {
        // The tool is scoped to key events precisely so it adds no permission.
        // Reading what is playing would need notification-listener access, which
        // the Phase 2 permission table does not authorise.
        assertFalse(
            SensitiveCapability.entries.any { it.name.contains("MEDIA", ignoreCase = true) },
        )
    }
}
