package com.mobileautomation.tools

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SensitiveCapabilityTest {
    @Test
    fun `accessibility and overlay are granted from system settings`() {
        val fromSettings = SensitiveCapability.requiringSettingsRedirect()
        assertTrue(fromSettings.contains(SensitiveCapability.ACCESSIBILITY))
        assertTrue(fromSettings.contains(SensitiveCapability.OVERLAY))
    }

    @Test
    fun `the assistant role and usage access are granted from system settings`() {
        // Neither has a runtime prompt, which is why onboarding has to be built around a settings
        // round trip rather than a dialog.
        val fromSettings = SensitiveCapability.requiringSettingsRedirect()
        assertTrue(fromSettings.contains(SensitiveCapability.ASSISTANT))
        assertTrue(fromSettings.contains(SensitiveCapability.USAGE_ACCESS))
    }

    @Test
    fun `contacts is a runtime permission rather than a settings redirect`() {
        assertTrue(!SensitiveCapability.CONTACTS.requiresSystemSettingsScreen)
    }

    @Test
    fun `every capability declares a permission`() {
        assertTrue(SensitiveCapability.entries.all { it.permission.isNotBlank() })
    }

    @Test
    fun `every capability requires an explicit rationale`() {
        assertTrue(SensitiveCapability.entries.all { requiresExplicitRationale(it) })
    }

    @Test
    fun `every capability is either required or optional`() {
        // The tier drives whether onboarding blocks on it, so a capability with no tier would be a
        // capability nobody decided about.
        assertEquals(
            SensitiveCapability.entries.size,
            SensitiveCapability.required().size + SensitiveCapability.optional().size,
        )
    }

    @Test
    fun `screen capture is optional and granted per session`() {
        // Optional because automation works without it; session-scoped because MediaProjection
        // consent cannot be granted once and forgotten.
        assertEquals(CapabilityTier.OPTIONAL, SensitiveCapability.SCREEN_CAPTURE.tier)
        assertEquals(GrantMechanism.SESSION_CONSENT, SensitiveCapability.SCREEN_CAPTURE.grant)
    }

    @Test
    fun `notifications is required, because a running automation must be visible`() {
        assertEquals(CapabilityTier.REQUIRED, SensitiveCapability.NOTIFICATIONS.tier)
    }

    @Test
    fun `contacts is optional, so onboarding cannot demand it`() {
        assertEquals(CapabilityTier.OPTIONAL, SensitiveCapability.CONTACTS.tier)
    }

    @Test
    fun `only settings-screen capabilities report needing a settings visit`() {
        for (capability in SensitiveCapability.entries) {
            assertEquals(
                "${capability.name} disagrees about needing settings",
                capability.grant == GrantMechanism.SETTINGS_SCREEN,
                capability.requiresSystemSettingsScreen,
            )
        }
    }

    @Test
    fun `no two capabilities share an id`() {
        // Ids cross to TypeScript as a union, and a duplicate would silently collapse two rows.
        val ids = SensitiveCapability.entries.map { it.id }
        assertEquals(ids.size, ids.distinct().size)
    }

    @Test
    fun `an id never contains an underscore-free surprise`() {
        for (capability in SensitiveCapability.entries) {
            assertFalse("${capability.id} is not lowercase", capability.id != capability.id.lowercase())
        }
    }
}
