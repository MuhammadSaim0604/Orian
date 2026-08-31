package com.mobileautomation.tools.android

import android.content.Context
import android.net.Uri
import android.os.Build
import android.provider.Telephony
import android.telephony.SmsManager
import android.util.Log
import com.mobileautomation.tools.PermissionGate
import com.mobileautomation.tools.SensitiveCapability
import com.mobileautomation.tools.SmsTool
import com.mobileautomation.tools.model.SmsMessage

/**
 * [SmsTool] backed by `SmsManager` and the SMS content provider.
 *
 * Gated on every call rather than once at construction, like the contacts reader and for the same reason:
 * the user can revoke SMS access at any moment, and a stale check becomes a `SecurityException` in the
 * middle of a task.
 *
 * Sends through `SmsManager` rather than an `ACTION_SENDTO` intent. An intent opens a compose screen and
 * waits for a human to press send, so an agent asked to text someone would leave an unsent draft and report
 * success. That asymmetry is the whole reason this needs a dangerous permission at all.
 */
class AndroidSmsTool(
    private val context: Context,
    private val permissionGate: PermissionGate,
) : SmsTool {
    override fun sendSms(
        phoneNumber: String,
        body: String,
    ): Boolean {
        permissionGate.requireGranted(SensitiveCapability.SMS)

        val number = phoneNumber.trim()
        require(number.isNotBlank()) { "phone number cannot be blank" }
        require(body.isNotBlank()) { "message body cannot be blank" }

        val manager = smsManager() ?: return false

        return runCatching {
            // Split by the platform rather than sent whole: a body over the single-part limit is silently
            // truncated by some carriers if sent with sendTextMessage, which loses the end of the message
            // with no error anywhere.
            val parts = manager.divideMessage(body)

            if (parts.size > 1) {
                manager.sendMultipartTextMessage(number, null, parts, null, null)
            } else {
                manager.sendTextMessage(number, null, body, null, null)
            }

            true
        }.getOrElse { error ->
            Log.e(TAG, "Failed to send SMS", error)
            false
        }
    }

    override fun readRecentSms(
        limit: Int,
        fromNumber: String?,
    ): List<SmsMessage> {
        permissionGate.requireGranted(SensitiveCapability.SMS)
        require(limit > 0) { "limit must be positive, was $limit" }

        val bounded = limit.coerceAtMost(SmsTool.MAX_READ_LIMIT)

        val projection =
            arrayOf(
                Telephony.Sms.ADDRESS,
                Telephony.Sms.BODY,
                Telephony.Sms.DATE,
                Telephony.Sms.TYPE,
            )

        // Matched on the last digits rather than the whole string: a number stored as "+44 7700 900123"
        // and one typed as "07700900123" are the same number, and an exact match would find neither from
        // the other.
        val digits = fromNumber?.filter(Char::isDigit)?.takeLast(NUMBER_MATCH_DIGITS)

        val selection = if (digits.isNullOrEmpty()) null else "${Telephony.Sms.ADDRESS} LIKE ?"
        val selectionArgs = if (digits.isNullOrEmpty()) null else arrayOf("%$digits")

        return runCatching {
            val collected = mutableListOf<SmsMessage>()

            context.contentResolver
                .query(
                    Telephony.Sms.CONTENT_URI,
                    projection,
                    selection,
                    selectionArgs,
                    // Newest first, and the limit applied here so the provider does the work rather than
                    // reading an entire inbox into memory to throw most of it away.
                    "${Telephony.Sms.DATE} DESC LIMIT $bounded",
                )?.use { cursor ->
                    val addressColumn = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
                    val bodyColumn = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
                    val dateColumn = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE)
                    val typeColumn = cursor.getColumnIndexOrThrow(Telephony.Sms.TYPE)

                    while (cursor.moveToNext() && collected.size < bounded) {
                        collected.add(
                            SmsMessage(
                                address = cursor.getString(addressColumn) ?: "",
                                body = cursor.getString(bodyColumn) ?: "",
                                receivedAtEpochMs = cursor.getLong(dateColumn),
                                isOutgoing = cursor.getInt(typeColumn) == Telephony.Sms.MESSAGE_TYPE_SENT,
                            ),
                        )
                    }
                }

            collected
        }.getOrElse { error ->
            Log.e(TAG, "SMS query failed", error)
            emptyList()
        }
    }

    /**
     * The SMS manager for the default subscription.
     *
     * `getSystemService` from API 31, the deprecated static `getDefault()` below it. Both are wrapped
     * because a device with no telephony returns null or throws depending on the OEM, and a tablet is a
     * perfectly ordinary place for this tool to be unavailable.
     */
    private fun smsManager(): SmsManager? =
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                context.getSystemService(SmsManager::class.java)
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }
        }.getOrElse { error ->
            Log.w(TAG, "No SMS manager on this device", error)
            null
        }

    private companion object {
        const val TAG = "AndroidSmsTool"

        /**
         * How many trailing digits identify a number.
         *
         * Seven is enough to be unambiguous in an ordinary address book while ignoring country code and
         * formatting differences, which is what makes a stored "+44 7700 900123" match a typed
         * "07700900123".
         */
        const val NUMBER_MATCH_DIGITS = 7
    }
}

/**
 * A place to build a `tel:` URI once.
 *
 * Numbers arrive from a model or a workflow, so they carry spaces, dashes and parentheses. `Uri.parse` does
 * not mind, but the dialer does on some OEM builds — and `Uri.encode` is what stops a `#` in a number being
 * read as a fragment, which silently truncates it.
 */
internal fun telUri(phoneNumber: String): Uri = Uri.parse("tel:${Uri.encode(phoneNumber.trim())}")
