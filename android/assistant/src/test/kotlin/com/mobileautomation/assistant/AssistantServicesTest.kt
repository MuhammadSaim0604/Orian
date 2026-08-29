package com.mobileautomation.assistant

import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The assistant services exist and are constructible.
 *
 * A thin test on purpose. What actually matters about this module cannot be checked off-device: that
 * Android parses the voice-interaction metadata and puts the app in the assistant picker. That is a
 * manifest-and-platform question, verified by installing the app and opening
 * Settings > Default digital assistant app.
 *
 * What this does catch is the mistake that produced the original defect in a different form - a
 * service named in the manifest that does not exist, or stops existing after a rename. The manifest
 * references these three classes by fully-qualified name, so a rename compiles cleanly and fails only
 * at runtime, silently removing the app from the picker again.
 */
class AssistantServicesTest {
    @Test
    fun `the voice interaction service is a VoiceInteractionService`() {
        assertTrue(
            android.service.voice.VoiceInteractionService::class.java
                .isAssignableFrom(AutomationVoiceInteractionService::class.java),
        )
    }

    @Test
    fun `the session service is a VoiceInteractionSessionService`() {
        assertTrue(
            android.service.voice.VoiceInteractionSessionService::class.java
                .isAssignableFrom(AutomationVoiceInteractionSessionService::class.java),
        )
    }

    @Test
    fun `the recognition service is a RecognitionService`() {
        // Required by VoiceInteractionServiceInfo even though this app does no speech recognition:
        // a missing one makes the whole service fail to parse.
        assertTrue(
            android.speech.RecognitionService::class.java
                .isAssignableFrom(AutomationRecognitionService::class.java),
        )
    }

    @Test
    fun `the class names the manifest references have not moved`() {
        // The manifest and the XML config name these by fully-qualified string, so a package or class
        // rename compiles fine and only fails on the device - by making the app vanish from the
        // assistant picker with nothing logged.
        assertTrue(
            Class.forName("com.mobileautomation.assistant.AutomationVoiceInteractionService") != null,
        )
        assertTrue(
            Class.forName(
                "com.mobileautomation.assistant.AutomationVoiceInteractionSessionService",
            ) != null,
        )
        assertTrue(
            Class.forName("com.mobileautomation.assistant.AutomationRecognitionService") != null,
        )
    }
}
