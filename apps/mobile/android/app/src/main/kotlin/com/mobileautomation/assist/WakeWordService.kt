package com.mobileautomation.assist

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import com.mobileautomation.assistant.AutomationVoiceInteractionService

/**
 * "Hey Orion" — the wake word.
 *
 * ## Why this is a foreground service holding a recogniser, and not `AlwaysOnHotwordDetector`
 *
 * `AlwaysOnHotwordDetector` is the right answer and it is unavailable. It runs on the device's DSP for almost no
 * battery, and it is offered *only* to the current assistant — a genuine reason to hold the role. But the keyphrase
 * must be **enrolled by the vendor**, and no vendor enrols "Hey Orion". Every device reports the phrase as
 * unenrolled, so building on it would ship a feature that works nowhere.
 *
 * What is left is honest but expensive: keep a recogniser listening and look for the phrase in what comes back.
 * That is why this is **opt-in, off by default, and says what it costs**. A wake word that quietly drained a
 * battery would be worse than no wake word.
 *
 * ## Why a foreground service
 *
 * Two reasons, and the second is the binding one:
 *
 * - Android kills background microphone use, and from API 31 a background service cannot open the mic at all.
 * - **The user must be able to see that the microphone is in use.** An app listening continuously with nothing on
 *   screen to say so is indistinguishable from spyware. The notification is not a technical requirement we work
 *   around; it is the feature being honest.
 *
 * ## Why it restarts itself constantly
 *
 * `SpeechRecognizer` is built for one utterance. It ends after a pause, on silence, or on an error, so continuous
 * listening means restarting it every few seconds. That is wasteful and it is the only option: the streaming APIs
 * are either vendor-specific or need a model we would have to bundle and keep updated.
 *
 * A **backoff** applies after repeated errors, because a device where recognition always fails — no network on a
 * network-only recogniser, for instance — would otherwise spin at full rate forever.
 */
class WakeWordService : Service() {
    private val main = Handler(Looper.getMainLooper())

    private var recognizer: SpeechRecognizer? = null

    /** Consecutive failures, for the backoff. Reset by any successful result. */
    private var failures = 0

    /** Set while stopping, so a listener callback cannot restart the loop after `onDestroy`. */
    @Volatile
    private var stopping = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        running = true
    }

    override fun onStartCommand(
        intent: Intent?,
        flags: Int,
        startId: Int,
    ): Int {
        startForeground(NOTIFICATION_ID, buildNotification())

        if (recognizer == null) main.post { listenAgain(0L) }

        // START_STICKY: if the system kills us for memory, the user asked for a wake word and would expect it back.
        // The notification makes the restart visible, so this cannot resurrect silently.
        return START_STICKY
    }

    override fun onDestroy() {
        stopping = true
        running = false
        main.removeCallbacksAndMessages(null)
        destroyRecognizer()
        super.onDestroy()
    }

    private fun destroyRecognizer() {
        recognizer?.let { active ->
            runCatching { active.cancel() }
            runCatching { active.destroy() }
        }
        recognizer = null
    }

    /**
     * Starts one listening pass, after [delayMs].
     *
     * A fresh recogniser each time rather than reusing one: a recogniser that has delivered a result or an error is
     * finished, and calling `startListening` on it again fails silently on several devices — the worst failure mode
     * available, since the notification would still claim to be listening.
     */
    private fun listenAgain(delayMs: Long) {
        if (stopping) return

        main.postDelayed({
            if (stopping) return@postDelayed

            destroyRecognizer()

            val created =
                runCatching { SpeechRecognizer.createSpeechRecognizer(this) }.getOrNull()
                    ?: run {
                        Log.w(TAG, "No recogniser available; stopping")
                        stopSelf()
                        return@postDelayed
                    }

            created.setRecognitionListener(listener)
            recognizer = created

            runCatching {
                created.startListening(
                    Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                        putExtra(
                            RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                            RecognizerIntent.LANGUAGE_MODEL_FREE_FORM,
                        )
                        // Partial results matter here for latency, not display: the phrase is usually recognised
                        // before the utterance is finished, and waiting for the final result adds a second of delay
                        // to every summoning.
                        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                        putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
                        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                    },
                )
            }.onFailure { error ->
                Log.w(TAG, "Could not start listening", error)
                scheduleRetry()
            }
        }, delayMs)
    }

    /**
     * Backs off after failures.
     *
     * A device with a network-only recogniser and no connection fails every single pass. Without a backoff the
     * service would restart a recogniser several times a second for as long as the user left the feature on.
     */
    private fun scheduleRetry() {
        val delay = minOf(BASE_RETRY_MS * (1L shl minOf(failures, MAX_BACKOFF_SHIFT)), MAX_RETRY_MS)
        listenAgain(delay)
    }

    private val listener =
        object : RecognitionListener {
            override fun onPartialResults(partialResults: Bundle?) {
                if (matchesWakeWord(partialResults)) trigger()
            }

            override fun onResults(results: Bundle?) {
                failures = 0

                if (matchesWakeWord(results)) {
                    trigger()
                } else {
                    // Heard speech that was not the phrase. Immediate restart, since the user may be about to say it.
                    listenAgain(QUIET_RESTART_MS)
                }
            }

            override fun onError(error: Int) {
                // No-match and timeout are the normal state of a recogniser listening to a quiet room, not failures.
                // Counting them would drive the backoff to its ceiling within a minute of silence and the wake word
                // would stop responding.
                val benign =
                    error == SpeechRecognizer.ERROR_NO_MATCH ||
                        error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT

                if (benign) {
                    failures = 0
                    listenAgain(QUIET_RESTART_MS)
                    return
                }

                if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                    // The user revoked the microphone while this was running. Nothing to retry.
                    Log.i(TAG, "Microphone permission withdrawn; stopping")
                    stopSelf()
                    return
                }

                failures += 1
                scheduleRetry()
            }

            override fun onReadyForSpeech(params: Bundle?) = Unit

            override fun onBeginningOfSpeech() = Unit

            override fun onRmsChanged(rmsdB: Float) = Unit

            override fun onBufferReceived(buffer: ByteArray?) = Unit

            override fun onEndOfSpeech() = Unit

            override fun onEvent(
                eventType: Int,
                params: Bundle?,
            ) = Unit
        }

    /**
     * Whether the phrase was heard.
     *
     * Deliberately loose. Recognisers mishear a name they have never seen — "Hey Orion" comes back as "Hey Ryan",
     * "A Orion", "Hey O'Brien" — so an exact match would make the feature feel broken. Several spellings are
     * accepted, and the cost of a false positive is a panel the user closes rather than anything happening to their
     * phone.
     */
    private fun matchesWakeWord(bundle: Bundle?): Boolean {
        val heard =
            bundle
                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?.map { it.lowercase() }
                ?: return false

        return heard.any { text -> WAKE_PHRASES.any(text::contains) }
    }

    /**
     * Opens the panel.
     *
     * Through `AutomationVoiceInteractionService.requestAssist`, which is the only supported route: an activity
     * cannot open an assist session, and launching the app instead would put the panel in our own window rather than
     * over whatever the user is looking at — which is the entire point of the feature.
     *
     * Listening stops for a moment afterwards, because the panel is about to use the microphone itself and two
     * recognisers cannot share it.
     */
    private fun trigger() {
        destroyRecognizer()

        val shown = AutomationVoiceInteractionService.requestAssist()

        if (!shown) {
            // No longer the default assistant. The wake word cannot do its job, and continuing to listen would be
            // burning battery for nothing.
            Log.i(TAG, "Not the active assistant; stopping the wake word")
            stopSelf()
            return
        }

        listenAgain(AFTER_TRIGGER_MS)
    }

    /**
     * The notification.
     *
     * Low importance and silent, but never absent. It is the only thing that tells a user their microphone is open,
     * and tapping it goes to settings so turning the feature off is one step from noticing it.
     */
    private fun buildNotification(): Notification {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW)
                    .apply {
                        description = "Shown while Orion is listening for its wake word."
                        setShowBadge(false)
                    },
            )
        }

        val open =
            PendingIntent.getActivity(
                this,
                0,
                Intent().setClassName(packageName, "$packageName.MainActivity"),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Listening for “Hey Orion”")
            .setContentText("Tap to turn this off")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(open)
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val TAG = "OrionWakeWord"

        private const val CHANNEL_ID = "orion_wake_word"
        private const val CHANNEL_NAME = "Wake word"
        private const val NOTIFICATION_ID = 4711

        /**
         * Whether the service is up.
         *
         * A static flag rather than asking `ActivityManager`, which needs a permission we do not hold and reports
         * stale information. Set in `onCreate` and cleared in `onDestroy`, so it follows the real lifecycle
         * including a system kill.
         */
        @Volatile
        var running: Boolean = false
            private set

        /**
         * Spellings that count as the wake word.
         *
         * Lowercase, and checked with `contains` so surrounding words do not matter. "orion" alone is deliberately
         * absent — it appears in ordinary speech and in this app's own name, and a wake word that fires while
         * someone discusses the app would be unusable.
         */
        private val WAKE_PHRASES =
            listOf(
                "hey orion",
                "hey oreo",
                "hey ryan",
                "hey o'ryan",
                "hey orian",
                "hi orion",
                "ok orion",
                "hey aurion",
                "hey aryan",
            )

        /** After a non-match or a quiet timeout. Short: the user may be mid-phrase. */
        private const val QUIET_RESTART_MS = 250L

        /** After opening the panel, which is about to use the microphone itself. */
        private const val AFTER_TRIGGER_MS = 3_000L

        private const val BASE_RETRY_MS = 1_000L

        private const val MAX_RETRY_MS = 60_000L

        /** Caps the doubling at about 32 seconds before `MAX_RETRY_MS` takes over. */
        private const val MAX_BACKOFF_SHIFT = 5

        fun start(context: Context) {
            val intent = Intent(context, WakeWordService::class.java)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, WakeWordService::class.java))
        }
    }
}
