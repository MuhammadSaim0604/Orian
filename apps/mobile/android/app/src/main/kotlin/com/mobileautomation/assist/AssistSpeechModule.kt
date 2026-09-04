package com.mobileautomation.assist

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Speech in, for the Orion Assist panel.
 *
 * ## Why the system recogniser and not ours
 *
 * This app declares `AutomationRecognitionService`, which returns `ERROR_CLIENT` to everything on purpose — it
 * exists only because `VoiceInteractionServiceInfo` refuses to parse a voice-interaction service whose metadata
 * names no recogniser in the same package. Using it here would mean listening that never hears anything.
 *
 * `SpeechRecognizer.createSpeechRecognizer` picks the **system default**, which on a normal device is Google's.
 * That is the one we want, and the distinction is easy to get wrong because both are reached through the same API.
 *
 * ## Threading
 *
 * `SpeechRecognizer` must be created and driven on the **main thread**, and it fails silently rather than throwing
 * if it is not — the callbacks simply never arrive. Every entry point here marshals, which is why this module
 * holds a `Handler` rather than using a coroutine scope like the rest of the bridge.
 */
class AssistSpeechModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    private val main = Handler(Looper.getMainLooper())

    private var recognizer: SpeechRecognizer? = null

    override fun getName(): String = NAME

    override fun invalidate() {
        main.post { destroyRecognizer() }
        super.invalidate()
    }

    /**
     * Whether the microphone has been granted.
     *
     * Read live rather than cached, and asked separately from starting: the panel requests `RECORD_AUDIO`
     * just-in-time on first use of voice input, so it needs to know whether to ask before it tries.
     */
    @ReactMethod(isBlockingSynchronousMethod = true)
    fun hasMicrophonePermission(): Boolean =
        reactContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED

    /** Whether any speech recogniser is available at all. Some devices genuinely have none. */
    @ReactMethod(isBlockingSynchronousMethod = true)
    fun isSpeechAvailable(): Boolean = SpeechRecognizer.isRecognitionAvailable(reactContext)

    /**
     * Starts listening.
     *
     * Resolves as soon as listening has begun, not when speech ends. Results arrive as events, because a promise
     * cannot deliver the partial transcript the panel shows while the user is still talking — and seeing words
     * appear is what makes it obvious the microphone is live.
     */
    @ReactMethod
    fun startListening(promise: Promise) {
        if (!hasMicrophonePermission()) {
            promise.reject("microphone_denied", "The microphone permission has not been granted.")
            return
        }

        if (!isSpeechAvailable()) {
            promise.reject("speech_unavailable", "This device has no speech recogniser.")
            return
        }

        main.post {
            try {
                destroyRecognizer()

                val created = SpeechRecognizer.createSpeechRecognizer(reactContext)
                created.setRecognitionListener(listener)
                recognizer = created

                created.startListening(
                    android.content.Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                        putExtra(
                            RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                            RecognizerIntent.LANGUAGE_MODEL_FREE_FORM,
                        )
                        // Partial results are the point: without them the panel sits blank while someone talks,
                        // which reads as a microphone that is not working.
                        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                        putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, reactContext.packageName)
                        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                    },
                )

                promise.resolve(true)
            } catch (error: Throwable) {
                Log.w(NAME, "Could not start listening", error)
                promise.reject("speech_failed", error.message, error)
            }
        }
    }

    /**
     * Stops listening and takes what was heard.
     *
     * `stopListening` rather than `cancel`: stop asks the recogniser to finish processing what it already has and
     * deliver a result, while cancel throws it away. A user who stops talking and taps the button expects the
     * former.
     */
    @ReactMethod
    fun stopListening(promise: Promise) {
        main.post {
            runCatching { recognizer?.stopListening() }
            promise.resolve(true)
        }
    }

    /** Abandons what was heard, for a dismissed panel. */
    @ReactMethod
    fun cancelListening(promise: Promise) {
        main.post {
            destroyRecognizer()
            promise.resolve(true)
        }
    }

    private fun destroyRecognizer() {
        recognizer?.let { active ->
            runCatching { active.cancel() }
            runCatching { active.destroy() }
        }
        recognizer = null
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

    private val listener =
        object : RecognitionListener {
            override fun onPartialResults(partialResults: Bundle?) {
                firstResult(partialResults)?.let { text -> emit(EVENT_PARTIAL, text) }
            }

            override fun onResults(results: Bundle?) {
                val text = firstResult(results)

                if (text.isNullOrBlank()) {
                    // Heard nothing usable. Reported as an error rather than an empty result, so the panel can say
                    // "I did not catch that" instead of silently sending an empty question to the model.
                    emit(EVENT_ERROR, "no_speech")
                } else {
                    emit(EVENT_RESULT, text)
                }

                main.post { destroyRecognizer() }
            }

            override fun onError(error: Int) {
                emit(EVENT_ERROR, describeError(error))
                main.post { destroyRecognizer() }
            }

            /** Drives the panel's level meter, so the user can see the microphone is hearing them. */
            override fun onRmsChanged(rmsdB: Float) {
                emit(EVENT_LEVEL, rmsdB.toDouble())
            }

            override fun onReadyForSpeech(params: Bundle?) = emit(EVENT_READY, null)

            override fun onEndOfSpeech() = emit(EVENT_END, null)

            override fun onBeginningOfSpeech() = Unit

            override fun onBufferReceived(buffer: ByteArray?) = Unit

            override fun onEvent(
                eventType: Int,
                params: Bundle?,
            ) = Unit
        }

    private fun firstResult(bundle: Bundle?): String? =
        bundle
            ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            ?.firstOrNull()

    /**
     * A recogniser error as something the panel can act on.
     *
     * Mapped to short codes rather than passed through as ints, because the panel's response differs per case: a
     * permission problem needs a prompt, a network problem needs "try again", and no-match needs "I did not catch
     * that". An integer at the JS boundary would put that decision in the wrong place.
     */
    private fun describeError(error: Int): String =
        when (error) {
            SpeechRecognizer.ERROR_NO_MATCH -> "no_speech"
            SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "no_speech"
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "microphone_denied"
            SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "network"
            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "busy"
            else -> "failed"
        }

    companion object {
        const val NAME = "AssistSpeech"

        const val EVENT_PARTIAL = "assistSpeechPartial"
        const val EVENT_RESULT = "assistSpeechResult"
        const val EVENT_ERROR = "assistSpeechError"
        const val EVENT_LEVEL = "assistSpeechLevel"
        const val EVENT_READY = "assistSpeechReady"
        const val EVENT_END = "assistSpeechEnd"
    }
}
