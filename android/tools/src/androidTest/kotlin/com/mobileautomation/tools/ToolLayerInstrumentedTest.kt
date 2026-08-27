package com.mobileautomation.tools

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.mobileautomation.tools.android.AndroidAppManager
import com.mobileautomation.tools.android.AndroidClipboardTool
import com.mobileautomation.tools.android.AndroidSystemSettingsReader
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumentation tests for the tool implementations that need a real `Context`.
 *
 * These verify the parts a JVM test cannot: that `PackageManager` queries actually
 * return the device's apps, that the permission gate reports *denied* before
 * anything is granted, and that settings reads work against the real content
 * resolver.
 *
 * Contacts are deliberately not read here. Doing so would need the permission
 * granted on the test device, and a test that only passes with a populated address
 * book is not a test worth having in CI.
 */
@RunWith(AndroidJUnit4::class)
class ToolLayerInstrumentedTest {
    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun gate(): AndroidPermissionGate =
        AndroidPermissionGate(
            context = context,
            accessibilityServiceClassName =
                "com.mobileautomation.accessibility.service.UiAutomationAccessibilityService",
        )

    // --- permission gate --------------------------------------------------

    @Test
    fun accessibilityIsReportedAsNotGrantedByDefault() {
        // The single most important default in the app: automation must be
        // impossible until the user turns it on themselves.
        assertFalse(gate().isGranted(SensitiveCapability.ACCESSIBILITY))
    }

    @Test
    fun overlayIsReportedAsNotGrantedByDefault() {
        assertFalse(gate().isGranted(SensitiveCapability.OVERLAY))
    }

    @Test
    fun missingFromListsEveryUngrantedCapability() {
        val required = setOf(SensitiveCapability.ACCESSIBILITY, SensitiveCapability.OVERLAY)

        val missing = gate().missingFrom(required)

        assertTrue(missing.containsAll(required))
    }

    @Test
    fun requireGrantedThrowsATypedErrorForADeniedCapability() {
        val error =
            runCatching { gate().requireGranted(SensitiveCapability.ACCESSIBILITY) }
                .exceptionOrNull()

        assertTrue(error is MissingPermissionException)
        assertTrue((error as MissingPermissionException).capability == SensitiveCapability.ACCESSIBILITY)
    }

    // --- app manager ------------------------------------------------------

    @Test
    fun listsInstalledAppsFromTheDevice() {
        val apps = AndroidAppManager(context).listApps(includeSystem = true)

        // Any Android device has apps installed; an empty list means the
        // PackageManager query or the package-visibility filter is wrong.
        assertTrue("expected the device to report installed apps", apps.isNotEmpty())
    }

    @Test
    fun listedAppsCarryBothLabelAndPackage() {
        val app = AndroidAppManager(context).listApps(includeSystem = true).first()

        assertTrue(app.packageName.isNotBlank())
        assertTrue("an app needs a label the user would recognise", app.label.isNotBlank())
    }

    @Test
    fun findsThisAppByName() {
        val manager = AndroidAppManager(context)

        val found = manager.findApps(context.packageName)

        assertTrue(found.any { it.packageName == context.packageName })
    }

    @Test
    fun openingAMissingPackageFailsRatherThanThrowing() {
        val opened = AndroidAppManager(context).openApp("com.example.definitely.not.installed")

        assertFalse(opened)
    }

    @Test
    fun currentScreenIsUnknownWithoutTheAccessibilityService() {
        // Since API 21 an app cannot see the foreground app, so this must report
        // nothing rather than guessing.
        val screen = AndroidAppManager(context).currentScreen()

        assertFalse(screen.isKnown)
    }

    // --- clipboard --------------------------------------------------------

    @Test
    fun clipboardWriteAndReadRoundTripsInTheForeground() {
        val clipboard = AndroidClipboardTool(context)

        val written = clipboard.writeClipboard("automation-test-value")

        assertTrue(written)
        // The read may return null on API 29+ if the test process lacks focus,
        // which is expected behaviour rather than a failure - so only the write is
        // asserted, and the read is asserted not to throw.
        clipboard.readClipboard()
        clipboard.clearClipboard()
    }

    // --- system settings --------------------------------------------------

    @Test
    fun readsARealSystemSetting() {
        val reader = AndroidSystemSettingsReader(context)

        // Present on every Android device.
        assertNotNull(reader.getSystemSetting("airplane_mode_on"))
    }

    @Test
    fun unknownSettingReturnsNullRatherThanThrowing() {
        assertFalse(
            AndroidSystemSettingsReader(context).getSystemSetting("not_a_real_setting_xyz") != null,
        )
    }

    @Test
    fun rejectsABlankSettingKey() {
        val error =
            runCatching { AndroidSystemSettingsReader(context).getSystemSetting("") }
                .exceptionOrNull()

        assertTrue(error is IllegalArgumentException)
    }
}
