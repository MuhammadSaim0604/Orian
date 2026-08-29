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
 * - **The two must never coexist.** They belong to different modes and would fight for the same
 *   corner of the screen. Exclusivity is enforced by whoever owns both managers, since neither can see
 *   the other from here.
 *
 * `SYSTEM_ALERT_WINDOW` is high-trust: a window over other apps can mislead a user about what they are
 * tapping. So permission is checked **live on every show** rather than cached, and a denial is never
 * worked around (`conventions/Permission_Model.md`).
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
) {
    private val windowManager: WindowManager =
        context.getSystemService(Context.WINDOW_SERVICE) as WindowManager

    private var view: View? = null
    private var spec: OverlayWindowSpec? = null
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

        // A different run replaces the window: two status overlays would leave the user unsure which
        // run the stop button belongs to.
        if (isShowing) hide()

        val windowSpec = geometry.specFor(layout)
        val content = viewFactory(runId)

        return runCatching {
            windowManager.addView(content, windowSpec.toLayoutParams())
            this.view = content
            this.spec = windowSpec
            this.runId = runId
            OverlayResult.Shown(state) as OverlayResult
        }.getOrElse { error ->
            Log.e(TAG, "Failed to add the agent status overlay window", error)
            clearState()
            OverlayResult.Failed(OverlayFailure.WINDOW_REJECTED)
        }
    }

    /** Collapses to the strip, or expands into the chat panel. */
    fun setLayout(layout: OverlayLayout): OverlayResult {
        val content = view ?: return OverlayResult.Failed(OverlayFailure.NOT_SHOWING)
        val current = spec ?: return OverlayResult.Failed(OverlayFailure.NOT_SHOWING)

        val updated = geometry.applyLayout(current, layout)

        return runCatching {
            windowManager.updateViewLayout(content, updated.toLayoutParams())
            spec = updated
            OverlayResult.Shown(state) as OverlayResult
        }.getOrElse { error ->
            Log.e(TAG, "Failed to change the agent overlay layout", error)
            OverlayResult.Failed(OverlayFailure.WINDOW_REJECTED)
        }
    }

    /** Moves the strip, clamped on screen. The user drags it to uncover something beneath. */
    fun moveTo(
        x: Int,
        y: Int,
    ): OverlayResult {
        val content = view ?: return OverlayResult.Failed(OverlayFailure.NOT_SHOWING)
        val current = spec ?: return OverlayResult.Failed(OverlayFailure.NOT_SHOWING)

        val moved = geometry.moveWithinScreen(current, OverlayPoint(x, y))

        return runCatching {
            windowManager.updateViewLayout(content, moved.toLayoutParams())
            spec = moved
            OverlayResult.Shown(state) as OverlayResult
        }.getOrElse { error ->
            Log.e(TAG, "Failed to move the agent overlay", error)
            OverlayResult.Failed(OverlayFailure.WINDOW_REJECTED)
        }
    }

    fun hide() {
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

            // NOT_FOCUSABLE keeps touch focus with the app underneath. This matters more here than for
            // the toolset: the agent is actively tapping that app, and an overlay that stole focus
            // would interfere with the very automation it is reporting on.
            //
            // ALT_FOCUSABLE_IM is paired with it so the keyboard can still open for the expanded
            // panel's text box - without it the user could never type a follow-up instruction.
            flags =
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS

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
