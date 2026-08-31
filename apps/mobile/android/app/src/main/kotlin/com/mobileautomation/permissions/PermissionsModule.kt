package com.mobileautomation.permissions

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import com.mobileautomation.bridge.AutomationRuntimeProvider
import com.mobileautomation.tools.CapabilityRegistry
import com.mobileautomation.tools.CapabilityRequest
import com.mobileautomation.tools.CapabilityState
import com.mobileautomation.tools.SensitiveCapability

/**
 * Capability state and requests, exposed to React Native.
 *
 * The registry decides *what* each capability is and *how* it is granted; this module does the two
 * things that need an Android context and an Activity, which the registry deliberately cannot do:
 * launch a runtime prompt, and open a settings screen.
 *
 * **State is always read fresh.** A new `CapabilityRegistry` per call, over a gate that queries the
 * platform every time. Caching would mean reporting a permission the user revoked while they were
 * in Settings - which, given the whole flow sends them to Settings, is the common case rather than
 * an edge one.
 */
class PermissionsModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext),
    PermissionListener {
    /**
     * Rebuilt per call rather than held.
     *
     * The gate reads the accessibility service's state, which the system changes without telling
     * us, and the screen-capture session, which lives in the runtime provider.
     */
    private val registry: CapabilityRegistry
        get() = CapabilityRegistry(AutomationRuntimeProvider.permissionGate(reactContext))

    /** The runtime prompt in flight, if any. Only one at a time. */
    private var pendingPrompt: PendingPrompt? = null

    private data class PendingPrompt(
        val capability: SensitiveCapability,
        val promise: Promise,
    )

    override fun getName(): String = NAME

    // --- reading ----------------------------------------------------------

    /** Every capability with its live state and rationale copy, required tier first. */
    @ReactMethod
    fun getCapabilityStates(promise: Promise) {
        runCatching { registry.states() }
            .onSuccess { states -> promise.resolve(states.toWritableArray()) }
            .onFailure { error ->
                promise.reject("permission_read_failed", error.message ?: "Could not read permissions")
            }
    }

    /** Whether onboarding can complete: the required tier, and nothing else. */
    @ReactMethod
    fun areRequiredCapabilitiesGranted(promise: Promise) {
        runCatching { registry.requiredCapabilitiesGranted() }
            .onSuccess { promise.resolve(it) }
            .onFailure { error ->
                promise.reject("permission_read_failed", error.message ?: "Could not read permissions")
            }
    }

    // --- requesting -------------------------------------------------------

    /**
     * Requests a capability.
     *
     * Resolves with what happened, as a string rather than a boolean, because the four outcomes
     * need four different responses from the UI:
     *
     * - `granted` - nothing to do, it already was or the prompt succeeded.
     * - `denied` - the user said no to a runtime prompt.
     * - `settings_opened` - the user is now in Settings. **There is no result coming.** The UI must
     *   re-read state when the app resumes; anything that awaits a grant here waits forever.
     * - `unsupported` - cannot be requested on this device or build.
     */
    @ReactMethod
    fun requestCapability(
        id: String,
        promise: Promise,
    ) {
        val capability = SensitiveCapability.fromId(id)
        if (capability == null) {
            promise.reject("unknown_capability", "There is no capability called '$id'")
            return
        }

        when (val request = registry.requestFor(capability)) {
            is CapabilityRequest.AlreadyGranted -> promise.resolve(RESULT_GRANTED)

            is CapabilityRequest.OpenSettings -> {
                val opened = openSettings(request.action)
                promise.resolve(if (opened) RESULT_SETTINGS_OPENED else RESULT_UNSUPPORTED)
            }

            is CapabilityRequest.RuntimePrompt -> requestRuntimePermission(capability, request.permission, promise)

            is CapabilityRequest.SessionConsent ->
                // MediaProjection consent has its own flow on AutomationModule, because it needs the
                // activity-result plumbing that module already owns. Reporting it rather than
                // duplicating it keeps one consent path.
                promise.resolve(RESULT_SESSION_CONSENT)

            is CapabilityRequest.Unsupported -> promise.resolve(RESULT_UNSUPPORTED)
        }
    }

    /**
     * Opens the settings page for a capability, without requesting anything.
     *
     * Used by the permissions overview, where the user is reviewing rather than being asked - and
     * where the destination should be the same page whether or not the permission is already on.
     */
    @ReactMethod
    fun openSettingsFor(
        id: String,
        promise: Promise,
    ) {
        val capability = SensitiveCapability.fromId(id)
        if (capability == null) {
            promise.reject("unknown_capability", "There is no capability called '$id'")
            return
        }

        val action = registry.stateOf(capability).settingsAction
        if (action == null) {
            promise.resolve(false)
            return
        }

        promise.resolve(openSettings(action))
    }

    /** Opens this app's own settings page, the fallback when a specific screen cannot be reached. */
    @ReactMethod
    fun openAppSettings(promise: Promise) {
        val intent =
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", reactContext.packageName, null)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

        promise.resolve(startIntent(intent))
    }

    /**
     * Re-reads state and emits the change event.
     *
     * Called when the app resumes. This is the other half of a settings grant: there is no callback,
     * so the app has to look again at the moment the user comes back.
     */
    @ReactMethod
    fun refresh(promise: Promise) {
        runCatching { registry.states() }
            .onSuccess { states ->
                emitStates(states)
                promise.resolve(states.toWritableArray())
            }.onFailure { error ->
                promise.reject("permission_read_failed", error.message ?: "Could not read permissions")
            }
    }

    // --- events -----------------------------------------------------------

    @ReactMethod
    fun addListener(eventName: String) = Unit

    @ReactMethod
    fun removeListeners(count: Int) = Unit

    // --- internals --------------------------------------------------------

    private fun requestRuntimePermission(
        capability: SensitiveCapability,
        permission: String,
        promise: Promise,
    ) {
        val activity = currentActivity as? PermissionAwareActivity
        if (activity == null) {
            promise.reject(
                "no_activity",
                "A runtime permission needs a foreground activity to show the system dialog",
            )
            return
        }

        // A second request while one is outstanding would orphan the first promise, leaving a JS
        // caller awaiting forever.
        if (pendingPrompt != null) {
            promise.reject("request_in_progress", "Another permission request is already in progress")
            return
        }

        pendingPrompt = PendingPrompt(capability, promise)

        runCatching {
            activity.requestPermissions(arrayOf(permission), PERMISSION_REQUEST_CODE, this)
        }.onFailure { error ->
            pendingPrompt = null
            promise.reject("request_failed", error.message ?: "Could not show the permission dialog")
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<String>,
        grantResults: IntArray,
    ): Boolean {
        if (requestCode != PERMISSION_REQUEST_CODE) return false

        val pending = pendingPrompt ?: return false
        pendingPrompt = null

        // The platform's grantResults are not consulted. Re-reading through the gate is the same
        // check every other caller uses, so a "granted" here cannot disagree with what the rest of
        // the app sees - which is the sort of inconsistency that produces a feature that believes it
        // has a permission it does not.
        val granted = registry.stateOf(pending.capability).granted

        pending.promise.resolve(if (granted) RESULT_GRANTED else RESULT_DENIED)
        emitStates(registry.states())

        return true
    }

    private fun openSettings(action: String): Boolean {
        val intent =
            Intent(action).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

                // Some pages accept a package hint and land directly on this app's row; the ones
                // that ignore it are unharmed by its presence.
                if (action in PACKAGE_SCOPED_ACTIONS) {
                    data = Uri.fromParts("package", reactContext.packageName, null)
                }
            }

        return startIntent(intent)
    }

    private fun startIntent(intent: Intent): Boolean =
        runCatching {
            val activity: Activity? = currentActivity

            if (activity != null) {
                activity.startActivity(intent)
            } else {
                // No activity: the overlay can request a permission while the app is backgrounded.
                reactContext.startActivity(intent)
            }
            true
        }.getOrDefault(false)

    private fun emitStates(states: List<CapabilityState>) {
        runCatching {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT_CAPABILITIES_CHANGED, states.toWritableArray())
        }
    }

    /**
     * State plus copy, flattened for the bridge.
     *
     * A map per capability rather than a JSON string, because this is a small fixed shape the bridge
     * handles natively - unlike the UI tree, where JSON avoids a codegen limitation.
     */
    private fun List<CapabilityState>.toWritableArray(): WritableArray =
        WritableNativeArray().also { array ->
            for (state in this) {
                array.pushMap(
                    WritableNativeMap().apply {
                        putString("id", state.id)
                        putString("tier", state.tier.name.lowercase())
                        putString("grant", state.grant.name.lowercase())
                        putBoolean("granted", state.granted)
                        putString("title", state.title)
                        putString("explanation", state.explanation)
                        putString("consequenceIfDenied", state.consequenceIfDenied)
                        putBoolean("requiresSettingsVisit", state.requiresSettingsVisit)
                    },
                )
            }
        }

    companion object {
        const val NAME = "Permissions"

        const val EVENT_CAPABILITIES_CHANGED = "capabilitiesChanged"

        private const val PERMISSION_REQUEST_CODE = 0x9001

        const val RESULT_GRANTED = "granted"
        const val RESULT_DENIED = "denied"
        const val RESULT_SETTINGS_OPENED = "settings_opened"
        const val RESULT_SESSION_CONSENT = "session_consent"
        const val RESULT_UNSUPPORTED = "unsupported"

        /**
         * Settings pages that can be scoped to one app with a package URI.
         *
         * Named rather than applied to every action, because the pages that ignore the data URI are fine
         * with it while a few refuse to open at all — the accessibility and assistant lists among them, so
         * a blanket hint would break the two most important grants.
         */
        private val PACKAGE_SCOPED_ACTIONS =
            setOf(
                "android.settings.action.MANAGE_OVERLAY_PERMISSION",
                "android.settings.REQUEST_SCHEDULE_EXACT_ALARM",
                // Without the package this lands on the device-wide "Modify system settings" list and the
                // user has to find this app in it.
                "android.settings.action.MANAGE_WRITE_SETTINGS",
            )
    }
}
