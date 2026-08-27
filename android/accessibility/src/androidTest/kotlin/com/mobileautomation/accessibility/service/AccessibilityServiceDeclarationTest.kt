package com.mobileautomation.accessibility.service

import android.content.Context
import android.provider.Settings
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumentation checks for the accessibility service's declaration and state.
 *
 * The service itself cannot be started by a test - only the system binds it, after
 * the user enables it in Settings. What *can* be verified on a device is that the
 * declaration is correct and that the app reports the service as disabled when it
 * has not been enabled, which is the security-relevant default.
 */
@RunWith(AndroidJUnit4::class)
class AccessibilityServiceDeclarationTest {
    private val context: Context get() = ApplicationProvider.getApplicationContext()

    @Test
    fun serviceIsDeclaredInTheMergedManifest() {
        val packageManager = context.packageManager
        val services =
            packageManager
                .getPackageInfo(
                    context.packageName,
                    android.content.pm.PackageManager.GET_SERVICES,
                ).services

        val declared =
            services?.firstOrNull {
                it.name == UiAutomationAccessibilityService::class.java.name
            }

        assertNotNull(
            "The accessibility service must be declared for the system to offer it",
            declared,
        )
    }

    @Test
    fun serviceIsNotEnabledByDefault() {
        // The whole permission model rests on this: accessibility must never be
        // active without the user having turned it on themselves.
        val enabled =
            Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
            ) ?: ""

        assertFalse(
            "Accessibility must not be enabled without explicit user action",
            enabled.contains(UiAutomationAccessibilityService::class.java.name),
        )
    }

    @Test
    fun connectionReportsDisconnectedWhenTheServiceIsNotRunning() {
        AccessibilityConnection.reset()

        assertFalse(AccessibilityConnection.isConnected)
        // Callers must get null rather than a stale reader, so a workflow fails
        // safely instead of acting on a dead service.
        assertFalse(AccessibilityConnection.readerOrNull() != null)
        assertFalse(AccessibilityConnection.actionPerformerOrNull() != null)
    }
}
