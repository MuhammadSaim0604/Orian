package com.mobileautomation.assistant

import android.os.Bundle
import android.service.voice.VoiceInteractionService
import android.util.Log

/**
 * The voice interaction service.
 *
 * Its existence is what makes the app eligible to be the assistant. Android builds the "Default digital assistant
 * app" list from installed voice-interaction services, so an app that asks for the role without declaring one can
 * never be chosen — it simply does not appear in the picker, with no error to explain why.
 *
 * ## What it does now
 *
 * One thing beyond existing: it holds the **live instance**, because `showSession` is an instance method and the
 * only supported way to open an assist session from our own code. Nothing else can summon the panel — an activity
 * cannot, a broadcast cannot, and starting the app instead would put the panel inside our own window rather than
 * over the app the user is looking at.
 *
 * ## What it deliberately does not do
 *
 * It does not listen, and it does not use `AlwaysOnHotwordDetector`. That API is available only to the current
 * assistant, which is a genuine reason to hold the role — but the keyphrase has to be enrolled in the device's DSP
 * and enrolment is vendor-controlled, so for a custom phrase like "Hey Orion" it is unenrolled on essentially every
 * phone. Building on it would mean shipping a feature that works nowhere.
 *
 * The wake word is therefore a separate, opt-in service with its own notification. This class holds no microphone
 * and declares no audio permission of its own.
 */
class AutomationVoiceInteractionService : VoiceInteractionService() {
    override fun onReady() {
        super.onReady()
        active = this
        Log.i(TAG, "Assistant role active")
    }

    override fun onShutdown() {
        Log.i(TAG, "Assistant role released")
        if (active === this) active = null
        super.onShutdown()
    }

    companion object {
        private const val TAG = "AutomationAssistant"

        /**
         * The bound instance, or null when this app is not the active assistant.
         *
         * A static reference to a service, which is normally a leak. It is safe here because the system owns the
         * lifetime and clears it in `onShutdown`, and it is necessary because `showSession` cannot be reached any
         * other way — the wake-word service and the app both need to summon the panel and neither can hold a
         * binding to a service the system binds for itself.
         */
        @Volatile
        private var active: AutomationVoiceInteractionService? = null

        /** Whether this app is currently the device's assistant *and* its service is bound. */
        fun isActive(): Boolean = active != null

        /**
         * Opens the assist session, as if the user had used the gesture.
         *
         * Returns false when this app is not the active assistant, which is a real state rather than an error: the
         * user can change their assistant at any time, and the wake word should stop working rather than crash.
         *
         * `SHOW_WITH_ASSIST or SHOW_WITH_SCREENSHOT` asks for screen context. Android may still withhold it — the
         * user can turn off "Use screen context" — which the panel reports rather than treating as an empty screen.
         */
        fun requestAssist(): Boolean {
            val service = active ?: return false

            return try {
                service.showSession(Bundle(), SHOW_WITH_ASSIST or SHOW_WITH_SCREENSHOT)
                true
            } catch (error: Throwable) {
                Log.w(TAG, "Could not show the assist session", error)
                false
            }
        }

        /**
         * Mirrors the platform constants, which are not public on every API level we support.
         *
         * `SHOW_WITH_ASSIST` and `SHOW_WITH_SCREENSHOT` are documented values on `VoiceInteractionSession`, but the
         * constants themselves are only exposed on the session class rather than the service — so they are restated
         * here rather than reached for.
         */
        private const val SHOW_WITH_ASSIST = 1

        private const val SHOW_WITH_SCREENSHOT = 2
    }
}
