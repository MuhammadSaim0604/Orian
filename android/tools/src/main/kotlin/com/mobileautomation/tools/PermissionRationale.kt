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
            }

        /** Rationale for every sensitive capability, for a permissions overview screen. */
        fun all(): List<PermissionRationale> = SensitiveCapability.entries.map { forCapability(it) }

        const val ACTION_ACCESSIBILITY_SETTINGS: String = "android.settings.ACCESSIBILITY_SETTINGS"
        const val ACTION_OVERLAY_SETTINGS: String = "android.settings.action.MANAGE_OVERLAY_PERMISSION"
    }
}
