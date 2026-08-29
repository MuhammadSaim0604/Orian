package com.mobileautomation.overlays

import android.content.Context
import android.graphics.PixelFormat
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager

/**
 * Hosts the floating node toolset in a real `WindowManager` window.
 *
 * `SYSTEM_ALERT_WINDOW` is a high-trust permission: a window drawn over other apps can mislead the user
 * about what they are tapping. So this class refuses to do anything unless the permission is actually
 * granted, checks on every call rather than caching, and never attempts to work around a denial
 * (`conventions/Permission_Model.md`).
 *
 * ## Every window call runs on the UI thread
 *
 * `addView` creates a `ViewRootImpl` owned by **the thread that called it**, and every later mount from
 * React's UI thread then throws `CalledFromWrongThreadException` - `Only the original thread that
 * created a view hierarchy can touch its views`. A `@ReactMethod` runs on the **native modules thread**,
 * so calling straight through produced an overlay whose buttons did not respond and which crashed the
 * app after a few interactions. That is issue C5, found on a device with the agent overlay and fixed
 * here at the same time because both overlays had it.
 *
 * `runOnUiThread` executes inline when already on the UI thread, so this costs nothing when called from
 * the right place and makes the manager safe to call from either.
 *
 * @param viewFactory supplies the content view. Returns a React Native root view in production; keeping
 *   it injected means this class knows nothing about RN.
 * @param onDetached called when the window goes away, so the RN side can release its root view rather
 *   than leaking one per overlay session.
 * @param runOnUiThread how to reach the UI thread. Injected so the lifecycle is unit-testable off-device,
 *   where there is no main looper; tests pass a runner that executes inline.
 */
class WindowManagerOverlayManager(
    private val context: Context,
    private val geometry: OverlayGeometry,
    private val viewFactory: (nodeId: String) -> View,
    private val onDetached: (nodeId: String) -> Unit = {},
    private val runOnUiThread: (() -> Unit) -> Unit,
) : OverlayManager {
    private val windowManager: WindowManager =
        context.getSystemService(Context.WINDOW_SERVICE) as WindowManager

    @Volatile
    private var view: View? = null

    @Volatile
    private var spec: OverlayWindowSpec? = null

    @Volatile
    private var nodeId: String? = null

    override val isShowing: Boolean
        get() = view != null

    override val boundNodeId: String?
        get() = nodeId

    override val currentSpec: OverlayWindowSpec?
        get() = spec

    override val state: OverlayState
        get() =
            if (view == null) {
                OverlayState.HIDDEN
            } else {
                OverlayState(
                    isShowing = true,
                    boundNodeId = nodeId,
                    layout = spec?.layout,
                    spec = spec,
                )
            }

    /**
     * Whether the user has granted "display over other apps".
     *
     * Checked live on every show: the user can revoke it in Settings while the app runs, and a stale
     * cached value would mean attempting a window the system will reject.
     */
    fun hasOverlayPermission(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(context)
        } else {
            true
        }

    override fun show(
        nodeId: String,
        layout: OverlayLayout,
    ): OverlayResult {
        // An unbound overlay would leave the AI guessing which node it is configuring, so this is
        // refused rather than shown with a placeholder.
        if (nodeId.isBlank()) return OverlayResult.Failed(OverlayFailure.NO_BOUND_NODE)

        if (!hasOverlayPermission()) {
            Log.w(TAG, "Overlay permission not granted; refusing to show overlay")
            return OverlayResult.Failed(OverlayFailure.PERMISSION_DENIED)
        }

        var failure: OverlayFailure? = null

        runOnUiThread {
            // Showing for a different node replaces the window rather than stacking: two overlays would
            // leave the AI unsure which node is being configured.
            if (isShowing) hideOnUiThread()

            val windowSpec = geometry.specFor(layout)

            runCatching {
                val content = viewFactory(nodeId)
                windowManager.addView(content, windowSpec.toLayoutParams())
                this.view = content
                this.spec = windowSpec
                this.nodeId = nodeId
            }.onFailure { error ->
                Log.e(TAG, "Failed to add overlay window", error)
                clearState()
                failure = OverlayFailure.WINDOW_REJECTED
            }
        }

        return failure?.let { OverlayResult.Failed(it) } ?: OverlayResult.Shown(state)
    }

    override fun setLayout(layout: OverlayLayout): OverlayResult {
        if (!isShowing) return OverlayResult.Failed(OverlayFailure.NOT_SHOWING)

        var failure: OverlayFailure? = null

        runOnUiThread {
            val content = view
            val current = spec

            if (content == null || current == null) {
                failure = OverlayFailure.NOT_SHOWING
                return@runOnUiThread
            }

            val updated = geometry.applyLayout(current, layout)

            runCatching {
                windowManager.updateViewLayout(content, updated.toLayoutParams())
                spec = updated
            }.onFailure { error ->
                Log.e(TAG, "Failed to change overlay layout", error)
                failure = OverlayFailure.WINDOW_REJECTED
            }
        }

        return failure?.let { OverlayResult.Failed(it) } ?: OverlayResult.Shown(state)
    }

    override fun moveTo(
        x: Int,
        y: Int,
    ): OverlayResult {
        if (!isShowing) return OverlayResult.Failed(OverlayFailure.NOT_SHOWING)

        var failure: OverlayFailure? = null

        runOnUiThread {
            val content = view
            val current = spec

            if (content == null || current == null) {
                failure = OverlayFailure.NOT_SHOWING
                return@runOnUiThread
            }

            val moved = geometry.moveWithinScreen(current, OverlayPoint(x, y))

            runCatching {
                windowManager.updateViewLayout(content, moved.toLayoutParams())
                spec = moved
            }.onFailure { error ->
                Log.e(TAG, "Failed to move overlay", error)
                failure = OverlayFailure.WINDOW_REJECTED
            }
        }

        return failure?.let { OverlayResult.Failed(it) } ?: OverlayResult.Shown(state)
    }

    override fun hide() {
        if (!isShowing) return

        runOnUiThread { hideOnUiThread() }
    }

    /**
     * The actual removal, assumed to be on the UI thread.
     *
     * Separate from [hide] so `show` can replace a window without a second thread hop - posting from
     * inside a posted block would run the removal *after* the addition and take down the new window.
     */
    private fun hideOnUiThread() {
        val content = view ?: return
        val detachedNode = nodeId

        // Removal can throw if the window is already gone (process restart, user revoked the
        // permission). Losing the view reference matters more than the exception, so state is cleared
        // either way.
        runCatching { windowManager.removeView(content) }
            .onFailure { Log.w(TAG, "Overlay window was already removed", it) }

        clearState()

        // After clearing, so a listener that re-shows cannot be clobbered by the cleanup of the window
        // it replaced.
        if (detachedNode != null) onDetached(detachedNode)
    }

    private fun clearState() {
        view = null
        spec = null
        nodeId = null
    }

    private fun OverlayWindowSpec.toLayoutParams(): WindowManager.LayoutParams =
        WindowManager.LayoutParams().apply {
            width = size.widthPx
            height = size.heightPx
            x = position.x
            y = position.y
            gravity = Gravity.TOP or Gravity.START

            type =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                } else {
                    @Suppress("DEPRECATION")
                    WindowManager.LayoutParams.TYPE_PHONE
                }

            // The toolset exists to be typed into - the user describes what a node should do - so the
            // expanded layout takes focus. FLAG_NOT_FOCUSABLE means the window never receives focus at
            // all, and no view inside a non-focusable window can be focused either; FLAG_ALT_FOCUSABLE_IM
            // does not rescue that, since it only governs IME behaviour *once* a window has focus. The
            // compact layout stays non-focusable so it does not steal touches meant for the app being
            // inspected.
            flags =
                if (layout == OverlayLayout.EXPANDED) {
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                } else {
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                        WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM or
                        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                }

            format = PixelFormat.TRANSLUCENT

            // Adjust rather than pan: panning would slide the toolset off screen when the keyboard opens,
            // which is exactly when the user needs to see it.
            //
            // Deprecated for activity windows in favour of insets listeners, but this is a WindowManager
            // overlay - it has no decor view to fit insets against, so the flag remains the mechanism
            // that applies here.
            @Suppress("DEPRECATION")
            softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
        }

    private companion object {
        const val TAG = "OverlayManager"
    }
}
