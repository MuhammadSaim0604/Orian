package com.mobileautomation.tools

import com.mobileautomation.tools.model.SmsMessage

/**
 * Sends and reads text messages.
 *
 * Sending goes through `SmsManager` rather than an intent to the user's messaging app. The distinction
 * matters for an agent: an intent opens a compose screen pre-filled and waits for a human to press send,
 * so "text Robert that I am running late" would end with a draft nobody sent. `SmsManager` sends, which is
 * what the task asked for — and is exactly why the capability is optional, requested at the moment of need,
 * and never granted silently.
 *
 * Reading is deliberately narrow: recent messages only, newest first, bounded. An unbounded read of an
 * inbox is a data-exfiltration shape rather than a tool, and the model has no use for a thousand messages.
 */
interface SmsTool {
    /**
     * Sends [body] to [phoneNumber]. Requires [SensitiveCapability.SMS].
     *
     * Returns false when the platform refused — no SIM, no telephony, or a body the carrier rejected.
     * A long message is split into parts by the platform; this reports the whole send, not each part.
     */
    fun sendSms(
        phoneNumber: String,
        body: String,
    ): Boolean

    /**
     * The most recent messages, newest first. Requires [SensitiveCapability.SMS].
     *
     * @param limit how many to read, bounded by [MAX_READ_LIMIT].
     * @param fromNumber when set, only messages involving that number.
     */
    fun readRecentSms(
        limit: Int = DEFAULT_READ_LIMIT,
        fromNumber: String? = null,
    ): List<SmsMessage>

    companion object {
        /**
         * Enough to find a verification code or the last thing someone said, few enough that the model is
         * not handed a transcript it did not ask for.
         */
        const val DEFAULT_READ_LIMIT: Int = 10

        /** A hard ceiling, so a bad argument cannot turn a tool call into an inbox dump. */
        const val MAX_READ_LIMIT: Int = 50
    }
}

/**
 * Places and ends phone calls.
 *
 * Two modes, and the difference is the user's consent rather than a technical detail:
 *
 * - **Placing a call** with `CALL_PHONE` dials immediately. That is what an agent needs, and why the
 *   capability is asked for at the moment of use with a rationale that says it dials without confirming.
 * - **Opening the dialer** needs no permission at all and waits for a tap. It is the honest fallback when
 *   the user has not granted the first, rather than reporting the task impossible.
 */
interface PhoneTool {
    /** Dials [phoneNumber] immediately. Requires [SensitiveCapability.PHONE]. */
    fun placeCall(phoneNumber: String): Boolean

    /**
     * Opens the dialer with [phoneNumber] filled in, without calling.
     *
     * No permission needed, so this is what a denied `placeCall` degrades to.
     */
    fun openDialer(phoneNumber: String): Boolean

    /**
     * Ends the call in progress. Requires [SensitiveCapability.PHONE] and API 28+.
     *
     * Returns false below API 28, where `endCall` does not exist and the only alternative was a reflection
     * hack against a private API — which is the sort of thing that stops working on a vendor ROM and fails
     * silently.
     */
    fun endCall(): Boolean

    /** Whether a call is currently in progress, so a tool can avoid dialling over one. */
    val isCallInProgress: Boolean
}

/**
 * Changes system settings.
 *
 * Separate from `SystemSettingsReader` on purpose. Reading a setting is harmless and needs nothing;
 * writing one needs a special access grant and can change how the device behaves for the user afterwards.
 * Keeping them in one interface would let a caller hold the write capability implicitly by asking for the
 * read.
 *
 * The writable set is an **allowlist**, not a passthrough. `Settings.System` holds keys that brick parts of
 * the UI when written badly, and an agent inferring a key name from a goal has no idea which those are.
 */
interface SystemSettingsWriter {
    /**
     * Writes [key] = [value]. Requires [SensitiveCapability.WRITE_SETTINGS].
     *
     * Returns false when the key is not in the allowlist or the platform refused the write.
     */
    fun putSystemSetting(
        key: String,
        value: String,
    ): Boolean

    /** Settings this tool will write, so the UI and the model can be told rather than guess. */
    fun writableKeys(): List<String>
}

/**
 * The ringer mode: normal, vibrate, or silent.
 *
 * Its own interface rather than a method on `MediaTool`, because the permission is different in kind.
 * Volume is ordinary; silencing the phone is Do Not Disturb policy access, and `setRingerMode` throws for
 * silent and vibrate without it while succeeding for normal. A tool that worked for one value and threw for
 * the other two would read as broken rather than as unpermitted.
 */
interface RingerTool {
    /**
     * Sets the ringer mode.
     *
     * Requires [SensitiveCapability.DO_NOT_DISTURB] for [RingerMode.SILENT] and [RingerMode.VIBRATE].
     * [RingerMode.NORMAL] needs nothing, which is worth preserving: putting a phone back to normal should
     * never be the call that fails.
     */
    fun setRingerMode(mode: RingerMode): Boolean

    /** The current mode, or null when it cannot be read. */
    fun currentRingerMode(): RingerMode?
}

/**
 * How the phone signals an incoming call.
 *
 * Named by intent rather than by the platform's integer constants, so the wire value in a workflow or a
 * tool call is readable and the mapping lives in one place.
 */
enum class RingerMode(val wireName: String) {
    NORMAL("normal"),
    VIBRATE("vibrate"),
    SILENT("silent"),
    ;

    /** Whether setting this mode needs Do Not Disturb access. */
    val requiresPolicyAccess: Boolean get() = this != NORMAL

    companion object {
        val names: List<String> = entries.map { it.wireName }

        fun fromName(value: String): RingerMode? = entries.firstOrNull { it.wireName.equals(value, ignoreCase = true) }
    }
}
