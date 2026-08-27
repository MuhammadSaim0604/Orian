package com.mobileautomation.tools

import com.mobileautomation.tools.model.AlarmRequest
import com.mobileautomation.tools.model.Contact
import com.mobileautomation.tools.model.CurrentScreen
import com.mobileautomation.tools.model.InstalledApp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class InstalledAppTest {
    private val whatsapp = InstalledApp(packageName = "com.whatsapp", label = "WhatsApp")

    @Test
    fun `matches on label regardless of case`() {
        assertTrue(whatsapp.matches("whatsapp"))
        assertTrue(whatsapp.matches("WhatsApp"))
        assertTrue(whatsapp.matches("whats"))
    }

    @Test
    fun `matches on package name`() {
        assertTrue(whatsapp.matches("com.whats"))
    }

    @Test
    fun `does not match unrelated text`() {
        assertFalse(whatsapp.matches("telegram"))
    }

    @Test
    fun `a blank query matches nothing rather than everything`() {
        // Guards against an empty AI-extracted app name opening a random app.
        assertFalse(whatsapp.matches(""))
        assertFalse(whatsapp.matches("   "))
    }
}

class ContactTest {
    private val robert =
        Contact(
            id = "42",
            displayName = "Robert Smith",
            phoneNumbers = listOf("+44 7700 900123", "0161 496 0123"),
        )

    @Test
    fun `matches on first or last name`() {
        assertTrue(robert.matches("Robert"))
        assertTrue(robert.matches("smith"))
    }

    @Test
    fun `matches a number written with different formatting`() {
        // The user's stored number has spaces; an AI-supplied one may not.
        assertTrue(robert.matches("447700900123"))
    }

    @Test
    fun `exposes the primary number`() {
        assertEquals("+44 7700 900123", robert.primaryPhoneNumber)
        assertNull(robert.copy(phoneNumbers = emptyList()).primaryPhoneNumber)
    }

    @Test
    fun `a blank query matches nothing`() {
        assertFalse(robert.matches(""))
    }
}

class AlarmRequestTest {
    @Test
    fun `accepts a valid time`() {
        val request = AlarmRequest(hour = 7, minute = 30, label = "Standup")
        assertEquals("07:30", request.formattedTime())
    }

    @Test
    fun `formats midnight and end of day`() {
        assertEquals("00:00", AlarmRequest(0, 0).formattedTime())
        assertEquals("23:59", AlarmRequest(23, 59).formattedTime())
    }

    @Test
    fun `rejects an out-of-range hour`() {
        assertTrue(
            runCatching { AlarmRequest(hour = 24, minute = 0) }.exceptionOrNull()
                is IllegalArgumentException,
        )
        assertTrue(
            runCatching { AlarmRequest(hour = -1, minute = 0) }.exceptionOrNull()
                is IllegalArgumentException,
        )
    }

    @Test
    fun `rejects an out-of-range minute`() {
        assertTrue(
            runCatching { AlarmRequest(hour = 7, minute = 60) }.exceptionOrNull()
                is IllegalArgumentException,
        )
    }

    @Test
    fun `rejects an out-of-range repeat day`() {
        assertTrue(
            runCatching { AlarmRequest(7, 0, repeatDays = setOf(0)) }.exceptionOrNull()
                is IllegalArgumentException,
        )
        assertTrue(
            runCatching { AlarmRequest(7, 0, repeatDays = setOf(8)) }.exceptionOrNull()
                is IllegalArgumentException,
        )
    }

    @Test
    fun `distinguishes recurring from one-off alarms`() {
        assertFalse(AlarmRequest(7, 0).isRecurring)
        assertTrue(AlarmRequest(7, 0, repeatDays = setOf(1, 2, 3, 4, 5)).isRecurring)
    }
}

class IntentRequestTest {
    @Test
    fun `accepts an action`() {
        assertEquals("android.intent.action.VIEW", IntentRequest("android.intent.action.VIEW").action)
    }

    @Test
    fun `rejects a blank action`() {
        // A blank action produces an intent that matches nothing useful and, worse,
        // could resolve unpredictably.
        assertTrue(
            runCatching { IntentRequest("") }.exceptionOrNull() is IllegalArgumentException,
        )
        assertTrue(
            runCatching { IntentRequest("   ") }.exceptionOrNull() is IllegalArgumentException,
        )
    }

    @Test
    fun `defaults to resolving without a chooser`() {
        assertFalse(IntentRequest("android.intent.action.VIEW").requireChooser)
    }
}

class CurrentScreenTest {
    @Test
    fun `knows when the foreground package is identified`() {
        assertTrue(CurrentScreen("com.whatsapp", "com.whatsapp.Conversation").isKnown)
        assertFalse(CurrentScreen(null, null).isKnown)
        assertFalse(CurrentScreen("", null).isKnown)
    }
}
