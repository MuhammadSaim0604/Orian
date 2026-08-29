package com.mobileautomation.screen

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log

/**
 * A foreground service that exists so `MediaProjection` can be created at all.
 *
 * **From API 34 this is mandatory, not an optimisation.** `getMediaProjection` throws
 * `SecurityException: Media projections require a foreground service of type
 * ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION` unless such a service is **already running** at
 * the moment of the call. Device testing found the consequence: the user granted screen recording in the
 * system dialog, the exception was caught, `attachScreenCapture` returned false, and the app reported
 * the capability as still off - with no way for the user to tell that their grant had been accepted and
 * then discarded.
 *
 * Separate from `AutomationForegroundService`, which is `specialUse`. A service declares **one**
 * foreground type, and the two are genuinely different claims: one says "an automation is driving the
 * phone", the other says "the screen is being recorded". Android also shows its own recording indicator
 * for the projection type, which is a privacy affordance that should not be conflated with automation
 * status.
 *
 * It runs only while a capture session is held. Screen recording is the most invasive permission in the
 * app, so the notification stays for exactly as long as the capability does.
 */
class ScreenCaptureService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(
        intent: Intent?,
        flags: Int,
        startId: Int,
    ): Int {
        ensureChannel()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                buildNotification(),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION,
            )
        } else {
            startForeground(NOTIFICATION_ID, buildNotification())
        }

        Log.i(TAG, "Screen capture service running; MediaProjection can now be created")

        // NOT_STICKY: the projection token dies with the process, so a restarted service would hold a
        // notification claiming the screen is being recorded when no session exists.
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        Log.i(TAG, "Screen capture service stopped")
        super.onDestroy()
    }

    private fun buildNotification(): Notification =
        Notification
            .Builder(this, CHANNEL_ID)
            .setContentTitle(NOTIFICATION_TITLE)
            .setContentText(NOTIFICATION_TEXT)
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setOngoing(true)
            .build()

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return

        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                // LOW: visible but silent. This is a transparency requirement, not an alert.
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = CHANNEL_DESCRIPTION
                setShowBadge(false)
            },
        )
    }

    companion object {
        const val CHANNEL_ID = "screen_capture"

        private const val TAG = "ScreenCaptureService"
        private const val NOTIFICATION_ID = 1002
        private const val CHANNEL_NAME = "Screen reading"
        private const val CHANNEL_DESCRIPTION =
            "Shown while the app can read your screen as an image"
        private const val NOTIFICATION_TITLE = "Mobile Automation can read your screen"
        private const val NOTIFICATION_TEXT =
            "Used to see screens that do not expose their content any other way"

        /**
         * Starts the service and waits for it to be in the foreground.
         *
         * **Must be called before `getMediaProjection`**, and the ordering is the entire point:
         * `startForegroundService` is asynchronous, so the caller has to give the service a moment to
         * reach the foreground before creating the projection, or the API throws exactly as it would
         * have with no service at all.
         *
         * @return whether the start was requested successfully.
         */
        fun start(context: Context): Boolean =
            runCatching {
                context.startForegroundService(Intent(context, ScreenCaptureService::class.java))
                true
            }.getOrElse { error ->
                Log.e(TAG, "Could not start the screen capture service", error)
                false
            }

        fun stop(context: Context) {
            runCatching { context.stopService(Intent(context, ScreenCaptureService::class.java)) }
        }
    }
}
