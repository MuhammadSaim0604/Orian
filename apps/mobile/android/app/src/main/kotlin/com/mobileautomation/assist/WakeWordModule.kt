package com.mobileautomation.assist

import android.Manifest
import android.content.pm.PackageManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.mobileautomation.assistant.AutomationVoiceInteractionService

/**
 * The wake word, surfaced to JS.
 *
 * Deliberately small. The service owns the listening and the notification; this reports state and flips it, so the
 * settings screen can be honest about three separate things:
 *
 * - whether the microphone has been granted,
 * - whether this app is actually the device's assistant, and
 * - whether the wake word is running right now.
 *
 * Three flags rather than one "enabled", because each has a different fix and a single boolean would send the user
 * to the wrong place. The commonest case is the second: someone turns the wake word on, hears nothing happen, and
 * has no idea their assistant is still Google.
 */
class WakeWordModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = NAME

    /**
     * Everything the settings screen needs, as JSON.
     *
     * One call rather than four, because the screen reads all of it together and four bridge round trips on every
     * focus would be silly. Hand-rolled JSON to match the rest of the bridge — `org.json` is stubbed in Android JVM
     * unit tests, so anything built with it cannot be tested off-device.
     */
    @ReactMethod(isBlockingSynchronousMethod = true)
    fun getState(): String {
        val microphone =
            reactContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) ==
                PackageManager.PERMISSION_GRANTED

        return buildString {
            append('{')
            append("\"running\":").append(WakeWordService.running).append(',')
            append("\"hasMicrophone\":").append(microphone).append(',')
            append("\"isDefaultAssistant\":").append(AutomationVoiceInteractionService.isActive())
            append('}')
        }
    }

    /**
     * Starts listening.
     *
     * Rejects rather than silently failing when a precondition is missing, and names which one. A promise that
     * resolved regardless would leave a toggle in the on position with nothing listening — the worst outcome for a
     * feature whose whole problem is that the user cannot see whether it works.
     */
    @ReactMethod
    fun enable(promise: Promise) {
        if (reactContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            promise.reject("microphone_denied", "The microphone permission has not been granted.")
            return
        }

        if (!AutomationVoiceInteractionService.isActive()) {
            // Checked here rather than at trigger time so the user finds out now, while they are in settings and can
            // do something about it, rather than by saying the phrase and getting nothing.
            promise.reject(
                "not_default_assistant",
                "Orion is not set as the device assistant, so it cannot open from a wake word.",
            )
            return
        }

        return try {
            WakeWordService.start(reactContext)
            promise.resolve(true)
        } catch (error: Throwable) {
            promise.reject("wake_word_failed", error.message, error)
        }
    }

    @ReactMethod
    fun disable(promise: Promise) {
        try {
            WakeWordService.stop(reactContext)
            promise.resolve(true)
        } catch (error: Throwable) {
            promise.reject("wake_word_failed", error.message, error)
        }
    }

    /**
     * Opens the panel without the gesture.
     *
     * Exists for the in-app button, and for testing the wake word's path without having to say the phrase. Goes
     * through the same `requestAssist` the service uses, so an in-app summoning is the same code path as a spoken
     * one rather than a second implementation that could drift.
     */
    @ReactMethod
    fun openPanel(promise: Promise) {
        promise.resolve(AutomationVoiceInteractionService.requestAssist())
    }

    companion object {
        const val NAME = "OrionWakeWord"
    }
}
