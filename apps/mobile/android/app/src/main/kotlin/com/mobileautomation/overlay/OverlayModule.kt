package com.mobileautomation.overlay

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.util.DisplayMetrics
import android.view.WindowManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.mobileautomation.overlays.Density
import com.mobileautomation.overlays.OverlayExclusivity
import com.mobileautomation.overlays.OverlayFailure
import com.mobileautomation.overlays.OverlayGeometry
import com.mobileautomation.overlays.OverlayLayout
import com.mobileautomation.overlays.OverlayResult
import com.mobileautomation.overlays.WindowManagerOverlayManager

/**
 * The Configure-with-AI overlay, exposed to React Native.
 *
 * The overlay is a `WindowManager` window rather than a React Native modal, and that is the whole
 * point of the feature: a modal disappears the moment the user switches to WhatsApp, which is
 * exactly when they need the toolset. Only `SYSTEM_ALERT_WINDOW` survives leaving the app.
 *
 * Everything about the window lives in `android/overlays`; this module is the bridge boundary. It
 * translates typed failures into promise rejections with distinct codes, because the UI has to
 * respond differently to a permission denial than to a rejected window.
 */
class OverlayModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    private val host = OverlayReactHost(reactContext)

    /**
     * Created lazily, because the geometry needs display metrics and those are not available
     * until there is a window - which there is not when the module is constructed.
     */
    private val manager: WindowManagerOverlayManager by lazy {
        WindowManagerOverlayManager(
            context = reactContext,
            geometry = measureScreen(),
            viewFactory = { nodeId -> host.createView(nodeId) },
            onDetached = { nodeId ->
                host.release()
                OverlayExclusivity.release(OverlayExclusivity.Kind.NODE_TOOLSET)
                emit(EVENT_DISMISSED, WritableNativeMap().apply { putString("nodeId", nodeId) })
            },
            // Every WindowManager call has to be on the UI thread: addView binds the resulting
            // ViewRootImpl to the calling thread, and a @ReactMethod runs on the native modules thread -
            // which is what made this overlay unresponsive and then crashed it (issue C5).
            runOnUiThread = { block -> UiThreadUtil.runOnUiThread(block) },
        ).also { created ->
            // Registered so the agent status overlay can evict this window rather than stacking on it
            // (Step 3). The two belong to different modes and must never both be visible.
            OverlayExclusivity.registerEvictor(OverlayExclusivity.Kind.NODE_TOOLSET) { created.hide() }
        }
    }
    override fun getName(): String = NAME

    override fun invalidate() {
        // The window outlives the React context otherwise: it is owned by WindowManager, not by
        // the activity, so a reload would leave an orphaned overlay nothing can dismiss.
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
     * Opens the system settings page for the overlay permission.
     *
     * There is no runtime prompt for `SYSTEM_ALERT_WINDOW` - it can only be granted in Settings,
     * so the best the app can do is take the user directly there rather than describing where to
     * look.
     */
    @ReactMethod
    fun requestPermission(promise: Promise) {
        runCatching {
            val intent =
                Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:${reactContext.packageName}"),
                ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }

            reactContext.startActivity(intent)
            promise.resolve(null)
        }.onFailure { error ->
            promise.reject("overlay_settings_unavailable", error.message, error)
        }
    }

    /** Shows the overlay bound to [nodeId]. */
    @ReactMethod
    fun show(
        nodeId: String,
        expanded: Boolean,
        promise: Promise,
    ) {
        val layout = if (expanded) OverlayLayout.EXPANDED else OverlayLayout.COMPACT

        // Claimed before showing, which evicts the agent status overlay if a run is in progress. Last
        // one wins deliberately: refusing would tell a user they cannot configure a node because of a
        // window belonging to the other mode.
        OverlayExclusivity.claim(OverlayExclusivity.Kind.NODE_TOOLSET)

        when (val result = manager.show(nodeId, layout)) {
            is OverlayResult.Shown -> promise.resolve(stateMap())
            is OverlayResult.Failed -> {
                // Given back on failure, or a denial here would leave the agent overlay evicted by a
                // window that never appeared.
                OverlayExclusivity.release(OverlayExclusivity.Kind.NODE_TOOLSET)
                promise.reject(codeFor(result.failure), messageFor(result.failure))
            }
        }
    }

    /** The eye toggle. */
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

    /** A consistent snapshot, so JS never reads a state that never existed. */
    @ReactMethod
    fun getState(promise: Promise) {
        promise.resolve(stateMap())
    }

    /** Required by `NativeEventEmitter`; the events themselves are emitted from callbacks. */
    @ReactMethod
    fun addListener(eventName: String) = Unit

    @ReactMethod
    fun removeListeners(count: Int) = Unit

    private fun stateMap(): WritableNativeMap {
        val state = manager.state

        return WritableNativeMap().apply {
            putBoolean("isShowing", state.isShowing)
            putString("boundNodeId", state.boundNodeId)
            putBoolean("expanded", state.layout == OverlayLayout.EXPANDED)
            putInt("x", state.spec?.position?.x ?: 0)
            putInt("y", state.spec?.position?.y ?: 0)
            putInt("widthPx", state.spec?.size?.widthPx ?: 0)
            putInt("heightPx", state.spec?.size?.heightPx ?: 0)
        }
    }

    private fun emit(
        name: String,
        payload: WritableNativeMap,
    ) {
        runCatching {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(name, payload)
        }
        // Failure is ignored deliberately: emitting after the context is torn down is normal
        // during teardown, and throwing here would surface as a crash while dismissing.
    }

    /**
     * Reads the display and system-bar insets.
     *
     * Insets are needed because an overlay that sits under the navigation bar has controls the
     * user cannot reach - and there is no layout pass to discover them from, since the window
     * does not exist yet.
     */
    private fun measureScreen(): OverlayGeometry {
        val windowManager =
            reactContext.getSystemService(android.content.Context.WINDOW_SERVICE) as WindowManager

        val metrics = DisplayMetrics()

        @Suppress("DEPRECATION")
        windowManager.defaultDisplay.getRealMetrics(metrics)

        val resources = reactContext.resources

        val statusBar = dimensionOf(resources, "status_bar_height", DEFAULT_STATUS_BAR_PX)
        val navigationBar = dimensionOf(resources, "navigation_bar_height", DEFAULT_NAV_BAR_PX)

        return OverlayGeometry(
            screenWidthPx = metrics.widthPixels,
            screenHeightPx = metrics.heightPixels,
            // Without this the dp margins and minimum sizes would be read as raw pixels, shrinking the
            // panel as screen density rises.
            density = Density(metrics.density),
            statusBarHeightPx = statusBar,
            navigationBarHeightPx = navigationBar,
        )
    }

    /**
     * Reads a platform dimension by name, falling back to a sensible default.
     *
     * These identifiers are not part of the public API and can be absent on some devices; a
     * missing inset should mean a slightly conservative overlay rather than a crash.
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
            OverlayFailure.NO_BOUND_NODE -> "overlay_no_bound_node"
            OverlayFailure.WINDOW_REJECTED -> "overlay_window_rejected"
            OverlayFailure.NOT_SHOWING -> "overlay_not_showing"
        }

    private fun messageFor(failure: OverlayFailure): String =
        when (failure) {
            OverlayFailure.PERMISSION_DENIED ->
                "Allow \"display over other apps\" to use the floating toolset."
            OverlayFailure.NO_BOUND_NODE ->
                "The overlay must be opened for a specific step."
            OverlayFailure.WINDOW_REJECTED ->
                "The floating window could not be created."
            OverlayFailure.NOT_SHOWING ->
                "The floating toolset is not open."
        }

    companion object {
        const val NAME = "ConfigureOverlay"

        /** Emitted when the window goes away, so the app's UI can stop showing it as open. */
        const val EVENT_DISMISSED = "overlay_dismissed"

        /** Typical values, used only when the platform dimension is unavailable. */
        private const val DEFAULT_STATUS_BAR_PX = 72
        private const val DEFAULT_NAV_BAR_PX = 48
    }
}
