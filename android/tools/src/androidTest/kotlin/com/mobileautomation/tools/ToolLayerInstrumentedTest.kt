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
    fun ownPackageIsVisibleWhenSystemAppsAreIncluded() {
        val manager = AndroidAppManager(context)

        val all = manager.listApps(includeSystem = true)

        // The instrumentation test package has no launcher activity, so it only
        // appears in the unfiltered list - which is itself the behaviour worth
        // pinning down: listApps(includeSystem = false) deliberately hides apps
        // that cannot be opened.
        assertTrue(all.any { it.packageName == context.packageName })
    }

    @Test
    fun launchableListExcludesAppsWithNoLauncherEntry() {
        val manager = AndroidAppManager(context)

        val launchable = manager.listApps(includeSystem = false)

        // Offering the user a target that can never be opened would be a bug, so
        // this list must be a strict subset of everything installed.
        assertTrue(launchable.size <= manager.listApps(includeSystem = true).size)
        assertFalse(
            "the test package has no launcher activity and must not be offered",
            launchable.any { it.packageName == context.packageName },
        )
    }

    @Test
    fun findAppsReturnsNothingForANonsenseQuery() {
        val found = AndroidAppManager(context).findApps("zzz-not-an-app-name-zzz")

        assertTrue(found.isEmpty())
    }

    @Test
    fun findAppsIgnoresABlankQuery() {
        // Guards against an empty AI-extracted app name matching everything and
        // opening something arbitrary.
        assertTrue(AndroidAppManager(context).findApps("   ").isEmpty())
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
    fun clipboardOperationsDoNotThrowRegardlessOfFocus() {
        val clipboard = AndroidClipboardTool(context)

        // Clipboard access is focus-dependent: from API 29 a background app cannot
        // read it, and on some API levels a write from an unfocused instrumentation
        // process is refused outright. Both are expected outcomes the tool reports
        // as a boolean rather than an exception, so what matters here is that no
        // path throws - a throw would propagate into a workflow as a crash.
        val written = clipboard.writeClipboard("automation-test-value")

        if (written) {
            // Only meaningful when the write was accepted; the read may still be
            // null without focus.
            clipboard.readClipboard()
        }

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
