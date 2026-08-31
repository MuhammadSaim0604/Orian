package com.mobileautomation.tools.android

import android.content.Context
import android.content.Intent
import android.os.Build
import android.telecom.TelecomManager
import android.util.Log
import com.mobileautomation.tools.PermissionGate
import com.mobileautomation.tools.PhoneTool
import com.mobileautomation.tools.SensitiveCapability

/**
 * [PhoneTool] backed by `ACTION_CALL` and `TelecomManager`.
 *
 * Two ways to start a call, and the difference is consent rather than implementation:
 *
 * - `ACTION_CALL` with `CALL_PHONE` **dials immediately**, which is what "call Mum" asks for.
 * - `ACTION_DIAL` needs no permission and opens the dialer pre-filled, waiting for a tap.
 *
 * [placeCall] does the first; [openDialer] is the honest degradation when the user has not granted it,
 * rather than reporting the task impossible.
 *
 * Ending a call needs `TelecomManager.endCall`, which exists from API 28. Below that the only route was
 * reflection into a private `ITelephony` interface — omitted deliberately: it breaks on vendor ROMs and
 * fails silently, which is worse than a tool that says it cannot do this here.
 */
class AndroidPhoneTool(
    private val context: Context,
    private val permissionGate: PermissionGate,
) : PhoneTool {
    private val telecomManager: TelecomManager?
        get() = context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager

    override fun placeCall(phoneNumber: String): Boolean {
        permissionGate.requireGranted(SensitiveCapability.PHONE)

        val number = phoneNumber.trim()
        require(number.isNotBlank()) { "phone number cannot be blank" }

        val intent =
            Intent(Intent.ACTION_CALL, telUri(number)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

        return start(intent, "place a call")
    }

    override fun openDialer(phoneNumber: String): Boolean {
        val number = phoneNumber.trim()
        require(number.isNotBlank()) { "phone number cannot be blank" }

        val intent =
            Intent(Intent.ACTION_DIAL, telUri(number)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

        return start(intent, "open the dialer")
    }

    override fun endCall(): Boolean {
        permissionGate.requireGranted(SensitiveCapability.PHONE)

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            Log.w(TAG, "endCall needs API 28; refusing rather than reflecting into a private API")
            return false
        }

        val manager = telecomManager ?: return false

        return runCatching {
            @Suppress("MissingPermission")
            manager.endCall()
        }.getOrElse { error ->
            Log.e(TAG, "Could not end the call", error)
            false
        }
    }

    /**
     * Whether a call is in progress.
     *
     * `TelecomManager.isInCall` rather than `TelephonyManager.callState`, which is deprecated from API 31
     * and whose replacement needs a registered listener — a callback lifetime this tool has no business
     * owning for a question asked once before dialling.
     */
    override val isCallInProgress: Boolean
        get() =
            runCatching {
                @Suppress("MissingPermission")
                telecomManager?.isInCall == true
            }.getOrDefault(false)

    private fun start(
        intent: Intent,
        what: String,
    ): Boolean =
        runCatching {
            if (intent.resolveActivity(context.packageManager) == null) {
                // A tablet with no dialer is an ordinary device, not an error state.
                Log.w(TAG, "Nothing on this device can $what")
                return false
            }

            context.startActivity(intent)
            true
        }.getOrElse { error ->
            Log.e(TAG, "Failed to $what", error)
            false
        }

    private companion object {
        const val TAG = "AndroidPhoneTool"
    }
}
