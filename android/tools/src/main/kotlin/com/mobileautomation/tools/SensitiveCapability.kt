package com.mobileautomation.tools

/**
 * Sensitive capabilities and the permission each one needs.
 *
 * Every entry here is high-trust and must be requested with an explicit
 * rationale and user opt-in, gated to the phase that needs it
 * (conventions/Permission_Model.md). Nothing is enabled silently.
 */
enum class SensitiveCapability(
    val permission: String,
    val requiresSystemSettingsScreen: Boolean,
) {
    /** Reads screen content and dispatches gestures. The highest-trust grant. */
    ACCESSIBILITY("android.permission.BIND_ACCESSIBILITY_SERVICE", true),

    /** Draws the Configure-with-AI toolset over other apps. */
    OVERLAY("android.permission.SYSTEM_ALERT_WINDOW", true),

    /** Keeps automation alive while the user is in another app. */
    FOREGROUND_SERVICE("android.permission.FOREGROUND_SERVICE", false),

    /** Screenshots for AI screen reasoning. Consent is per session. */
    SCREEN_CAPTURE("android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION", false),

    /** Resolves a person by name, for goals such as "message Robert". */
    CONTACTS("android.permission.READ_CONTACTS", false),

    /** Time-based triggers and the createAlarm tool. */
    EXACT_ALARM("android.permission.SCHEDULE_EXACT_ALARM", false),

    /** Foreground-service and workflow result notifications. */
    NOTIFICATIONS("android.permission.POST_NOTIFICATIONS", false),
    ;

    companion object {
        /**
         * Capabilities the user must grant from system settings rather than a
         * runtime dialog. These need an in-app rationale screen first.
         */
        fun requiringSettingsRedirect(): List<SensitiveCapability> =
            entries.filter { it.requiresSystemSettingsScreen }
    }
}

/**
 * Every sensitive capability requires an explicit rationale before it is
 * requested. There is deliberately no path that returns false: this function
 * documents an invariant the UI layer must honour.
 */
fun requiresExplicitRationale(capability: SensitiveCapability): Boolean {
    require(capability.permission.isNotBlank()) { "capability must declare a permission" }
    return true
}
