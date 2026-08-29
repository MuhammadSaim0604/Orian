package com.mobileautomation.assistant

import android.content.Context
import android.os.Bundle
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService
import android.util.Log

/**
 * Produces a session when the assistant is invoked.
 *
 * Required by the platform: a voice-interaction service whose metadata names no session service
 * fails to parse, and the app then never appears in the assistant picker.
 *
 * The session closes itself immediately. Holding the assistant role is about being *eligible* for
 * screen context, not about taking over the assist gesture - a long-press on home should keep doing
 * whatever the user expects rather than opening an automation tool they did not ask for.
 */
class AutomationVoiceInteractionSessionService : VoiceInteractionSessionService() {
    override fun onNewSession(args: Bundle?): VoiceInteractionSession = AutomationSession(this)

    private class AutomationSession(
        context: Context,
    ) : VoiceInteractionSession(context) {
        override fun onShow(
            args: Bundle?,
            showFlags: Int,
        ) {
            super.onShow(args, showFlags)

            // Closed rather than presented. An assistant UI here would hijack the assist gesture,
            // and this app has a launcher icon for the times the user wants it.
            Log.i(TAG, "Assist session dismissed without a UI")
            hide()
        }
    }

    private companion object {
        const val TAG = "AutomationAssistant"
    }
}
