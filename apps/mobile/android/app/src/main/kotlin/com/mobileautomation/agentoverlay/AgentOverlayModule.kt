package com.mobileautomation.agentoverlay

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.DisplayMetrics
import android.view.WindowManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.mobileautomation.automation.service.AutomationForegroundService
import com.mobileautomation.overlays.AgentOverlayGeometry
import com.mobileautomation.overlays.AgentStatusOverlayManager
import com.mobileautomation.overlays.Density
import com.mobileautomation.overlays.OverlayExclusivity
import com.mobileautomation.overlays.OverlayFailure
import com.mobileautomation.overlays.OverlayLayout
import com.mobileautomation.overlays.OverlayResult

/**
 * The agent status overlay, exposed to React Native.
 *
 * A real `WindowManager` window rather than a modal, and that is the whole feature: the user leaves the
 * app — which is precisely when an agent run matters — and a modal dies with the activity. Only
 * `SYSTEM_ALERT_WINDOW` survives.
 *
 * Everything about the window lives in `android/overlays`; this is the bridge boundary. It also carries
 * the **stop-from-the-notification** path, because the notification's action is delivered to a service
 * and a service has no route to JavaScript on its own.
 */
class AgentOverlayModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    private val host = AgentOverlayReactHost(reactContext)

    /**
     * Created lazily, because the geometry needs display metrics and those are not available until
     * there is a window — which there is not when the module is constructed.
     */
    private val manager: AgentStatusOverlayManager by lazy {
        AgentStatusOverlayManager(
            context = reactContext,
            geometry = measureScreen(),
            viewFactory = { runId -> host.createView(runId) },
            onDetached = { runId ->
                host.release()
                OverlayExclusivity.release(OverlayExclusivity.Kind.AGENT_STATUS)
                emit(EVENT_DISMISSED, WritableNativeMap().apply { putString("runId", runId) })
            },
            // Every WindowManager call has to be on the UI thread: addView binds the resulting
            // ViewRootImpl to the calling thread, and a @ReactMethod runs on the native modules thread -
            // which is what crashed the overlay with CalledFromWrongThreadException. runOnUiThread runs
            // inline when already there, so this costs nothing on the paths that were already correct.
            runOnUiThread = { block -> UiThreadUtil.runOnUiThread(block) },
        ).also { created ->
            // Registered so the node toolset can evict this window rather than appearing on top of it.
            OverlayExclusivity.registerEvictor(OverlayExclusivity.Kind.AGENT_STATUS) { created.hide() }
        }
    }

    /**
     * Relays the notification's stop action into JavaScript.
     *
     * A broadcast rather than a static module reference: the service already knows how to broadcast, and
     * a receiver registered against the React context is torn down with it. A static instance would
     * outlive a reload and deliver a stop to a dead context.
     */
    private val stopReceiver =
        object : BroadcastReceiver() {
            override fun onReceive(
                context: Context?,
                intent: Intent?,
            ) {
                if (intent?.action != AutomationForegroundService.ACTION_STOP_BROADCAST) return
                emit(EVENT_STOP_REQUESTED, WritableNativeMap())
            }
        }

    init {
        val filter = IntentFilter(AutomationForegroundService.ACTION_STOP_BROADCAST)

        // NOT_EXPORTED from API 33: this is an internal signal from our own service, and an exported
        // receiver would let any app on the device stop the user's automation.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactContext.registerReceiver(stopReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            reactContext.registerReceiver(stopReceiver, filter)
        }
    }

    override fun getName(): String = NAME

    override fun invalidate() {
        runCatching { reactContext.unregisterReceiver(stopReceiver) }

        // The window is owned by WindowManager rather than the activity, so a reload would otherwise
        // leave an orphaned overlay that nothing can dismiss.
        manager.hide()
        host.release()
        super.invalidate()
    }

    /** Whether "display over other apps" has been granted. */
    @ReactMethod
    fun hasPermission(promise: Promise) {
        promise.resolve(manager.hasOverlayPermission())
    }

    /**
     * Shows the status overlay for [runId].
     *
     * Called when a run starts. Failure is reported rather than thrown at the run: an agent that
     * refused to work because it could not draw a status strip would be a worse outcome than one
     * working without it.
     */
    @ReactMethod
    fun show(
        runId: String,
        expanded: Boolean,
        promise: Promise,
    ) {
        val layout = if (expanded) OverlayLayout.EXPANDED else OverlayLayout.COMPACT

        // Claimed before showing: two floating windows would leave the stop button ambiguous, and the
        // two overlays belong to different modes that share no UI (ADR 0011).
        OverlayExclusivity.claim(OverlayExclusivity.Kind.AGENT_STATUS)

        when (val result = manager.show(runId, layout)) {
            is OverlayResult.Shown -> promise.resolve(stateMap())
            is OverlayResult.Failed -> {
                // The claim is given back on failure, or a permission denial here would leave the
                // toolset permanently evicted by a window that never appeared.
                OverlayExclusivity.release(OverlayExclusivity.Kind.AGENT_STATUS)
                promise.reject(codeFor(result.failure), messageFor(result.failure))
            }
        }
    }

    /** Collapses to the strip, or expands into the chat panel. */
    @ReactMethod
    fun setExpanded(
        expanded: Boolean,
        promise: Promise,
    ) {
        val layout = if (expanded) OverlayLayout.EXPANDED else OverlayLayout.COMPACT

        when (val result = manager.setLayout(layout)) {
            is OverlayResult.Shown -> promise.resolve(stateMap())
            is OverlayResult.Failed -> promise.reject(codeFor(result.failure), messageFor(result.failure))
        }
    }

    @ReactMethod
    fun moveTo(
        x: Int,
        y: Int,
        promise: Promise,
    ) {
        when (val result = manager.moveTo(x, y)) {
            is OverlayResult.Shown -> promise.resolve(stateMap())
            is OverlayResult.Failed -> promise.reject(codeFor(result.failure), messageFor(result.failure))
        }
    }

    @ReactMethod
    fun hide(promise: Promise) {
        manager.hide()
        promise.resolve(null)
    }

    @ReactMethod
    fun getState(promise: Promise) {
        promise.resolve(stateMap())
    }

    @ReactMethod
    fun addListener(eventName: String) = Unit

    @ReactMethod
    fun removeListeners(count: Int) = Unit

    private fun stateMap(): WritableMap {
        val state = manager.state

        return WritableNativeMap().apply {
            putBoolean("isShowing", state.isShowing)
            putString("runId", state.boundNodeId)
            putBoolean("expanded", state.layout == OverlayLayout.EXPANDED)
            putInt("x", state.spec?.position?.x ?: 0)
            putInt("y", state.spec?.position?.y ?: 0)
            putInt("widthPx", state.spec?.size?.widthPx ?: 0)
            putInt("heightPx", state.spec?.size?.heightPx ?: 0)
        }
    }

    private fun emit(
        name: String,
        payload: WritableMap,
    ) {
        runCatching {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(name, payload)
        }
        // Failure is ignored deliberately: emitting after the context is torn down is normal during
        // teardown, and throwing here would surface as a crash while dismissing.
    }

    /**
     * Reads the display and system-bar insets.
     *
     * Insets matter because an overlay under the navigation bar has controls the user cannot reach —
     * and there is no layout pass to discover them from, since the window does not exist yet.
     */
    private fun measureScreen(): AgentOverlayGeometry {
        val windowManager =
            reactContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager

        val metrics = DisplayMetrics()

        @Suppress("DEPRECATION")
        windowManager.defaultDisplay.getRealMetrics(metrics)

        val resources = reactContext.resources

        return AgentOverlayGeometry(
            screenWidthPx = metrics.widthPixels,
            screenHeightPx = metrics.heightPixels,
            // Without this every dp constant would be read as a raw pixel, which on a 3x screen made the
            // strip a third of its intended size with a stop button too small to press.
            density = Density(metrics.density),
            statusBarHeightPx = dimensionOf(resources, "status_bar_height", DEFAULT_STATUS_BAR_PX),
            navigationBarHeightPx = dimensionOf(resources, "navigation_bar_height", DEFAULT_NAV_BAR_PX),
        )
    }

    /**
     * Reads a platform dimension by name, falling back to a sensible default.
     *
     * These identifiers are not public API and can be absent on some devices; a missing inset should
     * mean a slightly conservative overlay rather than a crash.
     */
    private fun dimensionOf(
        resources: android.content.res.Resources,
        name: String,
        fallbackPx: Int,
    ): Int {
        val id = resources.getIdentifier(name, "dimen", "android")
        return if (id > 0) resources.getDimensionPixelSize(id) else fallbackPx
    }

    private fun codeFor(failure: OverlayFailure): String =
        when (failure) {
            OverlayFailure.PERMISSION_DENIED -> "overlay_permission_denied"
            OverlayFailure.NO_BOUND_NODE -> "overlay_no_bound_run"
            OverlayFailure.WINDOW_REJECTED -> "overlay_window_rejected"
            OverlayFailure.NOT_SHOWING -> "overlay_not_showing"
        }

    private fun messageFor(failure: OverlayFailure): String =
        when (failure) {
            OverlayFailure.PERMISSION_DENIED ->
                "Allow \"display over other apps\" to see the agent while you use other apps."
            OverlayFailure.NO_BOUND_NODE ->
                "The status overlay must be opened for a specific run."
            OverlayFailure.WINDOW_REJECTED ->
                "The floating window could not be created."
            OverlayFailure.NOT_SHOWING ->
                "The status overlay is not open."
        }

    companion object {
        const val NAME = "AgentOverlay"

        /** Emitted when the window goes away, so the app's UI can stop showing it as open. */
        const val EVENT_DISMISSED = "agent_overlay_dismissed"

        /** Emitted when the notification's stop action was pressed. */
        const val EVENT_STOP_REQUESTED = "agent_stop_requested"

        /** Typical values, used only when the platform dimension is unavailable. */
        private const val DEFAULT_STATUS_BAR_PX = 72
        private const val DEFAULT_NAV_BAR_PX = 48
    }
}
