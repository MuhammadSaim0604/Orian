package com.mobileautomation.tools

/**
 * What the user is told before a sensitive permission is requested.
 *
 * Rationale copy lives in Kotlin next to the capability it belongs to rather than
 * in the RN layer, so a new capability cannot be added without also stating why it
 * is needed - the permission model requires an explicit rationale for every
 * sensitive grant (`conventions/Permission_Model.md`), and a missing rationale
 * should be a gap in code review, not a silent omission at runtime.
 *
 * @param title short heading for the rationale screen.
 * @param explanation why the app needs this, in the user's terms.
 * @param consequenceIfDenied what stops working without it, so the choice is
 *   informed rather than a blind "allow to continue".
 * @param settingsAction system settings action to open, or null when a runtime
 *   dialog is enough.
 */
data class PermissionRationale(
    val capability: SensitiveCapability,
    val title: String,
    val explanation: String,
    val consequenceIfDenied: String,
    val settingsAction: String? = null,
) {
    /** True when the user must leave the app to grant this. */
    val requiresSettingsVisit: Boolean get() = settingsAction != null

    companion object {
        /**
         * Rationale for [capability].
         *
         * Exhaustive by construction: the `when` has no else branch, so adding a
         * capability without rationale copy fails to compile.
         */
        fun forCapability(capability: SensitiveCapability): PermissionRationale =
            when (capability) {
                SensitiveCapability.ACCESSIBILITY ->
                    PermissionRationale(
                        capability = capability,
                        title = "Allow Mobile Automation to control your phone",
                        explanation =
                            "To run your automations, this app needs to read what is on your " +
                                "screen and tap, swipe, and type for you. This is the same " +
                                "Android feature screen readers use. Screen content is used only " +
                                "while a task is running.",
                        consequenceIfDenied =
                            "Without this, no automation or AI task can read the screen or act on it.",
                        settingsAction = ACTION_ACCESSIBILITY_SETTINGS,
                    )

                SensitiveCapability.OVERLAY ->
                    PermissionRationale(
                        capability = capability,
                        title = "Allow the floating toolset",
                        explanation =
                            "The Configure-with-AI toolset floats over other apps so you can point " +
                                "at something on screen and describe what you want.",
                        consequenceIfDenied =
                            "Without this, you can still build workflows in the app, but not " +
                                "configure them on top of another app.",
                        settingsAction = ACTION_OVERLAY_SETTINGS,
                    )

                SensitiveCapability.ASSISTANT ->
                    PermissionRationale(
                        capability = capability,
                        title = "Set as your digital assistant",
                        explanation =
                            "As your assistant, the app gets a more precise picture of what is on " +
                                "screen than the accessibility service alone can give it, which makes " +
                                "automations more reliable on apps that draw their own interface.",
                        consequenceIfDenied =
                            "Without this, automation still works, but it will misread some screens " +
                                "that do not expose their contents in the usual way.",
                        settingsAction = ACTION_ASSISTANT_SETTINGS,
                    )

                SensitiveCapability.USAGE_ACCESS ->
                    PermissionRationale(
                        capability = capability,
                        title = "Allow the app to see which app is open",
                        explanation =
                            "So automations know reliably which app is in front of you. Only the name " +
                                "of the app in the foreground is used - not what you do in it, and " +
                                "nothing is stored.",
                        consequenceIfDenied =
                            "Without this, the app has to guess the current app from screen events, " +
                                "which goes stale and can make a workflow act on the wrong app.",
                        settingsAction = ACTION_USAGE_ACCESS_SETTINGS,
                    )

                SensitiveCapability.FOREGROUND_SERVICE ->
                    PermissionRationale(
                        capability = capability,
                        title = "Keep automations running",
                        explanation =
                            "Automations run while you are in other apps, so the app keeps a " +
                                "notification visible while a task is active. You can stop the " +
                                "task from that notification at any time.",
                        consequenceIfDenied =
                            "Without this, Android may kill an automation part-way through.",
                    )

                SensitiveCapability.SCREEN_CAPTURE ->
                    PermissionRationale(
                        capability = capability,
                        title = "Allow screenshots while a task runs",
                        explanation =
                            "When the AI cannot identify something from the screen's structure " +
                                "alone, it looks at a screenshot. You are asked each time you " +
                                "start a session, and Android shows a recording indicator.",
                        consequenceIfDenied =
                            "Without this, the AI works from screen structure only and may fail on " +
                                "image-heavy screens.",
                    )

                SensitiveCapability.CONTACTS ->
                    PermissionRationale(
                        capability = capability,
                        title = "Allow reading your contacts",
                        explanation =
                            "So a goal such as \"message Robert\" can find the right person. " +
                                "Only names and phone numbers are read, only when a task needs " +
                                "them, and nothing is stored.",
                        consequenceIfDenied =
                            "Without this, you will need to type phone numbers into workflows yourself.",
                    )

                SensitiveCapability.EXACT_ALARM ->
                    PermissionRationale(
                        capability = capability,
                        title = "Allow setting alarms and timed triggers",
                        explanation =
                            "So workflows can create alarms in your clock app and run at the times " +
                                "you schedule.",
                        consequenceIfDenied =
                            "Without this, alarms open your clock app pre-filled instead of being " +
                                "set directly, and timed triggers may fire late.",
                        settingsAction = ACTION_EXACT_ALARM_SETTINGS,
                    )

                SensitiveCapability.NOTIFICATIONS ->
                    PermissionRationale(
                        capability = capability,
                        title = "Allow notifications",
                        explanation =
                            "So the app can show that an automation is running and tell you the " +
                                "result when it finishes.",
                        consequenceIfDenied =
                            "Without this, you will not see automation results or be able to stop a " +
                                "run from the notification shade.",
                    )

                SensitiveCapability.SMS ->
                    PermissionRationale(
                        capability = capability,
                        title = "Allow sending and reading text messages",
                        explanation =
                            "So a task such as \"text Robert that I am running late\" can send the " +
                                "message itself, and so it can read a recent message when you ask it to " +
                                "find a code or reply to someone. Messages are read only when a task " +
                                "needs them, and nothing is stored.",
                        consequenceIfDenied =
                            "Without this, the agent has to open your messaging app and type into it, " +
                                "which is slower and fails on apps it cannot read.",
                    )

                SensitiveCapability.PHONE ->
                    PermissionRationale(
                        capability = capability,
                        title = "Allow placing calls",
                        explanation =
                            "So \"call Mum\" actually dials rather than opening the dialer and waiting " +
                                "for you to press the button. The app never places a call unless a task " +
                                "you started asks it to.",
                        consequenceIfDenied =
                            "Without this, the agent can only open the dialer with the number filled in " +
                                "for you to confirm.",
                    )

                SensitiveCapability.WRITE_SETTINGS ->
                    PermissionRationale(
                        capability = capability,
                        title = "Allow changing system settings",
                        explanation =
                            "So a task can turn the brightness down, extend the screen timeout, or " +
                                "change other device settings you ask it to. Only the settings a task " +
                                "names are touched.",
                        consequenceIfDenied =
                            "Without this, the agent can read settings but not change them, and has to " +
                                "navigate the Settings app instead.",
                        settingsAction = ACTION_WRITE_SETTINGS,
                    )

                SensitiveCapability.DO_NOT_DISTURB ->
                    PermissionRationale(
                        capability = capability,
                        title = "Allow silencing and un-silencing the phone",
                        explanation =
                            "So a task can put your phone on silent or vibrate and set it back " +
                                "afterwards. Android treats this as Do Not Disturb access, which is why " +
                                "it is granted on its own screen.",
                        consequenceIfDenied =
                            "Without this, the agent can turn the volume up and down but cannot switch " +
                                "the phone to silent or vibrate.",
                        settingsAction = ACTION_NOTIFICATION_POLICY,
                    )
            }

        /** Rationale for every sensitive capability, for a permissions overview screen. */
        fun all(): List<PermissionRationale> = SensitiveCapability.entries.map { forCapability(it) }

        /** Rationale for the capabilities onboarding must gate on, in the order to present them. */
        fun required(): List<PermissionRationale> = SensitiveCapability.required().map { forCapability(it) }

        /** Rationale for the capabilities onboarding offers but does not require. */
        fun optional(): List<PermissionRationale> = SensitiveCapability.optional().map { forCapability(it) }

        const val ACTION_ACCESSIBILITY_SETTINGS: String = "android.settings.ACCESSIBILITY_SETTINGS"
        const val ACTION_OVERLAY_SETTINGS: String = "android.settings.action.MANAGE_OVERLAY_PERMISSION"
        const val ACTION_ASSISTANT_SETTINGS: String = "android.settings.VOICE_INPUT_SETTINGS"
        const val ACTION_USAGE_ACCESS_SETTINGS: String = "android.settings.USAGE_ACCESS_SETTINGS"
        const val ACTION_EXACT_ALARM_SETTINGS: String = "android.settings.REQUEST_SCHEDULE_EXACT_ALARM"

        /**
         * Per-app special-access screens.
         *
         * `MANAGE_WRITE_SETTINGS` needs this app's package as the intent data or it lands on the
         * device-wide list and the user has to find us in it - the kind of small friction that makes a
         * permission screen feel broken. `PermissionsModule` appends the package; the action is declared
         * here so the decision stays next to the capability that needs it.
         */
        const val ACTION_WRITE_SETTINGS: String = "android.settings.action.MANAGE_WRITE_SETTINGS"
        const val ACTION_NOTIFICATION_POLICY: String = "android.settings.NOTIFICATION_POLICY_ACCESS_SETTINGS"
    }
}
