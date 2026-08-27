package com.mobileautomation.tools

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PermissionRationaleTest {
    @Test
    fun `every sensitive capability has rationale copy`() {
        // The permission model forbids requesting anything without an explanation,
        // so a capability with no rationale is a policy violation, not an oversight.
        assertEquals(SensitiveCapability.entries.size, PermissionRationale.all().size)
    }

    @Test
    fun `no rationale field is left blank`() {
        for (rationale in PermissionRationale.all()) {
            assertTrue("${rationale.capability} has a blank title", rationale.title.isNotBlank())
            assertTrue(
                "${rationale.capability} has a blank explanation",
                rationale.explanation.isNotBlank(),
            )
            assertTrue(
                "${rationale.capability} does not say what breaks if denied",
                rationale.consequenceIfDenied.isNotBlank(),
            )
        }
    }

    @Test
    fun `capabilities needing a settings visit carry a settings action`() {
        for (capability in SensitiveCapability.requiringSettingsRedirect()) {
            val rationale = PermissionRationale.forCapability(capability)
            assertNotNull(
                "${capability.name} must send the user to settings",
                rationale.settingsAction,
            )
            assertTrue(rationale.requiresSettingsVisit)
        }
    }

    @Test
    fun `runtime-granted capabilities do not send the user to settings`() {
        val runtimeGranted =
            SensitiveCapability.entries.filterNot { it.requiresSystemSettingsScreen }

        for (capability in runtimeGranted) {
            assertFalse(
                "${capability.name} should use a runtime dialog",
                PermissionRationale.forCapability(capability).requiresSettingsVisit,
            )
        }
    }

    @Test
    fun `the accessibility rationale opens accessibility settings`() {
        val rationale = PermissionRationale.forCapability(SensitiveCapability.ACCESSIBILITY)
        assertEquals(PermissionRationale.ACTION_ACCESSIBILITY_SETTINGS, rationale.settingsAction)
    }

    @Test
    fun `the overlay rationale opens the overlay settings screen`() {
        val rationale = PermissionRationale.forCapability(SensitiveCapability.OVERLAY)
        assertEquals(PermissionRationale.ACTION_OVERLAY_SETTINGS, rationale.settingsAction)
    }

    @Test
    fun `the accessibility explanation states that screen content is read`() {
        // This is the highest-trust grant in the app; the user must not be able to
        // agree to it without being told what it means.
        val explanation =
            PermissionRationale.forCapability(SensitiveCapability.ACCESSIBILITY).explanation

        assertTrue(explanation.contains("read", ignoreCase = true))
        assertTrue(explanation.contains("screen", ignoreCase = true))
    }

    @Test
    fun `the contacts explanation limits what is read`() {
        val explanation = PermissionRationale.forCapability(SensitiveCapability.CONTACTS).explanation
        assertTrue(explanation.contains("names and phone numbers", ignoreCase = true))
    }
}
