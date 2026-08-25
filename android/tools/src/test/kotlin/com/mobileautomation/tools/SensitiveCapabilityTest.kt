package com.mobileautomation.tools

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
}
