package com.mobileautomation.tools

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The capability registry.
 *
 * These tests protect the rules that decide what a user is asked for and when - the part of the
 * permission model that is easy to get subtly wrong and hard to notice, because a permission asked
 * for at the wrong moment still works.
 */
class CapabilityRegistryTest {
    /** A gate with an explicit grant set, so each test states exactly the situation it means. */
    private class FakeGate(
        private val granted: Set<SensitiveCapability>,
    ) : PermissionGate {
        override fun isGranted(capability: SensitiveCapability): Boolean = capability in granted
    }

    private fun registry(vararg granted: SensitiveCapability) = CapabilityRegistry(FakeGate(granted.toSet()))

    private val allGranted = SensitiveCapability.entries.toTypedArray()

    @Test
    fun listsEveryCapability() {
        assertEquals(SensitiveCapability.entries.size, registry().states().size)
    }

    @Test
    fun ordersRequiredCapabilitiesFirst() {
        // Onboarding renders straight from this list, and the required ones are what it gates on.
        val tiers = registry().states().map { it.tier }
        val firstOptional = tiers.indexOf(CapabilityTier.OPTIONAL)

        assertTrue("expected some optional capabilities", firstOptional > 0)
        assertTrue(
            "a required capability appears after an optional one",
            tiers.drop(firstOptional).none { it == CapabilityTier.REQUIRED },
        )
    }

    @Test
    fun reportsTheFiveRequiredCapabilities() {
        // Named explicitly: this is the set the product does not work without, and quietly adding a
        // sixth would make onboarding harder to complete for everyone.
        assertEquals(
            listOf(
                SensitiveCapability.ACCESSIBILITY,
                SensitiveCapability.OVERLAY,
                SensitiveCapability.ASSISTANT,
                SensitiveCapability.USAGE_ACCESS,
                SensitiveCapability.NOTIFICATIONS,
            ),
            SensitiveCapability.required(),
        )
    }

    @Test
    fun carriesRationaleCopyWithEachState() {
        // So no screen has to know that rationale text lives somewhere else.
        for (state in registry().states()) {
            assertTrue("${state.id} has no title", state.title.isNotBlank())
            assertTrue("${state.id} has no explanation", state.explanation.isNotBlank())
            assertTrue("${state.id} has no stated consequence", state.consequenceIfDenied.isNotBlank())
        }
    }

    @Test
    fun reportsLiveGrantState() {
        val states = registry(SensitiveCapability.OVERLAY).states()

        assertTrue(states.first { it.capability == SensitiveCapability.OVERLAY }.granted)
        assertFalse(states.first { it.capability == SensitiveCapability.ACCESSIBILITY }.granted)
    }

    @Test
    fun givesEveryCapabilityAStableLowercaseId() {
        // The id crosses to TypeScript as a union member, so it must not be the enum's name.
        for (capability in SensitiveCapability.entries) {
            assertEquals(capability.name.lowercase(), capability.id)
            assertEquals(capability, SensitiveCapability.fromId(capability.id))
        }
    }

    @Test
    fun returnsNullForAnUnknownId() {
        assertEquals(null, SensitiveCapability.fromId("teleportation"))
    }
}

class OnboardingGateTest {
    private class FakeGate(
        private val granted: Set<SensitiveCapability>,
    ) : PermissionGate {
        override fun isGranted(capability: SensitiveCapability): Boolean = capability in granted
    }

    @Test
    fun blocksOnboardingUntilEveryRequiredCapabilityIsGranted() {
        val registry = CapabilityRegistry(FakeGate(setOf(SensitiveCapability.ACCESSIBILITY)))

        assertFalse(registry.requiredCapabilitiesGranted())
    }

    @Test
    fun allowsOnboardingWithOnlyTheRequiredTier() {
        // The decisive case: making the user grant contacts to reach the app they downloaded is the
        // behaviour the permission model exists to prevent.
        val registry = CapabilityRegistry(FakeGate(SensitiveCapability.required().toSet()))

        assertTrue(registry.requiredCapabilitiesGranted())
    }

    @Test
    fun namesWhatIsStillMissing() {
        val registry =
            CapabilityRegistry(
                FakeGate(SensitiveCapability.required().toSet() - SensitiveCapability.USAGE_ACCESS),
            )

        assertEquals(listOf(SensitiveCapability.USAGE_ACCESS), registry.missingRequired())
    }

    @Test
    fun missingRequiredIgnoresOptionalCapabilities() {
        val registry = CapabilityRegistry(FakeGate(SensitiveCapability.required().toSet()))

        assertTrue(registry.missingRequired().isEmpty())
    }
}

class CapabilityRequestTest {
    private class FakeGate(
        private val granted: Set<SensitiveCapability>,
    ) : PermissionGate {
        override fun isGranted(capability: SensitiveCapability): Boolean = capability in granted
    }

    private fun registry(vararg granted: SensitiveCapability) = CapabilityRegistry(FakeGate(granted.toSet()))

    @Test
    fun asksForNothingWhenAlreadyGranted() {
        assertEquals(
            CapabilityRequest.AlreadyGranted,
            registry(SensitiveCapability.CONTACTS).requestFor(SensitiveCapability.CONTACTS),
        )
    }

    @Test
    fun usesARuntimePromptForContacts() {
        assertEquals(
            CapabilityRequest.RuntimePrompt("android.permission.READ_CONTACTS"),
            registry().requestFor(SensitiveCapability.CONTACTS),
        )
    }

    @Test
    fun sendsTheUserToSettingsForAccessibility() {
        // No runtime prompt exists for it, so this is the only route.
        assertEquals(
            CapabilityRequest.OpenSettings(PermissionRationale.ACTION_ACCESSIBILITY_SETTINGS),
            registry().requestFor(SensitiveCapability.ACCESSIBILITY),
        )
    }

    @Test
    fun sendsTheUserToSettingsForTheAssistantRole() {
        assertEquals(
            CapabilityRequest.OpenSettings(PermissionRationale.ACTION_ASSISTANT_SETTINGS),
            registry().requestFor(SensitiveCapability.ASSISTANT),
        )
    }

    @Test
    fun sendsTheUserToSettingsForUsageAccess() {
        assertEquals(
            CapabilityRequest.OpenSettings(PermissionRationale.ACTION_USAGE_ACCESS_SETTINGS),
            registry().requestFor(SensitiveCapability.USAGE_ACCESS),
        )
    }

    @Test
    fun usesTheSessionConsentFlowForScreenCapture() {
        // MediaProjection is neither a runtime permission nor a settings toggle.
        assertEquals(
            CapabilityRequest.SessionConsent,
            registry().requestFor(SensitiveCapability.SCREEN_CAPTURE),
        )
    }

    @Test
    fun reportsAnInstallTimePermissionAsUnrequestable() {
        // Nothing the user can do about it; if it is missing the build is wrong.
        assertTrue(
            registry().requestFor(SensitiveCapability.FOREGROUND_SERVICE) is CapabilityRequest.Unsupported,
        )
    }

    @Test
    fun everySettingsGrantedCapabilityDeclaresAnAction() {
        // A settings-granted capability with no action would render a button that goes nowhere.
        for (capability in SensitiveCapability.requiringSettingsRedirect()) {
            val request = registry().requestFor(capability)

            assertTrue(
                "${capability.name} does not resolve to a settings action: $request",
                request is CapabilityRequest.OpenSettings,
            )
        }
    }

    @Test
    fun everyCapabilityCanBeAskedFor() {
        // Guards against a new capability whose grant mechanism nobody wired up.
        for (capability in SensitiveCapability.entries) {
            val request = registry().requestFor(capability)

            if (capability.grant == GrantMechanism.INSTALL_TIME) continue

            assertFalse(
                "${capability.name} cannot be requested: $request",
                request is CapabilityRequest.Unsupported,
            )
        }
    }
}
