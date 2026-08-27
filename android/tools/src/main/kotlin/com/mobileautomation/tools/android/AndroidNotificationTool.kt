package com.mobileautomation.tools.android

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.util.Log
import com.mobileautomation.tools.NotificationTool
import com.mobileautomation.tools.PermissionGate
import com.mobileautomation.tools.SensitiveCapability

/**
 * Posts notifications through `NotificationManager`.
 *
 * Gated on the notification permission because from API 33 posting without it
 * silently does nothing - the notification is dropped and no error is raised,
 * which would leave a workflow believing it had told the user something it had
 * not.
 */
class AndroidNotificationTool(
    private val context: Context,
    private val permissionGate: PermissionGate,
    private val smallIconResId: Int,
) : NotificationTool {
    private val notificationManager: NotificationManager?
        get() = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager

    override fun sendNotification(
        title: String,
        body: String,
        channelId: String,
    ): Boolean {
        if (!permissionGate.isGranted(SensitiveCapability.NOTIFICATIONS)) {
            Log.w(TAG, "Notification permission not granted; not posting")
            return false
        }

        val manager = notificationManager ?: return false

        return runCatching {
            ensureChannel(manager, channelId)

            val notification =
                android.app.Notification
                    .Builder(context, channelId)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setSmallIcon(smallIconResId)
                    .setAutoCancel(true)
                    .build()

            // Distinct id per post so results do not overwrite each other; a
            // workflow may report several outcomes.
            manager.notify(nextNotificationId(), notification)
            true
        }.getOrElse { error ->
            Log.e(TAG, "Failed to post notification", error)
            false
        }
    }

    private fun ensureChannel(
        manager: NotificationManager,
        channelId: String,
    ) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        if (manager.getNotificationChannel(channelId) != null) return

        manager.createNotificationChannel(
            NotificationChannel(
                channelId,
                CHANNEL_NAME,
                // Default rather than high: automation results are informative,
                // and heads-up notifications interrupting the user mid-task would
                // be worse than a quiet entry in the shade.
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply { description = CHANNEL_DESCRIPTION },
        )
    }

    private fun nextNotificationId(): Int = (System.currentTimeMillis() % Int.MAX_VALUE).toInt()

    private companion object {
        const val TAG = "AndroidNotificationTool"
        const val CHANNEL_NAME = "Automation results"
        const val CHANNEL_DESCRIPTION = "Results and messages from your automations"
    }
}
