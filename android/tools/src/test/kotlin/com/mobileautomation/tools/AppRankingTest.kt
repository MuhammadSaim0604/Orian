package com.mobileautomation.tools

import com.mobileautomation.tools.model.InstalledApp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Matching an app by the name a person uses.
 *
 * This exists because `openAppByName` could not find Settings, Clock, Phone, Messages, Camera or the browser -
 * every one of them a system package, and every one of them exactly what a spoken goal names. `findApps`
 * searched only non-system apps, so the agent was told "no installed app matches" for apps that were
 * definitely installed.
 *
 * Fixing that made ranking matter: including system apps means an exact match now competes with several
 * partial ones, so "clock" must not open *Alarm Clock*.
 */
class AppRankingTest {
    private fun app(
        label: String,
        packageName: String = "com.example.${label.lowercase().replace(" ", "")}",
        system: Boolean = false,
    ) = InstalledApp(packageName = packageName, label = label, isSystemApp = system)

    @Test
    fun `finds a system app, which is the whole point`() {
        // The bug: these were filtered out entirely, so the agent could never open the phone's own settings.
        val apps = listOf(app("Settings", "com.android.settings", system = true), app("Slack"))

        assertEquals("com.android.settings", AppRanking.best(apps, "settings")?.packageName)
    }

    @Test
    fun `prefers an exact label match over a longer one containing it`() {
        val apps = listOf(app("Alarm Clock", system = true), app("Clock", system = true))

        assertEquals("Clock", AppRanking.best(apps, "Clock")?.label)
    }

    @Test
    fun `prefers a label that starts with the query`() {
        // No exact match here, so the starts-with tier is what decides. Without it "clock ap" would rank
        // "Alarm Clock App" and "Clock App" equally and pick whichever the package manager listed first.
        val apps = listOf(app("Alarm Clock App"), app("Clock App"))

        assertEquals("Clock App", AppRanking.best(apps, "Clock ap")?.label)
    }

    @Test
    fun `prefers a user-installed app over a preinstalled one`() {
        // Someone who installed their own clock means that one; the stock app is the fallback.
        val apps = listOf(app("Clock", "com.android.deskclock", system = true), app("Clock", "com.mine.clock"))

        assertEquals("com.mine.clock", AppRanking.best(apps, "Clock")?.packageName)
    }

    @Test
    fun `prefers the shorter label when nothing else separates them`() {
        val apps = listOf(app("Messages Backup"), app("Messages"))

        assertEquals("Messages", AppRanking.best(apps, "Messages")?.label)
    }

    @Test
    fun `matches case-insensitively`() {
        val apps = listOf(app("WhatsApp"))

        assertEquals("WhatsApp", AppRanking.best(apps, "whatsapp")?.label)
    }

    @Test
    fun `matches on the package name too`() {
        // An agent that has read a package from the screen or a previous result should be able to use it here.
        val apps = listOf(app("Green Bubble", "com.whatsapp"))

        assertEquals("Green Bubble", AppRanking.best(apps, "com.whatsapp")?.label)
    }

    @Test
    fun `returns nothing for a blank query rather than everything`() {
        // Returning the whole list would have the agent launch something arbitrary.
        val apps = listOf(app("Clock"), app("Settings"))

        assertTrue(AppRanking.rank(apps, "   ").isEmpty())
        assertNull(AppRanking.best(apps, ""))
    }

    @Test
    fun `returns nothing when nothing matches`() {
        assertNull(AppRanking.best(listOf(app("Clock")), "Spreadsheet"))
    }

    @Test
    fun `is stable rather than dependent on the package manager's order`() {
        // Two identical labels differing only in package: the order must not depend on which the platform
        // happened to return first, or the same goal would open different apps on different runs.
        val forwards = listOf(app("Notes", "com.b.notes"), app("Notes", "com.a.notes"))
        val backwards = forwards.reversed()

        assertEquals(
            AppRanking.rank(forwards, "Notes").map { it.packageName },
            AppRanking.rank(backwards, "Notes").map { it.packageName },
        )
    }
}
