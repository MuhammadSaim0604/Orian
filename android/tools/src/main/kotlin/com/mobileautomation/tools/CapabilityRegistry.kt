package com.mobileautomation.tools

/**
 * One place that knows every capability, its tier, its rationale, how to read its state, and how to
 * request it.
 *
 * The registry exists because the alternative - a screen per permission, each with its own copy and
 * its own state read - is how one gets forgotten. Onboarding, the permissions overview, tools
 * management, and the just-in-time prompts all render from this list, so adding a capability makes
 * it appear in every one of them.
 *
 * It holds **no Android types**, so it is unit-testable off-device. The state read is injected as a
 * [PermissionGate], and requesting is described rather than performed: a [CapabilityRequest] says
 * what the caller must do, because launching an intent or a runtime prompt needs an Activity, which
 * belongs to the React Native layer.
 */
class CapabilityRegistry(
    private val gate: PermissionGate,
) {
    /** Every capability with its live state, ordered required-first. */
    fun states(): List<CapabilityState> =
        (SensitiveCapability.required() + SensitiveCapability.optional()).map { stateOf(it) }

    fun stateOf(capability: SensitiveCapability): CapabilityState {
        val rationale = PermissionRationale.forCapability(capability)

        return CapabilityState(
            capability = capability,
            granted = gate.isGranted(capability),
            title = rationale.title,
            explanation = rationale.explanation,
            consequenceIfDenied = rationale.consequenceIfDenied,
            settingsAction = rationale.settingsAction,
        )
    }

    /**
     * What the caller must do to request [capability].
     *
     * Described rather than done, so the registry stays free of Android and the decision about
     * *how* to grant lives next to the capability rather than in whichever screen asks.
     */
    fun requestFor(capability: SensitiveCapability): CapabilityRequest {
        if (gate.isGranted(capability)) return CapabilityRequest.AlreadyGranted

        return when (capability.grant) {
            GrantMechanism.RUNTIME_PROMPT -> CapabilityRequest.RuntimePrompt(capability.permission)

            GrantMechanism.SETTINGS_SCREEN -> {
                val action =
                    PermissionRationale.forCapability(capability).settingsAction
                        // A settings-granted capability with no action is a programming error: there
                        // would be nowhere to send the user. Failing loudly here beats a dead button.
                        ?: return CapabilityRequest.Unsupported(
                            "${capability.name} needs a settings screen but declares no action",
                        )

                CapabilityRequest.OpenSettings(action)
            }

            GrantMechanism.SESSION_CONSENT -> CapabilityRequest.SessionConsent

            GrantMechanism.INSTALL_TIME ->
                // Declared in the manifest or not at all. If it is missing at this point the build
                // is wrong, and no user action can fix it.
                CapabilityRequest.Unsupported("${capability.name} is granted at install time")
        }
    }

    /**
     * Whether onboarding can complete.
     *
     * The gate is the required tier and nothing else. Optional capabilities are deliberately not
     * consulted: making the user grant contacts to reach the app they downloaded would be the
     * behaviour the permission model exists to prevent.
     */
    fun requiredCapabilitiesGranted(): Boolean = SensitiveCapability.required().all { gate.isGranted(it) }

    /** Required capabilities still missing, for a screen that explains what remains. */
    fun missingRequired(): List<SensitiveCapability> = SensitiveCapability.required().filterNot { gate.isGranted(it) }
}

/**
 * A capability and everything a screen needs to render it.
 *
 * Flattened deliberately: the UI gets state and copy in one object, so no screen has to know that
 * rationale text lives somewhere else.
 */
data class CapabilityState(
    val capability: SensitiveCapability,
    val granted: Boolean,
    val title: String,
    val explanation: String,
    val consequenceIfDenied: String,
    val settingsAction: String?,
) {
    val id: String get() = capability.id

    val tier: CapabilityTier get() = capability.tier

    val grant: GrantMechanism get() = capability.grant

    /**
     * True when granting means leaving the app.
     *
     * The UI needs this to word its button honestly - "Open settings" rather than "Allow" - and to
     * expect a re-check on resume rather than a callback.
     */
    val requiresSettingsVisit: Boolean get() = settingsAction != null
}

/** What the caller must do to request a capability. */
sealed interface CapabilityRequest {
    /** Nothing to do. */
    data object AlreadyGranted : CapabilityRequest

    /** Ask for [permission] with the standard runtime dialog. */
    data class RuntimePrompt(val permission: String) : CapabilityRequest

    /**
     * Send the user to a settings screen.
     *
     * There is **no result to await**. The caller opens the intent and re-reads state when the user
     * returns; anything that looks like awaiting a settings grant is a bug.
     */
    data class OpenSettings(val action: String) : CapabilityRequest

    /** Launch the per-session consent dialog, which is MediaProjection's own flow. */
    data object SessionConsent : CapabilityRequest

    /** Cannot be requested, with the reason. */
    data class Unsupported(val reason: String) : CapabilityRequest
}
