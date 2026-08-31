package com.mobileautomation.tools.model

/**
 * An installed application.
 *
 * `label` is what the user calls the app and what an AI goal will name ("open
 * WhatsApp"); `packageName` is what the system needs. Both are kept so the tool
 * layer can translate between the two.
 */
data class InstalledApp(
    val packageName: String,
    val label: String,
    val isSystemApp: Boolean = false,
    val versionName: String? = null,
) {
    /** True when the label or package plausibly matches [query]. */
    fun matches(query: String): Boolean {
        val needle = query.trim()
        if (needle.isEmpty()) return false
        return label.contains(needle, ignoreCase = true) ||
            packageName.contains(needle, ignoreCase = true)
    }
}

/**
 * A contact and its phone numbers.
 *
 * Only the fields automation needs are read. Contacts are among the most
 * sensitive data on the device, so nothing beyond name and numbers is loaded, and
 * nothing is cached.
 */
data class Contact(
    val id: String,
    val displayName: String,
    val phoneNumbers: List<String> = emptyList(),
) {
    val primaryPhoneNumber: String? get() = phoneNumbers.firstOrNull()

    fun matches(query: String): Boolean {
        val needle = query.trim()
        if (needle.isEmpty()) return false
        return displayName.contains(needle, ignoreCase = true) ||
            phoneNumbers.any { it.replace(NON_DIGITS, "").contains(needle.replace(NON_DIGITS, "")) }
    }

    private companion object {
        val NON_DIGITS = Regex("[^0-9]")
    }
}

/**
 * An alarm to create.
 *
 * A request object rather than loose parameters, so validation happens once and
 * an invalid time cannot reach the platform.
 */
data class AlarmRequest(
    val hour: Int,
    val minute: Int,
    val label: String? = null,
    /** Days of week, 1 = Monday through 7 = Sunday. Empty means a one-off alarm. */
    val repeatDays: Set<Int> = emptySet(),
    /** When false the clock app opens pre-filled instead of setting it silently. */
    val skipUi: Boolean = true,
) {
    init {
        require(hour in 0..23) { "hour must be 0-23, was $hour" }
        require(minute in 0..59) { "minute must be 0-59, was $minute" }
        require(repeatDays.all { it in 1..7 }) { "repeatDays must be 1-7, was $repeatDays" }
    }

    val isRecurring: Boolean get() = repeatDays.isNotEmpty()

    /** 24-hour `HH:mm`, for display and logging. */
    fun formattedTime(): String = "%02d:%02d".format(hour, minute)
}

/**
 * The screen currently in the foreground.
 *
 * Package and activity together identify a screen, which is what a selector is
 * scoped to and what the AI needs to know where it is.
 */
data class CurrentScreen(
    val packageName: String?,
    val activityName: String?,
) {
    val isKnown: Boolean get() = !packageName.isNullOrBlank()
}

/**
 * One text message.
 *
 * Only what a task needs: who, what, when, and which direction. Deliberately no thread id, no read state,
 * no attachment metadata — an agent asked to find a verification code or reply to someone needs none of it,
 * and every extra field is more of the user's private data crossing the bridge and potentially reaching a
 * model.
 */
data class SmsMessage(
    /** The other party's number. For an outgoing message, the recipient. */
    val address: String,
    val body: String,
    val receivedAtEpochMs: Long,
    /** True when the user sent it rather than received it. */
    val isOutgoing: Boolean = false,
) {
    /**
     * A short preview, for logs and confirmation prompts.
     *
     * Truncated because message bodies end up in places a full one should not: a notification, a
     * confirmation dialog, a log line.
     */
    fun preview(maxLength: Int = PREVIEW_LENGTH): String =
        if (body.length <= maxLength) body else body.take(maxLength - 1) + "\u2026"

    private companion object {
        const val PREVIEW_LENGTH = 60
    }
}
