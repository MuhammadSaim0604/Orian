package com.mobileautomation.tools

import android.app.AppOpsManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process
import android.provider.Settings

/**
 * Real permission checks against the platform.
 *
 * Six different mechanisms are needed, which is exactly why the gate exists as an abstraction:
 * runtime permissions go through the package manager, overlay access has its own `Settings` call,
 * the accessibility service's state lives in a secure setting string that has to be parsed, the
 * assistant role is another secure setting, usage access is an `AppOpsManager` check rather than a
 * permission at all, and exact alarms are asked of `AlarmManager`.
 *
 * **State is always read live.** Nothing here caches, because a cached grant means acting on a
 * permission the user revoked a minute ago.
 */
class AndroidPermissionGate(
    private val context: Context,
    private val accessibilityServiceClassName: String,
    /**
     * Whether a screen-capture session is currently held.
     *
     * Supplied rather than read here, because MediaProjection consent is not a permission the
     * platform can be asked about - it is a session object someone else owns. Defaulting to false
     * keeps the gate usable in the tool layer, where capture state is irrelevant.
     */
    private val hasScreenCaptureSession: () -> Boolean = { false },
) : PermissionGate {
    override fun isGranted(capability: SensitiveCapability): Boolean =
        when (capability) {
            SensitiveCapability.ACCESSIBILITY -> isAccessibilityServiceEnabled()
            SensitiveCapability.OVERLAY -> canDrawOverlays()
            SensitiveCapability.ASSISTANT -> isDefaultAssistant()
            SensitiveCapability.USAGE_ACCESS -> hasUsageAccess()
            SensitiveCapability.NOTIFICATIONS -> isNotificationPermissionGranted()
            SensitiveCapability.EXACT_ALARM -> isExactAlarmAllowed()
            SensitiveCapability.SCREEN_CAPTURE -> hasScreenCaptureSession()
            SensitiveCapability.FOREGROUND_SERVICE -> hasRuntimePermission(capability.permission)
            SensitiveCapability.CONTACTS -> hasRuntimePermission(capability.permission)
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

    /**
     * Whether this app holds the assistant role.
     *
     * Read from the `assistant` secure setting, which holds a `package/ServiceClass` string. There
     * is no public API for it and `RoleManager.isRoleHeld(ROLE_ASSISTANT)` is not available, so the
     * setting is the only source - and it may be absent entirely on a device with no assistant, in
     * which case nobody holds the role.
     */
    private fun isDefaultAssistant(): Boolean {
        val assistant =
            runCatching {
                Settings.Secure.getString(context.contentResolver, SETTING_ASSISTANT)
            }.getOrNull()

        if (assistant.isNullOrBlank()) return false

        // Prefix match on the package: the component after the slash is the app's own service name,
        // which it is free to change, so comparing the whole string would break on our own rename.
        return assistant.startsWith("${context.packageName}/")
    }

    /**
     * Whether usage access is granted.
     *
     * Not a permission in the runtime sense - `PACKAGE_USAGE_STATS` is `appop`-guarded, so
     * `checkSelfPermission` returns granted whenever it is merely declared in the manifest. That
     * false positive is the reason this goes through `AppOpsManager` instead: only
     * `unsafeCheckOpNoThrow` reflects what the user actually allowed in settings.
     */
    private fun hasUsageAccess(): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager ?: return false

        val mode =
            runCatching {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    appOps.unsafeCheckOpNoThrow(
                        AppOpsManager.OPSTR_GET_USAGE_STATS,
                        Process.myUid(),
                        context.packageName,
                    )
                } else {
                    @Suppress("DEPRECATION")
                    appOps.checkOpNoThrow(
                        AppOpsManager.OPSTR_GET_USAGE_STATS,
                        Process.myUid(),
                        context.packageName,
                    )
                }
            }.getOrNull() ?: return false

        return when (mode) {
            AppOpsManager.MODE_ALLOWED -> true
            // MODE_DEFAULT means "fall back to the permission check", which for an appop-guarded
            // permission means the manifest declaration - so it has to be confirmed rather than
            // assumed either way.
            AppOpsManager.MODE_DEFAULT -> hasRuntimePermission(SensitiveCapability.USAGE_ACCESS.permission)
            else -> false
        }
    }

    private companion object {
        /** `Settings.Secure.ASSISTANT`, which is not public API. */
        const val SETTING_ASSISTANT = "assistant"
    }
}
