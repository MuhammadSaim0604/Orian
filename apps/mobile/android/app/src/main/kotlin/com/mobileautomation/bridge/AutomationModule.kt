package com.mobileautomation.bridge

import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionManager
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.mobileautomation.accessibility.service.AccessibilityConnection
import com.mobileautomation.automation.service.AutomationForegroundService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * The React Native module: the single crossing point between JS and the Kotlin
 * automation layer.
 *
 * Deliberately thin. Every method parses nothing, formats nothing, and decides
 * nothing - it hands off to [AutomationBridge] and turns the returned
 * [AutomationBridge.Outcome] into a promise settlement. All the logic worth
 * testing lives in the bridge, which needs no `ReactApplicationContext` and is
 * therefore unit-testable off-device.
 *
 * Written against the legacy `ReactContextBaseJavaModule` API rather than a
 * codegen-generated spec base class. Under the new architecture React Native's
 * TurboModule interop layer serves this to `TurboModuleRegistry.get`, so the
 * TypeScript side is unchanged and fully typed by
 * `packages/native-automation/src/spec/NativeAutomation.ts`. The tradeoff is that
 * argument types are checked by the TS spec rather than generated C++ glue;
 * migrating to generated bindings is a mechanical change once the surface settles.
 */
class AutomationModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext),
    ActivityEventListener {
    /**
     * The bridge over the automation runtime.
     *
     * Always present. It used to be nullable and every call was rejected with `accessibility_unavailable`
     * when the service was off - which blocked fourteen tools that do not use accessibility at all. The
     * runtime now degrades per capability instead, so the error reaches only the tools that need it.
     *
     * Looked up per call rather than held: the accessibility service is constructed by the system
     * whenever the user enables it, so a cached runtime would point at a destroyed instance.
     */
    private val bridge: AutomationBridge get() = AutomationRuntimeProvider.bridge(reactContext)

    /**
     * Native calls run here, not on the JS thread.
     *
     * `SupervisorJob` so one failed call does not cancel the scope and silently
     * kill every later call.
     */
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    /** Pending screen-capture consent request, resolved by [onActivityResult]. */
    private var captureConsentPromise: Promise? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = NAME

    override fun invalidate() {
        scope.cancel()
        reactContext.removeActivityEventListener(this)
        AutomationEventBridge.detach()
        super.invalidate()
    }

    // --- status -----------------------------------------------------------

    /**
     * Synchronous on purpose: the UI checks this during render to decide whether to
     * offer a run button, and a promise would make it flash the wrong state.
     */
    @ReactMethod(isBlockingSynchronousMethod = true)
    fun getStatus(): String = bridge.getStatusJson()

    // --- screen reading ---------------------------------------------------

    @ReactMethod
    fun getUiTree(
        compact: Boolean,
        promise: Promise,
    ) = dispatch(promise) { it.getUiTree(compact) }

    @ReactMethod
    fun getCurrentScreen(promise: Promise) = dispatch(promise) { it.getCurrentScreen() }

    @ReactMethod
    fun findElement(
        selectorJson: String,
        promise: Promise,
    ) = dispatch(promise) { it.findElement(selectorJson) }

    @ReactMethod
    fun waitForElement(
        selectorJson: String,
        timeoutMs: Double,
        promise: Promise,
    ) = dispatch(promise) { it.waitForElement(selectorJson, timeoutMs.toLong()) }

    // --- acting on the screen ---------------------------------------------

    @ReactMethod
    fun click(
        selectorJson: String,
        promise: Promise,
    ) = dispatch(promise) { it.click(selectorJson) }

    @ReactMethod
    fun clickAt(
        x: Double,
        y: Double,
        promise: Promise,
    ) = dispatch(promise) { it.clickAt(x.toInt(), y.toInt()) }

    @ReactMethod
    fun longPress(
        selectorJson: String,
        durationMs: Double,
        promise: Promise,
    ) = dispatch(promise) { it.longPress(selectorJson, durationMs.toLong()) }

    @ReactMethod
    fun swipe(
        direction: String,
        distanceFraction: Double,
        promise: Promise,
    ) = dispatch(promise) { it.swipe(direction, distanceFraction) }

    @ReactMethod
    fun swipeBetween(
        fromX: Double,
        fromY: Double,
        toX: Double,
        toY: Double,
        durationMs: Double,
        promise: Promise,
    ) = dispatch(promise) {
        it.swipeBetween(fromX.toInt(), fromY.toInt(), toX.toInt(), toY.toInt(), durationMs.toLong())
    }

    @ReactMethod
    fun typeText(
        selectorJson: String,
        text: String,
        promise: Promise,
    ) = dispatch(promise) { it.typeText(selectorJson, text) }

    @ReactMethod
    fun pressBack(promise: Promise) = dispatch(promise) { it.pressBack() }

    @ReactMethod
    fun pressHome(promise: Promise) = dispatch(promise) { it.pressHome() }

    // --- screen capture ---------------------------------------------------

    @ReactMethod
    fun takeScreenshot(promise: Promise) = dispatch(promise) { it.takeScreenshot() }

    /**
     * Launches the system screen-capture consent dialog.
     *
     * MediaProjection consent is per session and cannot be persisted
     * (`conventions/Permission_Model.md`), so this must be called again after a
     * restart or after the user stops the recording from the notification. The
     * result arrives asynchronously in [onActivityResult].
     */
    @ReactMethod
    fun requestScreenCaptureConsent(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject(
                "tool_failed",
                "Screen capture consent needs a foreground activity to show the system dialog",
            )
            return
        }

        // A second request while one is outstanding would orphan the first promise,
        // leaving a JS caller awaiting forever.
        if (captureConsentPromise != null) {
            promise.reject("invalid_argument", "A screen capture consent request is already in progress")
            return
        }

        val manager =
            activity.getSystemService(android.content.Context.MEDIA_PROJECTION_SERVICE)
                as? MediaProjectionManager
        if (manager == null) {
            promise.reject("tool_failed", "This device does not provide MediaProjection")
            return
        }

        captureConsentPromise = promise
        runCatching {
            activity.startActivityForResult(manager.createScreenCaptureIntent(), CAPTURE_REQUEST_CODE)
        }.onFailure { error ->
            captureConsentPromise = null
            promise.reject("tool_failed", error.message ?: "Could not launch the consent dialog")
        }
    }

    @ReactMethod
    fun releaseScreenCapture(promise: Promise) {
        // The context goes through so the mediaProjection foreground service is stopped with the
        // session - a notification saying the screen can be read must not outlive the ability to read it.
        AutomationRuntimeProvider.releaseScreenCapture(reactContext)
        emitStatusChanged()
        promise.resolve(null)
    }

    override fun onActivityResult(
        activity: Activity?,
        requestCode: Int,
        resultCode: Int,
        data: Intent?,
    ) {
        if (requestCode != CAPTURE_REQUEST_CODE) return

        val promise = captureConsentPromise ?: return
        captureConsentPromise = null

        if (resultCode != Activity.RESULT_OK || data == null) {
            // Declining is a legitimate choice, not an error: resolve false so the
            // caller can degrade rather than treating it as a failure to retry.
            promise.resolve(false)
            return
        }

        // Asynchronous because it has to be: the mediaProjection foreground service must reach the
        // foreground before the projection can be created, and `onStartCommand` is delivered on this very
        // thread - so waiting here would prevent the thing being waited for. The promise settles when the
        // answer is known.
        AutomationRuntimeProvider.attachScreenCapture(reactContext, resultCode, data) { granted ->
            if (granted) {
                promise.resolve(true)
            } else {
                // Rejected rather than resolved false, because at this point the user has already agreed.
                // Resolving false is how declining is reported, and the UI answers that with "the AI will
                // work from screen structure only" - which would be a lie here, and would hide a failure
                // the user can often fix by allowing notifications.
                //
                // `tool_failed` rather than a new code: the error codes are a wire contract mirroring
                // `AutomationError` in android/automation, and inventing one here would drift the two
                // lists. The actionable detail belongs in the message.
                promise.reject(
                    "tool_failed",
                    "Screen recording was allowed but could not start. Check that notifications are " +
                        "enabled for this app, then try again.",
                )
            }

            emitStatusChanged()
        }
    }

    override fun onNewIntent(intent: Intent?) {
        // Nothing to do: the module holds no intent-driven state.
    }

    // --- apps -------------------------------------------------------------

    @ReactMethod
    fun openApp(
        packageName: String,
        promise: Promise,
    ) = dispatch(promise) { it.openApp(packageName) }

    @ReactMethod
    fun openAppByName(
        name: String,
        promise: Promise,
    ) = dispatch(promise) { it.openAppByName(name) }

    @ReactMethod
    fun listApps(
        includeSystem: Boolean,
        promise: Promise,
    ) = dispatch(promise) { it.listApps(includeSystem) }

    // --- device tools -----------------------------------------------------

    @ReactMethod
    fun getContacts(
        limit: Double,
        promise: Promise,
    ) = dispatch(promise) { it.getContacts(limit.toInt()) }

    @ReactMethod
    fun findContacts(
        query: String,
        promise: Promise,
    ) = dispatch(promise) { it.findContacts(query) }

    @ReactMethod
    fun createAlarm(
        requestJson: String,
        promise: Promise,
    ) = dispatch(promise) { it.createAlarm(requestJson) }

    @ReactMethod
    fun readClipboard(promise: Promise) = dispatch(promise) { it.readClipboard() }

    @ReactMethod
    fun writeClipboard(
        text: String,
        promise: Promise,
    ) = dispatch(promise) { it.writeClipboard(text) }

    @ReactMethod
    fun sendNotification(
        title: String,
        body: String,
        promise: Promise,
    ) = dispatch(promise) { it.sendNotification(title, body) }

    @ReactMethod
    fun launchIntent(
        requestJson: String,
        promise: Promise,
    ) = dispatch(promise) { it.launchIntent(requestJson) }

    @ReactMethod
    fun getSystemSetting(
        key: String,
        promise: Promise,
    ) = dispatch(promise) { it.getSystemSetting(key) }

    // --- media ------------------------------------------------------------

    @ReactMethod
    fun controlMedia(
        command: String,
        promise: Promise,
    ) = dispatch(promise) { it.controlMedia(command) }

    @ReactMethod
    fun adjustVolume(
        direction: String,
        promise: Promise,
    ) = dispatch(promise) { it.adjustVolume(direction) }

    // --- foreground service -----------------------------------------------

    @ReactMethod
    fun startAutomationService(
        statusLabel: String,
        promise: Promise,
    ) {
        runCatching { AutomationForegroundService.start(reactContext, statusLabel) }
            .onSuccess { promise.resolve(null) }
            .onFailure { error ->
                promise.reject("tool_failed", error.message ?: "Could not start the automation service")
            }
    }

    @ReactMethod
    fun stopAutomationService(promise: Promise) {
        runCatching { AutomationForegroundService.stop(reactContext) }
            .onSuccess { promise.resolve(null) }
            .onFailure { error ->
                promise.reject("tool_failed", error.message ?: "Could not stop the automation service")
            }
    }

    // --- event channel ----------------------------------------------------

    @ReactMethod
    fun startUiTreeUpdates(
        throttleMs: Double,
        promise: Promise,
    ) {
        AutomationEventBridge.attach(reactContext)
        AutomationEventBridge.startUiTreeUpdates(throttleMs.toLong())
        promise.resolve(null)
    }

    @ReactMethod
    fun stopUiTreeUpdates(promise: Promise) {
        AutomationEventBridge.stopUiTreeUpdates()
        promise.resolve(null)
    }

    /** Required by the RN event emitter contract; subscription is tracked in JS. */
    @ReactMethod
    fun addListener(eventName: String) {
        AutomationEventBridge.attach(reactContext)
    }

    @ReactMethod
    fun removeListeners(count: Double) {
        // No per-listener native state to release.
    }
    // --- helpers ----------------------------------------------------------

    /**
     * Runs a bridge call off the JS thread and settles [promise] with the outcome.
     *
     * The single place a native call can fail, so it is also the single place that
     * has to get error mapping right. An absent runtime rejects with
     * `accessibility_unavailable`, which is exactly what the user needs to fix.
     */
    /**
     * Runs a bridge call and settles [promise] with the outcome.
     *
     * The single place a native call can fail, so it is also the single place that has to get error
     * mapping right.
     *
     * **No accessibility pre-check here.** There used to be one, rejecting everything when the service
     * was off, and it was the reason `takeScreenshot`, `openApp`, `getContacts` and eleven other tools
     * failed with an error about a permission they never needed. Whether a given tool requires the
     * service is the runtime's business, and it already answers correctly per tool.
     */
    private fun dispatch(
        promise: Promise,
        call: suspend (AutomationBridge) -> AutomationBridge.Outcome,
    ) {
        val active = bridge

        scope.launch {
            val outcome =
                runCatching { call(active) }
                    .getOrElse { error ->
                        AutomationBridge.Outcome.Failure(BridgeErrors.toRejection(error))
                    }

            when (outcome) {
                is AutomationBridge.Outcome.Success -> promise.resolve(outcome.json)
                is AutomationBridge.Outcome.Failure ->
                    promise.reject(
                        outcome.rejection.code,
                        outcome.rejection.message,
                    )
            }
        }
    }

    private fun emitStatusChanged() {
        val statusJson = runCatching { getStatus() }.getOrNull() ?: return

        runCatching {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT_STATUS_CHANGED, statusJson)
        }
    }

    companion object {
        const val NAME = "NativeAutomation"
        const val EVENT_STATUS_CHANGED = "automationStatusChanged"

        private const val CAPTURE_REQUEST_CODE = 0xCA97

        /** Whether the accessibility service is connected, for callers outside RN. */
        fun isAccessibilityConnected(): Boolean = AccessibilityConnection.isConnected
    }
}
