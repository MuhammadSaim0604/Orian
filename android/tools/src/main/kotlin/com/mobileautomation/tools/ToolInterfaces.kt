package com.mobileautomation.tools

import com.mobileautomation.tools.model.AlarmRequest
import com.mobileautomation.tools.model.Contact
import com.mobileautomation.tools.model.CurrentScreen
import com.mobileautomation.tools.model.InstalledApp

/**
 * Launches apps and reports what is installed or in the foreground.
 */
interface AppManager {
    /**
     * Launches [packageName]. Returns false when the app is missing or exposes no
     * launchable activity - some system packages do not.
     */
    fun openApp(packageName: String): Boolean

    /**
     * Launches whichever installed app best matches [query] by label.
     *
     * Exists because AI goals name apps the way people do ("open WhatsApp"), not
     * by package. Returns the app that was launched, or null when nothing matched.
     */
    fun openAppByName(query: String): InstalledApp?

    /** Installed apps. [includeSystem] is false by default: system packages are
     *  noise in a picker and rarely useful automation targets. */
    fun listApps(includeSystem: Boolean = false): List<InstalledApp>

    fun findApps(query: String): List<InstalledApp>

    fun currentScreen(): CurrentScreen
}

/**
 * Reads contacts.
 *
 * Read-only by design: automation resolves a name to a number, and nothing in the
 * product needs to modify the user's address book.
 */
interface ContactsReader {
    /** Requires [SensitiveCapability.CONTACTS]. */
    fun getContacts(limit: Int = DEFAULT_CONTACT_LIMIT): List<Contact>

    /** Contacts matching [query] by name or number. Requires the same permission. */
    fun findContacts(
        query: String,
        limit: Int = DEFAULT_CONTACT_LIMIT,
    ): List<Contact>

    companion object {
        /**
         * Address books can hold thousands of entries; an unbounded read would
         * stall the caller and blow the model's context if handed to the AI.
         */
        const val DEFAULT_CONTACT_LIMIT: Int = 200
    }
}

/**
 * Reads and writes the clipboard.
 *
 * The clipboard often holds passwords and one-time codes, so reads are treated as
 * sensitive even though Android grants no specific permission for them.
 */
interface ClipboardTool {
    fun readClipboard(): String?

    fun writeClipboard(text: String): Boolean

    fun clearClipboard()
}

/** Creates alarms through the system clock app. */
interface AlarmTool {
    /** Requires [SensitiveCapability.EXACT_ALARM] for a silent set. */
    fun createAlarm(request: AlarmRequest): Boolean
}

/** Posts notifications from automation. */
interface NotificationTool {
    /** Requires [SensitiveCapability.NOTIFICATIONS] on API 33+. */
    fun sendNotification(
        title: String,
        body: String,
        channelId: String = DEFAULT_CHANNEL_ID,
    ): Boolean

    companion object {
        const val DEFAULT_CHANNEL_ID: String = "automation_results"
    }
}

/**
 * Launches arbitrary intents.
 *
 * The most powerful tool in this module and the one most in need of care: an
 * intent can start any exported component on the device. Callers pass a
 * [IntentRequest] rather than a raw `Intent` so the surface stays inspectable and
 * can be validated before dispatch.
 */
interface IntentTool {
    fun launchIntent(request: IntentRequest): Boolean
}

/**
 * A described intent.
 *
 * Kept free of Android types so it can be validated, logged, and serialized into
 * an execution trace.
 */
data class IntentRequest(
    val action: String,
    val dataUri: String? = null,
    val packageName: String? = null,
    val extras: Map<String, String> = emptyMap(),
    /** Ask the system to show a chooser rather than resolving silently. */
    val requireChooser: Boolean = false,
) {
    init {
        require(action.isNotBlank()) { "intent action cannot be blank" }
    }
}

/**
 * Reads system settings.
 *
 * Read-only: writing system settings needs privileges a normal app cannot hold,
 * and an app that could silently change device configuration would be a far
 * bigger trust problem than one that reads it.
 */
interface SystemSettingsReader {
    fun getSystemSetting(key: String): String?

    fun isAirplaneModeOn(): Boolean

    /** Screen brightness 0-255, or null when unreadable. */
    fun screenBrightness(): Int?
}
