package com.mobileautomation.tools

/**
 * Checks whether a sensitive capability is currently available.
 *
 * The gate is a hard precondition on every sensitive tool: nothing in the tool
 * layer touches contacts, the clipboard, alarms, or notifications without asking
 * here first. Centralising it means a new tool cannot forget the check, and a
 * revoked permission is noticed immediately rather than surfacing as an opaque
 * `SecurityException` mid-workflow.
 *
 * An interface so the tool layer is unit-testable: the real implementation calls
 * `ContextCompat.checkSelfPermission`, which needs a live `Context`.
 */
interface PermissionGate {
    fun isGranted(capability: SensitiveCapability): Boolean

    /**
     * Capabilities that are missing out of [required].
     *
     * Returned as a set so the UI can explain everything the user still needs to
     * grant in one screen rather than prompting repeatedly.
     */
    fun missingFrom(required: Set<SensitiveCapability>): Set<SensitiveCapability> =
        required.filterNot { isGranted(it) }.toSet()

    fun requireGranted(capability: SensitiveCapability) {
        if (!isGranted(capability)) throw MissingPermissionException(capability)
    }
}

/**
 * Thrown when a tool is invoked without its permission.
 *
 * Carries the capability rather than a message so the caller can map it to the
 * right rationale screen instead of parsing text.
 */
class MissingPermissionException(
    val capability: SensitiveCapability,
) : Exception(
        "${capability.name} requires ${capability.permission}" +
            if (capability.requiresSystemSettingsScreen) {
                ", which the user must grant in system settings"
            } else {
                ""
            },
    )
