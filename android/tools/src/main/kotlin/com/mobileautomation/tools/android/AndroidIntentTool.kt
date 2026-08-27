package com.mobileautomation.tools.android

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.util.Log
import com.mobileautomation.tools.IntentRequest
import com.mobileautomation.tools.IntentTool
import com.mobileautomation.tools.SystemSettingsReader

/**
 * Launches intents described by [IntentRequest].
 *
 * The intent is built here rather than accepted pre-built, so every launch goes
 * through one reviewable path. Nothing is dispatched without first checking that
 * something on the device can handle it: an unresolved intent throws
 * `ActivityNotFoundException`, which mid-workflow is an avoidable crash.
 */
class AndroidIntentTool(
    private val context: Context,
) : IntentTool {
    override fun launchIntent(request: IntentRequest): Boolean {
        val intent =
            Intent(request.action).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                request.dataUri?.let { data = Uri.parse(it) }
                request.packageName?.let { setPackage(it) }
                for ((key, value) in request.extras) {
                    putExtra(key, value)
                }
            }

        return runCatching {
            if (intent.resolveActivity(context.packageManager) == null) {
                Log.w(TAG, "No activity handles ${request.action}")
                return false
            }

            val toStart =
                if (request.requireChooser) {
                    Intent.createChooser(intent, null).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                } else {
                    intent
                }

            context.startActivity(toStart)
            true
        }.getOrElse { error ->
            Log.e(TAG, "Failed to launch ${request.action}", error)
            false
        }
    }

    private companion object {
        const val TAG = "AndroidIntentTool"
    }
}

/**
 * Reads system settings through `Settings.Global` and `Settings.System`.
 *
 * Read-only: writing these requires privileges a normal app cannot obtain, and
 * silently changing device configuration would be a far larger trust problem than
 * reading it.
 */
class AndroidSystemSettingsReader(
    private val context: Context,
) : SystemSettingsReader {
    override fun getSystemSetting(key: String): String? {
        require(key.isNotBlank()) { "setting key cannot be blank" }

        // Global first, then System: the same name can exist in both namespaces,
        // and Global is authoritative for device-wide values.
        return runCatching {
            Settings.Global.getString(context.contentResolver, key)
                ?: Settings.System.getString(context.contentResolver, key)
        }.getOrElse { error ->
            Log.w(TAG, "Could not read setting $key", error)
            null
        }
    }

    override fun isAirplaneModeOn(): Boolean =
        runCatching {
            Settings.Global.getInt(context.contentResolver, Settings.Global.AIRPLANE_MODE_ON, 0) != 0
        }.getOrDefault(false)

    override fun screenBrightness(): Int? =
        runCatching {
            Settings.System.getInt(context.contentResolver, Settings.System.SCREEN_BRIGHTNESS)
        }.getOrNull()

    private companion object {
        const val TAG = "AndroidSettingsReader"
    }
}
