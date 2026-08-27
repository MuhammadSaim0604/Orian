package com.mobileautomation.tools.android

import android.content.Context
import android.media.AudioManager
import android.os.SystemClock
import android.util.Log
import android.view.KeyEvent
import com.mobileautomation.tools.MediaCommand
import com.mobileautomation.tools.MediaTool
import com.mobileautomation.tools.VolumeDirection

/**
 * [MediaTool] backed by `AudioManager`.
 *
 * Commands are dispatched as media key events rather than through
 * `MediaController`, because controlling a session directly requires
 * notification-listener access - a sensitive grant this tool deliberately avoids.
 * Key events are routed by the system to whichever app owns the active session,
 * which is also the behaviour the user expects.
 *
 * A key event is a *pair*: down then up. Sending only the down event leaves some
 * players in a stuck state, so both are always sent.
 */
class AndroidMediaTool(
    private val context: Context,
) : MediaTool {
    private val audioManager: AudioManager?
        get() = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

    override val isAnythingPlaying: Boolean
        get() = audioManager?.isMusicActive == true

    override fun control(command: MediaCommand): Boolean {
        val manager = audioManager ?: return false

        return runCatching {
            val eventTime = SystemClock.uptimeMillis()
            manager.dispatchMediaKeyEvent(
                KeyEvent(eventTime, eventTime, KeyEvent.ACTION_DOWN, command.keyCode, 0),
            )
            manager.dispatchMediaKeyEvent(
                KeyEvent(eventTime, eventTime, KeyEvent.ACTION_UP, command.keyCode, 0),
            )
            true
        }.getOrElse { error ->
            Log.e(TAG, "Failed to dispatch ${command.name}", error)
            false
        }
    }

    override fun adjustVolume(direction: VolumeDirection): Boolean {
        val manager = audioManager ?: return false

        return runCatching {
            manager.adjustStreamVolume(
                AudioManager.STREAM_MUSIC,
                direction.platformDirection,
                // Show the volume UI: the user should see that something changed
                // their volume rather than have it move silently.
                AudioManager.FLAG_SHOW_UI,
            )
            true
        }.getOrElse { error ->
            Log.e(TAG, "Failed to adjust volume ${direction.name}", error)
            false
        }
    }

    private companion object {
        const val TAG = "AndroidMediaTool"
    }
}
