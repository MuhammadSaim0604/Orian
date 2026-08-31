package com.mobileautomation.tools

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The capabilities behind the messaging, call and device-configuration tools.
 *
 * These four were added because the agent could read the screen and tap but could not text anyone, call
 * anyone, change a setting, or silence the phone. Each brought a decision worth pinning down, and each of
 * those decisions is about **how Android grants the permission** rather than about what the tool does.
 */
class CommunicationCapabilityTest {
    @Test
    fun `sms is one capability, not one per direction`() {
        // SEND_SMS and READ_SMS are a single permission group: asking for either shows the same system
        // prompt. Two toggles would imply a choice the platform does not offer, and the user would grant one
        // and find the other granted too.
        assertEquals(1, SensitiveCapability.entries.count { it.name.startsWith("SMS") })
        assertEquals("android.permission.SEND_SMS", SensitiveCapability.SMS.permission)
    }

    @Test
    fun `sms and phone are runtime prompts`() {
        // Ordinary dangerous permissions with a dialog and a result to await, unlike the two below.
        assertEquals(GrantMechanism.RUNTIME_PROMPT, SensitiveCapability.SMS.grant)
        assertEquals(GrantMechanism.RUNTIME_PROMPT, SensitiveCapability.PHONE.grant)
    }

    @Test
    fun `write settings and do not disturb are settings screens, not prompts`() {
        // Both are per-app special access. There is no dialog to show and no result to await, so the UI has
        // to send the user out and re-read on resume - which is why the mechanism is modelled rather than
        // assumed.
        assertEquals(GrantMechanism.SETTINGS_SCREEN, SensitiveCapability.WRITE_SETTINGS.grant)
        assertEquals(GrantMechanism.SETTINGS_SCREEN, SensitiveCapability.DO_NOT_DISTURB.grant)
        assertTrue(SensitiveCapability.WRITE_SETTINGS.requiresSystemSettingsScreen)
        assertTrue(SensitiveCapability.DO_NOT_DISTURB.requiresSystemSettingsScreen)
    }

    @Test
    fun `all four are optional, so onboarding never demands them`() {
        // Making someone grant SMS access to reach an app they downloaded is precisely what the permission
        // model exists to prevent.
        val added =
            listOf(
                SensitiveCapability.SMS,
                SensitiveCapability.PHONE,
                SensitiveCapability.WRITE_SETTINGS,
                SensitiveCapability.DO_NOT_DISTURB,
            )

        assertTrue(added.all { it.tier == CapabilityTier.OPTIONAL })
        assertTrue(SensitiveCapability.required().none { it in added })
    }

    @Test
    fun `each declares a settings action where it needs one`() {
        // A settings-granted capability with no action is a dead button, and `CapabilityRegistry` returns
        // Unsupported for it rather than crashing - so the check belongs here, before a user meets it.
        for (capability in SensitiveCapability.requiringSettingsRedirect()) {
            assertTrue(
                "${capability.name} needs a settings screen but declares no action",
                PermissionRationale.forCapability(capability).settingsAction != null,
            )
        }
    }

    @Test
    fun `the sms rationale says messages are sent, not drafted`() {
        // The user is agreeing to something that acts on its own. Copy that said "compose a message" would
        // be describing a different, safer permission than the one being requested.
        val rationale = PermissionRationale.forCapability(SensitiveCapability.SMS)

        assertTrue(rationale.explanation.contains("send", ignoreCase = true))
        assertTrue(rationale.explanation.contains("nothing is stored", ignoreCase = true))
    }

    @Test
    fun `the phone rationale says it dials without confirming`() {
        val rationale = PermissionRationale.forCapability(SensitiveCapability.PHONE)

        assertTrue(rationale.explanation.contains("dials", ignoreCase = true))
        // And says what is lost by refusing, so the choice is informed rather than a blind "allow".
        assertTrue(rationale.consequenceIfDenied.contains("dialer", ignoreCase = true))
    }

    @Test
    fun `every new capability explains what breaks without it`() {
        for (
        capability in
        listOf(
            SensitiveCapability.SMS,
            SensitiveCapability.PHONE,
            SensitiveCapability.WRITE_SETTINGS,
            SensitiveCapability.DO_NOT_DISTURB,
        )
        ) {
            val rationale = PermissionRationale.forCapability(capability)

            assertTrue(rationale.title.isNotBlank())
            assertTrue(rationale.explanation.length > 40)
            assertTrue(rationale.consequenceIfDenied.length > 20)
        }
    }

    @Test
    fun `capability ids stay lowercase for the typescript union`() {
        assertEquals("sms", SensitiveCapability.SMS.id)
        assertEquals("write_settings", SensitiveCapability.WRITE_SETTINGS.id)
        assertEquals("do_not_disturb", SensitiveCapability.DO_NOT_DISTURB.id)
    }

    @Test
    fun `a capability resolves from its id`() {
        assertEquals(SensitiveCapability.PHONE, SensitiveCapability.fromId("phone"))
        assertEquals(null, SensitiveCapability.fromId("telepathy"))
    }

    @Test
    fun `the registry reports the new capabilities with their state`() {
        val registry = CapabilityRegistry(FixedGate(granted = setOf(SensitiveCapability.SMS)))

        val states = registry.states().associateBy { it.id }

        assertTrue(states.getValue("sms").granted)
        assertFalse(states.getValue("phone").granted)
        assertTrue(states.getValue("write_settings").requiresSettingsVisit)
        assertFalse(states.getValue("sms").requiresSettingsVisit)
    }

    @Test
    fun `requesting sms is a runtime prompt and write settings is a redirect`() {
        val registry = CapabilityRegistry(FixedGate(granted = emptySet()))

        assertTrue(registry.requestFor(SensitiveCapability.SMS) is CapabilityRequest.RuntimePrompt)
        assertTrue(registry.requestFor(SensitiveCapability.WRITE_SETTINGS) is CapabilityRequest.OpenSettings)
    }

    @Test
    fun `an already-granted capability asks for nothing`() {
        val registry = CapabilityRegistry(FixedGate(granted = setOf(SensitiveCapability.PHONE)))

        assertEquals(
            CapabilityRequest.AlreadyGranted,
            registry.requestFor(SensitiveCapability.PHONE),
        )
    }

    private class FixedGate(
        private val granted: Set<SensitiveCapability>,
    ) : PermissionGate {
        override fun isGranted(capability: SensitiveCapability): Boolean = capability in granted
    }
}

/**
 * The ringer mode, and the asymmetry in what it needs.
 *
 * `setRingerMode` succeeds for normal without any grant and throws `SecurityException` for silent and
 * vibrate without Do Not Disturb access. A tool that ignored that would work for one value and crash for the
 * other two, which reads as a broken tool rather than a missing permission.
 */
class RingerModeTest {
    @Test
    fun `wire names match the tool sdk`() {
        assertEquals(listOf("normal", "vibrate", "silent"), RingerMode.names)
    }

    @Test
    fun `only silencing needs policy access`() {
        assertFalse(RingerMode.NORMAL.requiresPolicyAccess)
        assertTrue(RingerMode.VIBRATE.requiresPolicyAccess)
        assertTrue(RingerMode.SILENT.requiresPolicyAccess)
    }

    @Test
    fun `names resolve case-insensitively, since a model supplies them as text`() {
        assertEquals(RingerMode.SILENT, RingerMode.fromName("Silent"))
        assertEquals(RingerMode.NORMAL, RingerMode.fromName("NORMAL"))
        assertEquals(null, RingerMode.fromName("loud"))
    }
}

/**
 * The message model.
 *
 * Narrow on purpose: an agent asked to find a verification code needs the number, the text, the time and the
 * direction. Every additional field is more of the user's private data crossing the bridge and potentially
 * reaching a model.
 */
class SmsMessageTest {
    @Test
    fun `a short body previews unchanged`() {
        val message = com.mobileautomation.tools.model.SmsMessage("+447700900123", "On my way", 1L)

        assertEquals("On my way", message.preview())
    }

    @Test
    fun `a long body is truncated, because previews end up in notifications and logs`() {
        val message = com.mobileautomation.tools.model.SmsMessage("+447700900123", "x".repeat(200), 1L)

        val preview = message.preview()

        assertEquals(60, preview.length)
        assertTrue(preview.endsWith("\u2026"))
    }

    @Test
    fun `direction is carried, so a reply is not mistaken for a received message`() {
        val sent = com.mobileautomation.tools.model.SmsMessage("+447700900123", "Hi", 1L, isOutgoing = true)

        assertTrue(sent.isOutgoing)
    }
}
