package com.mobileautomation.tools

/**
 * Sensitive capabilities, and how each one is granted.
 *
 * Every entry is high-trust and must be requested with an explicit rationale and user opt-in
 * (`conventions/Permission_Model.md`). Nothing is enabled silently.
 *
 * The **tier** is the important field. A required capability is one the product does not function
 * without, so onboarding will not complete until it is granted; an optional one is offered during
 * onboarding, skippable, and requested again at the moment something actually needs it. Encoding
 * that here rather than in the UI means a new capability cannot be added without deciding which it
 * is.
 */
enum class SensitiveCapability(
    val permission: String,
    val tier: CapabilityTier,
    val grant: GrantMechanism,
) {
    /** Reads screen content and dispatches gestures. The highest-trust grant. */
    ACCESSIBILITY(
        permission = "android.permission.BIND_ACCESSIBILITY_SERVICE",
        tier = CapabilityTier.REQUIRED,
        grant = GrantMechanism.SETTINGS_SCREEN,
    ),

    /** Draws the agent status overlay and the node toolset over other apps. */
    OVERLAY(
        permission = "android.permission.SYSTEM_ALERT_WINDOW",
        tier = CapabilityTier.REQUIRED,
        grant = GrantMechanism.SETTINGS_SCREEN,
    ),

    /**
     * The device assistant role.
     *
     * Gives a more precise reading of the current screen than the accessibility tree alone, because
     * the assistant receives structured context the system does not otherwise expose.
     */
    ASSISTANT(
        permission = "android.permission.BIND_VOICE_INTERACTION",
        tier = CapabilityTier.REQUIRED,
        grant = GrantMechanism.SETTINGS_SCREEN,
    ),

    /**
     * Usage access.
     *
     * Reliable foreground-app detection. The accessibility service can report the package it last
     * saw an event from, which is not the same thing and goes stale the moment events stop.
     */
    USAGE_ACCESS(
        permission = "android.permission.PACKAGE_USAGE_STATS",
        tier = CapabilityTier.REQUIRED,
        grant = GrantMechanism.SETTINGS_SCREEN,
    ),

    /** Foreground-service and workflow result notifications. */
    NOTIFICATIONS(
        permission = "android.permission.POST_NOTIFICATIONS",
        tier = CapabilityTier.REQUIRED,
        grant = GrantMechanism.RUNTIME_PROMPT,
    ),

    /** Keeps automation alive while the user is in another app. Granted at install. */
    FOREGROUND_SERVICE(
        permission = "android.permission.FOREGROUND_SERVICE",
        tier = CapabilityTier.OPTIONAL,
        grant = GrantMechanism.INSTALL_TIME,
    ),

    /**
     * Screenshots for AI screen reasoning, OCR, and the vision fallback.
     *
     * Optional but special: MediaProjection consent is per session, so it cannot be granted once
     * and forgotten - which is why it has its own mechanism rather than being a runtime prompt.
     */
    SCREEN_CAPTURE(
        permission = "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION",
        tier = CapabilityTier.OPTIONAL,
        grant = GrantMechanism.SESSION_CONSENT,
    ),

    /** Resolves a person by name, for goals such as "message Robert". */
    CONTACTS(
        permission = "android.permission.READ_CONTACTS",
        tier = CapabilityTier.OPTIONAL,
        grant = GrantMechanism.RUNTIME_PROMPT,
    ),

    /** Time-based triggers and the createAlarm tool. */
    EXACT_ALARM(
        permission = "android.permission.SCHEDULE_EXACT_ALARM",
        tier = CapabilityTier.OPTIONAL,
        grant = GrantMechanism.SETTINGS_SCREEN,
    ),

    /**
     * Sending and reading text messages.
     *
     * One capability rather than two, because `SEND_SMS` and `READ_SMS` are one permission group as far
     * as the runtime dialog is concerned: asking for either shows the same "Send and view SMS messages"
     * prompt, so presenting them as separate toggles would imply a choice the platform does not offer.
     */
    SMS(
        permission = "android.permission.SEND_SMS",
        tier = CapabilityTier.OPTIONAL,
        grant = GrantMechanism.RUNTIME_PROMPT,
    ),

    /**
     * Placing and ending phone calls.
     *
     * `CALL_PHONE` dials without a confirmation screen, which is the point - an agent that opened the
     * dialer pre-filled and waited would not have completed the task. It is also why this is optional and
     * asked for at the moment it is needed.
     */
    PHONE(
        permission = "android.permission.CALL_PHONE",
        tier = CapabilityTier.OPTIONAL,
        grant = GrantMechanism.RUNTIME_PROMPT,
    ),

    /**
     * Changing system settings such as brightness or screen timeout.
     *
     * A special access grant rather than a runtime permission: `WRITE_SETTINGS` is held per app in a
     * dedicated settings screen, so `checkSelfPermission` is not the way to read it and there is no
     * dialog to show.
     */
    WRITE_SETTINGS(
        permission = "android.permission.WRITE_SETTINGS",
        tier = CapabilityTier.OPTIONAL,
        grant = GrantMechanism.SETTINGS_SCREEN,
    ),

    /**
     * Changing the ringer mode, including silencing the phone.
     *
     * Silent and vibrate are behind Do Not Disturb policy access from API 23 - `setRingerMode` throws
     * without it - so the capability is that access rather than a permission the app can simply hold.
     */
    DO_NOT_DISTURB(
        permission = "android.permission.ACCESS_NOTIFICATION_POLICY",
        tier = CapabilityTier.OPTIONAL,
        grant = GrantMechanism.SETTINGS_SCREEN,
    ),
    ;

    /** True when the user must leave the app to grant this. */
    val requiresSystemSettingsScreen: Boolean
        get() = grant == GrantMechanism.SETTINGS_SCREEN

    /** Stable id for the TypeScript side. Lowercase because it becomes a union member there. */
    val id: String get() = name.lowercase()

    companion object {
        fun required(): List<SensitiveCapability> = entries.filter { it.tier == CapabilityTier.REQUIRED }

        fun optional(): List<SensitiveCapability> = entries.filter { it.tier == CapabilityTier.OPTIONAL }

        /**
         * Capabilities the user must grant from system settings rather than a runtime dialog.
         *
         * These need the longest UI path: a rationale, a deep link, and a re-check when the user
         * comes back, because there is no callback to wait on.
         */
        fun requiringSettingsRedirect(): List<SensitiveCapability> = entries.filter { it.requiresSystemSettingsScreen }

        fun fromId(id: String): SensitiveCapability? = entries.firstOrNull { it.id == id }
    }
}

/**
 * Whether the product works at all without this.
 *
 * The distinction drives onboarding: [REQUIRED] blocks completion, [OPTIONAL] does not and is
 * asked for again when a node or a tool actually needs it.
 */
enum class CapabilityTier {
    REQUIRED,
    OPTIONAL,
}

/**
 * How a capability is granted.
 *
 * Four genuinely different flows, and conflating them is what makes permission UI feel broken:
 *
 * - [RUNTIME_PROMPT] resolves with a callback, so the UI can await a result.
 * - [SETTINGS_SCREEN] has **no callback at all**. The app deep-links to settings and can only
 *   re-read the state when the user returns, so the UI must be built around that round trip rather
 *   than pretending it is a dialog.
 * - [SESSION_CONSENT] is granted per session and lost on restart, so "granted" is never permanent.
 * - [INSTALL_TIME] needs no request; it is either in the manifest or it is not.
 */
enum class GrantMechanism {
    RUNTIME_PROMPT,
    SETTINGS_SCREEN,
    SESSION_CONSENT,
    INSTALL_TIME,
}

/**
 * Every sensitive capability requires an explicit rationale before it is requested. There is
 * deliberately no path that returns false: this function documents an invariant the UI must honour.
 */
fun requiresExplicitRationale(capability: SensitiveCapability): Boolean {
    require(capability.permission.isNotBlank()) { "capability must declare a permission" }
    return true
}
