package com.mobileautomation.tools

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings

/**
 * Real permission checks against the platform.
 *
 * Three different mechanisms are needed, which is exactly why the gate exists as
 * an abstraction: normal runtime permissions are checked with the package
 * manager, overlay access has its own `Settings` call, and the accessibility
 * service's state lives in a secure setting string that has to be parsed.
 */
class AndroidPermissionGate(
    private val context: Context,
    private val accessibilityServiceClassName: String,
) : PermissionGate {
    override fun isGranted(capability: SensitiveCapability): Boolean =
        when (capability) {
            SensitiveCapability.ACCESSIBILITY -> isAccessibilityServiceEnabled()
            SensitiveCapability.OVERLAY -> canDrawOverlays()
            SensitiveCapability.NOTIFICATIONS -> isNotificationPermissionGranted()
            SensitiveCapability.EXACT_ALARM -> isExactAlarmAllowed()
            else -> hasRuntimePermission(capability.permission)
        }

    private fun hasRuntimePermission(permission: String): Boolean =
        context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    private fun canDrawOverlays(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(context)
        } else {
            true
        }

    /**
     * POST_NOTIFICATIONS only exists from API 33. Below that, notifications are
     * allowed by default, so treating the permission as granted is correct rather
     * than permissive.
     */
    private fun isNotificationPermissionGranted(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            hasRuntimePermission(SensitiveCapability.NOTIFICATIONS.permission)
        } else {
            true
        }

    /**
     * SCHEDULE_EXACT_ALARM is granted at install time on API 31-32, revocable by
     * the user on 33+, and unnecessary below 31.
     */
    private fun isExactAlarmAllowed(): Boolean =
        when {
            Build.VERSION.SDK_INT < Build.VERSION_CODES.S -> true
            else -> {
                val alarmManager =
                    context.getSystemService(Context.ALARM_SERVICE) as? android.app.AlarmManager
                alarmManager?.canScheduleExactAlarms() ?: false
            }
        }

    /**
     * The enabled-services setting is a colon-separated list of
     * `package/ServiceClass` entries. There is no API that answers "is *my*
     * service enabled", so the string has to be parsed.
     */
    private fun isAccessibilityServiceEnabled(): Boolean {
        val enabled =
            Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
            ) ?: return false

        val expected = "${context.packageName}/$accessibilityServiceClassName"
        return enabled
            .split(':')
            .any { entry -> entry.equals(expected, ignoreCase = true) }
    }
}
