package com.mobileautomation.tools

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PermissionGateTest {
    /** Grants exactly the capabilities it is given, denying everything else. */
    private class FakePermissionGate(
        private val granted: Set<SensitiveCapability>,
    ) : PermissionGate {
        override fun isGranted(capability: SensitiveCapability): Boolean = capability in granted
    }

    @Test
    fun `reports a granted capability`() {
        val gate = FakePermissionGate(setOf(SensitiveCapability.CONTACTS))
        assertTrue(gate.isGranted(SensitiveCapability.CONTACTS))
    }

    @Test
    fun `denies by default`() {
        // The gate must never fail open: an unlisted capability is denied.
        val gate = FakePermissionGate(emptySet())
        assertTrue(SensitiveCapability.entries.none { gate.isGranted(it) })
    }

    @Test
    fun `lists every missing capability at once`() {
        val gate = FakePermissionGate(setOf(SensitiveCapability.NOTIFICATIONS))

        val missing =
            gate.missingFrom(
                setOf(
                    SensitiveCapability.NOTIFICATIONS,
                    SensitiveCapability.CONTACTS,
                    SensitiveCapability.OVERLAY,
                ),
            )

        assertEquals(
            setOf(SensitiveCapability.CONTACTS, SensitiveCapability.OVERLAY),
            missing,
        )
    }

    @Test
    fun `reports nothing missing when all are granted`() {
        val gate = FakePermissionGate(SensitiveCapability.entries.toSet())
        assertTrue(gate.missingFrom(SensitiveCapability.entries.toSet()).isEmpty())
    }

    @Test
    fun `requireGranted passes silently when granted`() {
        FakePermissionGate(setOf(SensitiveCapability.CONTACTS))
            .requireGranted(SensitiveCapability.CONTACTS)
    }

    @Test
    fun `requireGranted throws a typed error carrying the capability`() {
        val gate = FakePermissionGate(emptySet())

        val error =
            runCatching { gate.requireGranted(SensitiveCapability.CONTACTS) }
                .exceptionOrNull()

        assertTrue(error is MissingPermissionException)
        assertEquals(SensitiveCapability.CONTACTS, (error as MissingPermissionException).capability)
    }

    @Test
    fun `the error names the permission so the UI can explain it`() {
        val error = MissingPermissionException(SensitiveCapability.CONTACTS)
        assertTrue(error.message!!.contains("android.permission.READ_CONTACTS"))
    }

    @Test
    fun `the error says when a settings screen is required`() {
        val settingsBound = MissingPermissionException(SensitiveCapability.ACCESSIBILITY)
        val runtimeBound = MissingPermissionException(SensitiveCapability.CONTACTS)

        assertTrue(settingsBound.message!!.contains("system settings"))
        assertFalse(runtimeBound.message!!.contains("system settings"))
    }
}
