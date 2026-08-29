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
 * Hosts the **agent status overlay** in a real `WindowManager` window.
 *
 * A second overlay beside the node toolset, and deliberately not the same class. The differences are
 * not cosmetic:
 *
 * - **It is bound to a run id, not a node id.** The toolset configures one node; this one reports one
 *   run. An overlay bound to the wrong thing is worse than no overlay.
 * - **It survives the app.** The toolset is opened from a screen and dismissed when that screen is
 *   done. This one exists for as long as a run does, which may be long after every screen is gone
 *   (ADR 0016).
 * - **The two must never coexist.** They belong to different modes and would fight for the same corner
 *   of the screen. `OverlayExclusivity` arbitrates.
 *
 * ## Every window call runs on the UI thread
 *
 * `addView` creates a `ViewRootImpl` owned by **the thread that called it**, and every later mount from
 * React's UI thread then throws `CalledFromWrongThreadException`. Device testing found exactly that: the
 * overlay appeared, its buttons did not respond, and expanding it three or four times killed the app
 * with `Only the original thread that created a view hierarchy can touch its views`.
 *
 * A `@ReactMethod` runs on the **native modules thread**, so the calls have to be posted. `runOnUiThread`
 * executes inline when already on the UI thread, so this is not a source of extra latency - and it means
 * the manager is safe to call from either side.
 *
 * `SYSTEM_ALERT_WINDOW` is high-trust: a window over other apps can mislead a user about what they are
 * tapping. Permission is checked **live on every show** rather than cached, and a denial is never worked
 * around (`conventions/Permission_Model.md`).
 *
 * @param viewFactory supplies the content view, given the run id. Injected so this class knows nothing
 *   about React Native.
 * @param onDetached called when the window goes away, so the RN side can release its surface rather
 *   than leaking one per run.
 */
class AgentStatusOverlayManager(
    private val context: Context,
    private val geometry: AgentOverlayGeometry,
    private val viewFactory: (runId: String) -> View,
    private val onDetached: (runId: String) -> Unit = {},
    /**
     * How to reach the UI thread.
     *
     * Injected so the lifecycle can be unit-tested off-device, where `Looper.getMainLooper()` does not
     * exist. Production passes React Native's `UiThreadUtil::runOnUiThread`; tests pass a runner that
     * executes inline.
     */
    private val runOnUiThread: (() -> Unit) -> Unit,
) {
    private val windowManager: WindowManager =
        context.getSystemService(Context.WINDOW_SERVICE) as WindowManager

    @Volatile
    private var view: View? = null

    @Volatile
    private var spec: OverlayWindowSpec? = null

    @Volatile
    private var runId: String? = null

    val isShowing: Boolean get() = view != null

    /** Run the visible overlay is reporting, or null when nothing is shown. */
    val boundRunId: String? get() = runId

    val currentSpec: OverlayWindowSpec? get() = spec

    /** A consistent snapshot, so a caller never reads a state that never existed. */
    val state: OverlayState
        get() =
            if (view == null) {
                OverlayState.HIDDEN
            } else {
                OverlayState(
                    isShowing = true,
                    boundNodeId = runId,
                    layout = spec?.layout,
                    spec = spec,
                )
            }

    fun hasOverlayPermission(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(context)
        } else {
            true
        }

    /**
     * Shows the status overlay for [runId].
     *
     * Showing while already visible for the **same** run is a no-op rather than a rebuild: the status
     * updates through React state, and tearing the window down on every step would flicker and lose the
     * expanded layout the user chose.
     *
     * Returns the state as it was **before** the UI-thread work when called from another thread, because
     * the window cannot be created synchronously from there. Callers use the `getState` bridge method
     * afterwards rather than the return value.
     */
    fun show(
        runId: String,
        layout: OverlayLayout = OverlayLayout.COMPACT,
    ): OverlayResult {
        if (runId.isBlank()) return OverlayResult.Failed(OverlayFailure.NO_BOUND_NODE)

        if (!hasOverlayPermission()) {
            Log.w(TAG, "Overlay permission not granted; refusing to show the agent status overlay")
            return OverlayResult.Failed(OverlayFailure.PERMISSION_DENIED)
        }

        if (isShowing && this.runId == runId) return OverlayResult.Shown(state)

        var failure: OverlayFailure? = null

        runOnUiThread {
            // A different run replaces the window: two status overlays would leave the user unsure which
            // run the stop button belongs to.
            if (isShowing) hideOnUiThread()

            val windowSpec = geometry.specFor(layout)

            runCatching {
                val content = viewFactory(runId)
                windowManager.addView(content, windowSpec.toLayoutParams())
                this.view = content
                this.spec = windowSpec
                this.runId = runId
            }.onFailure { error ->
                Log.e(TAG, "Failed to add the agent status overlay window", error)
                clearState()
                failure = OverlayFailure.WINDOW_REJECTED
            }
        }

        return failure?.let { OverlayResult.Failed(it) } ?: OverlayResult.Shown(state)
    }

    /**
     * Collapses to the strip, or expands into the chat panel.
     *
     * Expanding also **makes the window focusable**, which is what lets the panel's text box accept
     * input - see [toLayoutParams].
     */
    fun setLayout(layout: OverlayLayout): OverlayResult {
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
                Log.e(TAG, "Failed to change the agent overlay layout", error)
                failure = OverlayFailure.WINDOW_REJECTED
            }
        }

        return failure?.let { OverlayResult.Failed(it) } ?: OverlayResult.Shown(state)
    }

    /** Moves the strip, clamped on screen. The user drags it to uncover something beneath. */
    fun moveTo(
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
                Log.e(TAG, "Failed to move the agent overlay", error)
                failure = OverlayFailure.WINDOW_REJECTED
            }
        }

        return failure?.let { OverlayResult.Failed(it) } ?: OverlayResult.Shown(state)
    }

    fun hide() {
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
        val detachedRun = runId

        // Removal can throw if the window is already gone - a process restart, or the user revoking the
        // permission. Losing the view reference matters more than the exception, so state is cleared
        // either way.
        runCatching { windowManager.removeView(content) }
            .onFailure { Log.w(TAG, "Agent overlay window was already removed", it) }

        clearState()

        // After clearing, so a listener that re-shows cannot be clobbered by the cleanup of the window
        // it replaced.
        if (detachedRun != null) onDetached(detachedRun)
    }

    private fun clearState() {
        view = null
        spec = null
        runId = null
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

            // Focusability depends on the layout, and this is the fix for a text box that could not be
            // typed into.
            //
            // FLAG_NOT_FOCUSABLE means the window never receives focus, so no view inside it can be
            // focused either - and FLAG_ALT_FOCUSABLE_IM does not help, since it only governs how the IME
            // behaves *once* a window has focus. The collapsed strip must stay non-focusable: the agent
            // is actively tapping the app underneath and an overlay stealing focus would interfere with
            // the automation it is reporting on. The expanded panel exists to be typed into, so it takes
            // focus for as long as it is open.
            flags =
                if (layout == OverlayLayout.EXPANDED) {
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                } else {
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                        WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM or
                        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                }

            format = PixelFormat.TRANSLUCENT

            // Adjust rather than pan: panning would slide the panel off screen when the keyboard opens,
            // which is exactly when the user needs to see it.
            @Suppress("DEPRECATION")
            softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
        }

    private companion object {
        const val TAG = "AgentStatusOverlay"
    }
}
