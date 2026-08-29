package com.mobileautomation.assistant

import android.content.Intent
import android.speech.RecognitionService
import android.speech.SpeechRecognizer

/**
 * A recognition service that recognises nothing.
 *
 * `VoiceInteractionServiceInfo` requires the voice-interaction metadata to name a recognition service
 * in the same package, and a missing one makes the whole service fail to parse - so the app
 * disappears from the assistant picker with nothing logged to explain it. This satisfies that
 * requirement honestly rather than pretending to offer speech recognition.
 *
 * Every callback reports `ERROR_CLIENT` immediately. An implementation that hung, or that quietly
 * returned empty results, would leave a caller waiting on a service that is never going to answer.
 */
class AutomationRecognitionService : RecognitionService() {
    override fun onStartListening(
        recognizerIntent: Intent?,
        listener: Callback?,
    ) {
        listener?.error(SpeechRecognizer.ERROR_CLIENT)
    }

    override fun onCancel(listener: Callback?) = Unit

    override fun onStopListening(listener: Callback?) {
        listener?.error(SpeechRecognizer.ERROR_CLIENT)
    }
}
