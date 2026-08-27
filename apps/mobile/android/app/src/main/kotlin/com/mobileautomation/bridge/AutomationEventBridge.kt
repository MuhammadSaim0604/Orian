package com.mobileautomation.bridge

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.mobileautomation.accessibility.service.AccessibilityConnection

/**
 * Streams native events to JS.
 *
 * Two things genuinely need pushing rather than polling: the UI tree while the
 * user demonstrates something (Phase 9's recorder needs every screen change, and
 * polling would miss fast transitions), and automation availability, so a running
 * workflow aborts the moment the user revokes accessibility instead of failing on
 * its next step.
 *
 * UI-tree streaming is **off by default**. Content-change events fire continuously
 * on animated screens, and emitting a full tree each time would flood the bridge
 * for no benefit - most callers read the tree on demand.
 */
object AutomationEventBridge {
    private const val TAG = "AutomationEvents"
    private const val EVENT_UI_TREE_CHANGED = "automationUiTreeChanged"
    private const val EVENT_STATUS_CHANGED = "automationStatusChanged"

    /** Floor on emission frequency, so a busy screen cannot saturate the bridge. */
    private const val MIN_THROTTLE_MS = 100L

    @Volatile
    private var reactContext: ReactApplicationContext? = null

    @Volatile
    private var uiTreeThrottleMs: Long? = null

    @Volatile
    private var lastEmitAtMs: Long = 0L

    private val handler = Handler(Looper.getMainLooper())

    private val connectionListener: (Boolean) -> Unit = { connected ->
        emitStatusChanged(connected)
    }

    private val screenChangeListener: (String) -> Unit = { reason ->
        onScreenChanged(reason)
    }

    @Volatile
    private var listeningToConnection = false

    /** Binds to the React context. Safe to call repeatedly. */
    fun attach(context: ReactApplicationContext) {
        reactContext = context

        if (!listeningToConnection) {
            AccessibilityConnection.addConnectionListener(connectionListener)
            AccessibilityConnection.addScreenChangeListener(screenChangeListener)
            listeningToConnection = true
        }
    }

    /** Releases the context and stops listening. Called when the module is torn down. */
    fun detach() {
        if (listeningToConnection) {
            AccessibilityConnection.removeConnectionListener(connectionListener)
            AccessibilityConnection.removeScreenChangeListener(screenChangeListener)
            listeningToConnection = false
        }
        uiTreeThrottleMs = null
        reactContext = null
    }

    val isStreamingUiTree: Boolean get() = uiTreeThrottleMs != null

    fun startUiTreeUpdates(throttleMs: Long) {
        uiTreeThrottleMs = throttleMs.coerceAtLeast(MIN_THROTTLE_MS)
        Log.i(TAG, "UI tree streaming on at ${uiTreeThrottleMs}ms")
    }

    fun stopUiTreeUpdates() {
        uiTreeThrottleMs = null
        Log.i(TAG, "UI tree streaming off")
    }

    /**
     * Called by the accessibility service when the screen changes.
     *
     * Reads the tree only when streaming is on and the throttle window has passed:
     * walking a hierarchy is not free, so the cheap checks come first.
     */
    fun onScreenChanged(reason: String) {
        val throttle = uiTreeThrottleMs ?: return
        val context = reactContext ?: return

        val now = System.currentTimeMillis()
        if (now - lastEmitAtMs < throttle) return
        lastEmitAtMs = now

        val reader = AccessibilityConnection.readerOrNull() ?: return

        // Off the caller's thread: this runs on the accessibility service's event
        // callback, and blocking it would delay every later event.
        handler.post {
            val tree = runCatching { reader.captureUiTree() }.getOrNull() ?: return@post

            val payload =
                buildString {
                    append("{\"tree\":")
                    append(BridgeResults.uiTreeToJson(tree, compact = true))
                    append(",\"reason\":\"")
                    append(reason)
                    append("\"}")
                }

            emit(context, EVENT_UI_TREE_CHANGED, payload)
        }
    }

    private fun emitStatusChanged(connected: Boolean) {
        val context = reactContext ?: return

        val payload =
            BridgeResults.statusToJson(
                isReady = connected,
                canCaptureScreen = false,
                canDrawOverlay = false,
            )

        emit(context, EVENT_STATUS_CHANGED, payload)
    }

    private fun emit(
        context: ReactApplicationContext,
        eventName: String,
        payload: String,
    ) {
        // The catch-all here covers failure modes that are all normal during
        // development reloads - context torn down, JS bundle reloading, emitter not
        // yet registered - so a failed emit must never crash the app.
        runCatching {
            if (!context.hasActiveReactInstance()) return
            context
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, payload)
        }.onFailure { error ->
            Log.w(TAG, "Could not emit $eventName", error)
        }
    }
}
