package com.mobileautomation.assist

import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.Locale

/**
 * Speech out, for the Orion Assist panel.
 *
 * ## The failure this is built to avoid
 *
 * A voice that keeps talking after the panel is dismissed is the single most irritating thing this feature could
 * do — the user has moved on and the phone is still narrating. So `stop()` is called on dismissal, on a new
 * question, and on `invalidate()`, and `QUEUE_FLUSH` is used rather than `QUEUE_ADD` so a second answer replaces
 * the first instead of queueing behind it.
 *
 * ## Initialisation is asynchronous and may fail
 *
 * `TextToSpeech` is not usable until its listener fires, and on a device with no speech data it never becomes
 * usable at all. Speaking before then is silently dropped, which is why requests that arrive early are held in
 * `pending` rather than discarded — the panel's answer usually arrives within a second of the engine starting.
 *
 * A device with no engine is a real case and not an error: the panel still shows the answer, it just does not read
 * it. `isReady` is exposed so the UI can stop offering a speaker button that would do nothing.
 */
class AssistSpeechOutModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    private val main = Handler(Looper.getMainLooper())

    @Volatile
    private var engine: TextToSpeech? = null

    @Volatile
    private var ready = false

    /** An answer that arrived before the engine did. One slot: a newer answer supersedes an older one. */
    @Volatile
    private var pending: String? = null

    override fun getName(): String = NAME

    override fun invalidate() {
        main.post {
            runCatching { engine?.stop() }
            runCatching { engine?.shutdown() }
            engine = null
            ready = false
        }
        super.invalidate()
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun isReady(): Boolean = ready

    /**
     * Prepares the engine.
     *
     * Called when the panel opens rather than at app startup, because initialising text-to-speech spins up a
     * service and loads voice data — worth paying for when the user has just summoned a voice assistant, wasteful
     * on every cold start of an app they may only ever type into.
     */
    @ReactMethod
    fun prepare(promise: Promise) {
        main.post {
            if (engine != null) {
                promise.resolve(ready)
                return@post
            }

            engine =
                TextToSpeech(reactContext) { status ->
                    ready = status == TextToSpeech.SUCCESS

                    if (!ready) {
                        // Not an error worth surfacing: the panel shows the answer regardless. A device with no
                        // speech data is uncommon but entirely legitimate.
                        Log.i(NAME, "Text to speech unavailable on this device")
                        emit(EVENT_UNAVAILABLE, null)
                        return@TextToSpeech
                    }

                    engine?.language = Locale.getDefault()
                    engine?.setOnUtteranceProgressListener(progress)

                    // Whatever arrived while the engine was starting. Usually the first answer, since the panel
                    // opens and asks in quick succession.
                    pending?.let { text ->
                        pending = null
                        speakNow(text)
                    }
                }

            promise.resolve(false)
        }
    }

    /**
     * Speaks, replacing anything already being spoken.
     *
     * `QUEUE_FLUSH` deliberately: a queued second answer would be read out after the user has asked something
     * else, answering a question they have already moved past.
     */
    @ReactMethod
    fun speak(
        text: String,
        promise: Promise,
    ) {
        val trimmed = text.trim()

        if (trimmed.isEmpty()) {
            promise.resolve(false)
            return
        }

        main.post {
            if (!ready) {
                // Held rather than dropped. The alternative is an answer that is shown but never spoken because
                // the engine happened to be half a second behind the model.
                pending = trimmed
                promise.resolve(false)
                return@post
            }

            speakNow(trimmed)
            promise.resolve(true)
        }
    }

    private fun speakNow(text: String) {
        runCatching {
            engine?.speak(text, TextToSpeech.QUEUE_FLUSH, null, UTTERANCE_ID)
        }.onFailure { error -> Log.w(NAME, "Could not speak", error) }
    }

    /**
     * Stops immediately.
     *
     * Called on dismissal, on a new question, and on teardown. Also clears `pending`, or an answer held for a slow
     * engine would be spoken after the panel had gone.
     */
    @ReactMethod
    fun stop(promise: Promise) {
        main.post {
            pending = null
            runCatching { engine?.stop() }
            promise.resolve(true)
        }
    }

    private fun emit(
        name: String,
        payload: Any?,
    ) {
        runCatching {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(name, payload)
        }
    }

    /**
     * Reports when speech starts and stops.
     *
     * The panel uses this to show a speaking indicator and to offer a stop button only while there is something to
     * stop. Without it the button either always shows — and does nothing most of the time — or has to be timed
     * from the text's length, which is a guess.
     */
    private val progress =
        object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) = emit(EVENT_START, null)

            override fun onDone(utteranceId: String?) = emit(EVENT_DONE, null)

            @Deprecated("Required by the abstract class; the int-taking overload is called on API 21+.")
            override fun onError(utteranceId: String?) = emit(EVENT_DONE, null)

            override fun onError(
                utteranceId: String?,
                errorCode: Int,
            ) = emit(EVENT_DONE, null)

            /** Flush counts as done: the panel must stop showing "speaking" when a new answer interrupts. */
            override fun onStop(
                utteranceId: String?,
                interrupted: Boolean,
            ) = emit(EVENT_DONE, null)
        }

    companion object {
        const val NAME = "AssistSpeechOut"

        const val EVENT_START = "assistSpeakStart"
        const val EVENT_DONE = "assistSpeakDone"
        const val EVENT_UNAVAILABLE = "assistSpeakUnavailable"

        private const val UTTERANCE_ID = "orion-assist"
    }
}
