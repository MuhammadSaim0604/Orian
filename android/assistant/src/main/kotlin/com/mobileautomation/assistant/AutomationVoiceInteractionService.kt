package com.mobileautomation.assistant

import android.service.voice.VoiceInteractionService
import android.util.Log

/**
 * The voice interaction service.
 *
 * Its existence is the point. Android builds the "Default digital assistant app" list from installed
 * voice-interaction services, so an app that asks for the assistant role without declaring one can
 * never be chosen - it simply does not appear in the picker, with no error to explain why. That was
 * the defect: the capability was requestable, the settings deep link worked, and the app was absent
 * from the list the user was sent to.
 *
 * It deliberately does **almost nothing**. The assistant role is held for one reason: as the active
 * assistant, the app can be shown structured screen context the system does not otherwise expose,
 * which makes screen reading more precise on apps that draw their own interface. Automation itself
 * continues to run through the accessibility service and the tool runtime.
 *
 * It does not listen. There is no hotword detection and no microphone use, which is why
 * `setDisabledShowContext` is left alone and no audio permission is declared.
 */
class AutomationVoiceInteractionService : VoiceInteractionService() {
    override fun onReady() {
        super.onReady()
        Log.i(TAG, "Assistant role active")
    }

    override fun onShutdown() {
        Log.i(TAG, "Assistant role released")
        super.onShutdown()
    }

    private companion object {
        const val TAG = "AutomationAssistant"
    }
}
