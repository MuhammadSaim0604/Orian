package com.mobileautomation.automation.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log

/**
 * Keeps automation running while the user is in another app.
 *
 * Android aggressively suspends background work, and automation by definition
 * happens while the user's app is not in the foreground - so without a foreground
 * service a workflow would be killed part-way through, which is worse than not
 * starting it.
 *
 * The persistent notification is not optional and is not something to minimise:
 * the user must be able to see that automation is running and stop it. The
 * notification therefore always carries a stop action.
 */
class AutomationForegroundService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(
        intent: Intent?,
        flags: Int,
        startId: Int,
    ): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                Log.i(TAG, "Stop requested by the user")
                stopSelf()
                return START_NOT_STICKY
            }

            else -> {
                val label = intent?.getStringExtra(EXTRA_STATUS_LABEL) ?: DEFAULT_STATUS
                startForeground(NOTIFICATION_ID, buildNotification(label))
            }
        }

        // NOT_STICKY: if the system kills this service, silently restarting it
        // would resume automation the user cannot see the origin of. A new run
        // must be started deliberately.
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        Log.i(TAG, "Automation service stopped")
        super.onDestroy()
    }

    private fun buildNotification(status: String): Notification {
        ensureChannel()

        val stopIntent =
            PendingIntent.getService(
                this,
                REQUEST_STOP,
                Intent(this, AutomationForegroundService::class.java).setAction(ACTION_STOP),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        return Notification
            .Builder(this, CHANNEL_ID)
            .setContentTitle(NOTIFICATION_TITLE)
            .setContentText(status)
            .setSmallIcon(android.R.drawable.ic_media_play)
            // Ongoing and non-dismissible: the user should not be able to lose
            // sight of the fact that something is driving their phone.
            .setOngoing(true)
            .addAction(
                Notification.Action
                    .Builder(null, STOP_ACTION_LABEL, stopIntent)
                    .build(),
            ).build()
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return

        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                // LOW keeps it silent but still visible: this notification is a
                // transparency requirement, not an alert.
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = CHANNEL_DESCRIPTION
                setShowBadge(false)
            },
        )
    }

    companion object {
        const val CHANNEL_ID = "automation_running"
        const val ACTION_STOP = "com.mobileautomation.action.STOP_AUTOMATION"
        const val EXTRA_STATUS_LABEL = "status_label"

        private const val TAG = "AutomationService"
        private const val NOTIFICATION_ID = 1001
        private const val REQUEST_STOP = 1
        private const val CHANNEL_NAME = "Automation running"
        private const val CHANNEL_DESCRIPTION =
            "Shown while an automation or AI task is controlling your phone"
        private const val NOTIFICATION_TITLE = "Mobile Automation is running"
        private const val DEFAULT_STATUS = "Running an automation"
        private const val STOP_ACTION_LABEL = "Stop"

        /** Starts the service with an optional status line for the notification. */
        fun start(
            context: Context,
            statusLabel: String? = null,
        ) {
            val intent =
                Intent(context, AutomationForegroundService::class.java).apply {
                    statusLabel?.let { putExtra(EXTRA_STATUS_LABEL, it) }
                }
            context.startForegroundService(intent)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, AutomationForegroundService::class.java))
        }
    }
}
