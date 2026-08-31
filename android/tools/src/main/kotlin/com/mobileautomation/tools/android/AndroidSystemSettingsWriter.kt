package com.mobileautomation.tools.android

import android.content.Context
import android.media.AudioManager
import android.provider.Settings
import android.util.Log
import com.mobileautomation.tools.PermissionGate
import com.mobileautomation.tools.RingerMode
import com.mobileautomation.tools.RingerTool
import com.mobileautomation.tools.SensitiveCapability
import com.mobileautomation.tools.SystemSettingsWriter

/**
 * [SystemSettingsWriter] over `Settings.System`.
 *
 * **The writable set is an allowlist**, and that is the important design decision here. `Settings.System`
 * holds keys that make parts of the device unusable when written badly — and the caller is a model
 * inferring a key name from a sentence like "make the screen dimmer". It has no way to know which keys are
 * safe, so it is not asked to.
 *
 * The four allowed keys are the ones a person actually asks for and can undo from the Settings app if the
 * agent gets it wrong. Anything else is refused with the list, so the model can pick a real key rather than
 * retrying variations of the same guess.
 */
class AndroidSystemSettingsWriter(
    private val context: Context,
    private val permissionGate: PermissionGate,
) : SystemSettingsWriter {
    override fun putSystemSetting(
        key: String,
        value: String,
    ): Boolean {
        permissionGate.requireGranted(SensitiveCapability.WRITE_SETTINGS)

        val trimmed = key.trim()

        require(trimmed in WRITABLE_KEYS) {
            "$trimmed is not a writable setting; this tool writes ${WRITABLE_KEYS.joinToString()}"
        }

        return runCatching {
            // Numeric keys are stored as integers, and writing "128" as a string leaves a value the
            // platform reads back as zero on some builds — a dimmed screen the user then cannot brighten
            // from the same tool.
            if (trimmed in INTEGER_KEYS) {
                val number =
                    value.trim().toIntOrNull()
                        ?: throw IllegalArgumentException("$trimmed needs a whole number, got \"$value\"")

                Settings.System.putInt(context.contentResolver, trimmed, number)
            } else {
                Settings.System.putString(context.contentResolver, trimmed, value)
            }
        }.getOrElse { error ->
            Log.e(TAG, "Could not write setting $trimmed", error)
            false
        }
    }

    override fun writableKeys(): List<String> = WRITABLE_KEYS.toList()

    private companion object {
        const val TAG = "AndroidSettingsWriter"

        /**
         * Settings this tool will change.
         *
         * Brightness and its mode go together: setting a brightness value while automatic mode is on is
         * immediately overridden by the light sensor, so a task that only set the value would appear to do
         * nothing. Screen timeout and accelerometer rotation are the other two people ask for by name.
         */
        val WRITABLE_KEYS =
            setOf(
                Settings.System.SCREEN_BRIGHTNESS,
                Settings.System.SCREEN_BRIGHTNESS_MODE,
                Settings.System.SCREEN_OFF_TIMEOUT,
                Settings.System.ACCELEROMETER_ROTATION,
            )

        /** All four happen to be integers, but naming them keeps the coercion explicit. */
        val INTEGER_KEYS = WRITABLE_KEYS
    }
}

/**
 * [RingerTool] over `AudioManager`.
 *
 * The permission check is the point. `setRingerMode` succeeds for `NORMAL` without any grant but throws
 * `SecurityException` for silent and vibrate unless the app holds Do Not Disturb policy access — so a tool
 * that did not check would work for one value and crash for the other two, which reads as a broken tool
 * rather than a missing permission.
 *
 * Putting the phone *back* to normal deliberately needs nothing, because that should never be the call that
 * fails.
 */
class AndroidRingerTool(
    private val context: Context,
    private val permissionGate: PermissionGate,
) : RingerTool {
    private val audioManager: AudioManager?
        get() = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

    override fun setRingerMode(mode: RingerMode): Boolean {
        if (mode.requiresPolicyAccess) {
            permissionGate.requireGranted(SensitiveCapability.DO_NOT_DISTURB)
        }

        val manager = audioManager ?: return false

        return runCatching {
            manager.ringerMode = mode.toPlatform()
            true
        }.getOrElse { error ->
            Log.e(TAG, "Could not set the ringer to ${mode.wireName}", error)
            false
        }
    }

    override fun currentRingerMode(): RingerMode? =
        runCatching {
            when (audioManager?.ringerMode) {
                AudioManager.RINGER_MODE_NORMAL -> RingerMode.NORMAL
                AudioManager.RINGER_MODE_VIBRATE -> RingerMode.VIBRATE
                AudioManager.RINGER_MODE_SILENT -> RingerMode.SILENT
                else -> null
            }
        }.getOrNull()

    private fun RingerMode.toPlatform(): Int =
        when (this) {
            RingerMode.NORMAL -> AudioManager.RINGER_MODE_NORMAL
            RingerMode.VIBRATE -> AudioManager.RINGER_MODE_VIBRATE
            RingerMode.SILENT -> AudioManager.RINGER_MODE_SILENT
        }

    private companion object {
        const val TAG = "AndroidRingerTool"
    }
}
