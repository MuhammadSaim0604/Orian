package com.mobileautomation.screen

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log

/**
 * A foreground service that exists so `MediaProjection` can be created at all.
 *
 * **From API 34 this is mandatory, not an optimisation.** `getMediaProjection` throws
 * `SecurityException: Media projections require a foreground service of type
 * ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION` unless such a service is **already in the
 * foreground** when the call is made. Without it the user grants screen recording, the call fails, and the
 * app reports the capability as off with nothing to indicate their consent was accepted and discarded.
 *
 * Separate from `AutomationForegroundService`, which is `specialUse`. A service declares **one** foreground
 * type, and the two are genuinely different claims: one says "an automation is driving the phone", the
 * other says "the screen is being recorded". Android also shows its own recording indicator for the
 * projection type, a privacy affordance that should not be conflated with automation status.
 *
 * ## Starting it is asynchronous, and that is the whole difficulty
 *
 * `startForegroundService` only *posts* `onStartCommand` to the **main thread**. A caller that starts the
 * service and then waits for it on that same thread deadlocks itself: the message cannot be delivered
 * until the caller returns.
 *
 * This is not hypothetical - it shipped. A first version polled `getMediaProjection` with
 * `Thread.sleep` between attempts, from `onActivityResult`, which runs on the main thread. Every attempt
 * failed because the service was still queued behind the sleeping loop; the service then started as soon
 * as the loop finished, the failure path stopped it immediately, and Android killed the process with
 * `ForegroundServiceDidNotStartInTimeException`.
 *
 * So the service **reports when it is ready** instead. [start] takes a callback, invoked once the service
 * is genuinely in the foreground and the projection can be created - or with `false` if it never gets
 * there. Nothing blocks, and nothing guesses at a duration.
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

        val entered =
            runCatching {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(
                        NOTIFICATION_ID,
                        buildNotification(),
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION,
                    )
                } else {
                    startForeground(NOTIFICATION_ID, buildNotification())
                }
                true
            }.getOrElse { error ->
                // Notifications disabled, or the OEM refused the type. Reported rather than thrown: the
                // caller degrades to structure-only perception, and a crash here would take down an app
                // whose user merely turned notifications off.
                Log.e(TAG, "Could not enter the foreground; screen capture will be unavailable", error)
                false
            }

        if (entered) {
            Log.i(TAG, "Screen capture service in foreground; MediaProjection can now be created")
            markRunning()
        } else {
            notifyWaiters(false)
            stopSelf()
        }

        // NOT_STICKY: the projection token dies with the process, so a restarted service would hold a
        // notification claiming the screen is being recorded when no session exists.
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        markStopped()
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
         * How long to wait for the service to reach the foreground before giving up.
         *
         * Generous, because the cost of being wrong is asymmetric: too short means telling a user their
         * grant failed when it was merely slow, while too long only delays a message on a path that has
         * already failed. Well inside Android's own start timeout.
         */
        private const val START_TIMEOUT_MS = 3_000L

        @Volatile
        private var inForeground: Boolean = false

        /** Callbacks awaiting the foreground transition. Guarded by itself. */
        private val waiting = mutableListOf<(Boolean) -> Unit>()

        private val mainHandler by lazy { Handler(Looper.getMainLooper()) }

        /** Whether a capture notification is currently showing, for callers that need to know. */
        val isInForeground: Boolean get() = inForeground

        /**
         * Starts the service and calls [onReady] once it is genuinely in the foreground.
         *
         * **Never blocks.** `onStartCommand` is delivered on the main thread, so a caller that waited
         * there would prevent the very thing it was waiting for - which is exactly the bug this shape
         * exists to avoid.
         *
         * [onReady] is called exactly once, on the main thread, with whether the projection may now be
         * created. Already-running is answered immediately.
         */
        fun start(
            context: Context,
            onReady: (Boolean) -> Unit,
        ) {
            if (inForeground) {
                onReady(true)
                return
            }

            synchronized(waiting) { waiting.add(onReady) }

            val requested =
                runCatching {
                    context.startForegroundService(Intent(context, ScreenCaptureService::class.java))
                    true
                }.getOrElse { error ->
                    Log.e(TAG, "Could not start the screen capture service", error)
                    false
                }

            if (!requested) {
                notifyWaiters(false)
                return
            }

            // A backstop, not the normal path: if the service never reports in, the caller must still get
            // an answer rather than a promise that never settles.
            mainHandler.postDelayed({
                if (!inForeground) {
                    Log.w(TAG, "Screen capture service did not reach the foreground in time")
                    notifyWaiters(false)
                }
            }, START_TIMEOUT_MS)
        }

        /**
         * Stops the service.
         *
         * **Only call this once the service has actually started.** Stopping a start that is still queued
         * leaves Android's `startForegroundService` contract unsatisfied, and it kills the process with
         * `ForegroundServiceDidNotStartInTimeException` - which is how the first version of this crashed.
         */
        fun stop(context: Context) {
            runCatching { context.stopService(Intent(context, ScreenCaptureService::class.java)) }
                .onFailure { Log.w(TAG, "Could not stop the screen capture service", it) }
        }

        private fun markRunning() {
            inForeground = true
            notifyWaiters(true)
        }

        private fun markStopped() {
            inForeground = false
            // Anything still waiting will never be satisfied by this start, so it is told now rather than
            // left for the timeout.
            notifyWaiters(false)
        }

        private fun notifyWaiters(ready: Boolean) {
            val callbacks =
                synchronized(waiting) {
                    if (waiting.isEmpty()) return
                    waiting.toList().also { waiting.clear() }
                }

            // Drained before invoking, so a callback that starts or stops the service cannot re-enter and
            // see a list it is in the middle of.
            callbacks.forEach { callback ->
                runCatching { callback(ready) }
                    .onFailure { Log.e(TAG, "A screen capture readiness callback threw", it) }
            }
        }
    }
}
