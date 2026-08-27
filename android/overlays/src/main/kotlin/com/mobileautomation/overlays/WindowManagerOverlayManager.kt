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
 * Hosts the floating overlay in a real `WindowManager` window.
 *
 * `SYSTEM_ALERT_WINDOW` is a high-trust permission: a window drawn over other
 * apps can mislead the user about what they are tapping. So this class refuses to
 * do anything unless the permission is actually granted, checks on every call
 * rather than caching, and never attempts to work around a denial
 * (`conventions/Permission_Model.md`).
 *
 * @param viewFactory supplies the content view. In Phase 8 this returns a React
 *   Native root view; keeping it injected means this class knows nothing about RN.
 */
class WindowManagerOverlayManager(
    private val context: Context,
    private val geometry: OverlayGeometry,
    private val viewFactory: (nodeId: String) -> View,
) : OverlayManager {
    private val windowManager: WindowManager =
        context.getSystemService(Context.WINDOW_SERVICE) as WindowManager

    private var view: View? = null
    private var spec: OverlayWindowSpec? = null
    private var nodeId: String? = null

    override val isShowing: Boolean
        get() = view != null

    override val boundNodeId: String?
        get() = nodeId

    override val currentSpec: OverlayWindowSpec?
        get() = spec

    /**
     * Whether the user has granted "display over other apps".
     *
     * Checked live on every show: the user can revoke it in Settings while the app
     * runs, and a stale cached value would mean attempting a window the system
     * will reject.
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
    ): Boolean {
        if (!hasOverlayPermission()) {
            Log.w(TAG, "Overlay permission not granted; refusing to show overlay")
            return false
        }

        // Showing for a different node replaces the window rather than stacking:
        // two overlays would leave the AI unsure which node is being configured.
        if (isShowing) hide()

        val windowSpec = geometry.specFor(layout)
        val content = viewFactory(nodeId)

        return runCatching {
            windowManager.addView(content, windowSpec.toLayoutParams())
            this.view = content
            this.spec = windowSpec
            this.nodeId = nodeId
            true
        }.getOrElse { error ->
            Log.e(TAG, "Failed to add overlay window", error)
            clearState()
            false
        }
    }

    override fun setLayout(layout: OverlayLayout): Boolean {
        val content = view ?: return false
        val current = spec ?: return false

        val updated = geometry.applyLayout(current, layout)
        return runCatching {
            windowManager.updateViewLayout(content, updated.toLayoutParams())
            spec = updated
            true
        }.getOrElse { error ->
            Log.e(TAG, "Failed to change overlay layout", error)
            false
        }
    }

    override fun moveTo(
        x: Int,
        y: Int,
    ): Boolean {
        val content = view ?: return false
        val current = spec ?: return false

        val moved = geometry.moveWithinScreen(current, OverlayPoint(x, y))
        return runCatching {
            windowManager.updateViewLayout(content, moved.toLayoutParams())
            spec = moved
            true
        }.getOrElse { error ->
            Log.e(TAG, "Failed to move overlay", error)
            false
        }
    }

    override fun hide() {
        val content = view ?: return
        // Removal can throw if the window is already gone (process restart, user
        // revoked the permission). Losing the view reference matters more than
        // the exception, so state is cleared either way.
        runCatching { windowManager.removeView(content) }
            .onFailure { Log.w(TAG, "Overlay window was already removed", it) }
        clearState()
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

            // NOT_FOCUSABLE keeps the keyboard and touch focus with the app
            // underneath, so the overlay never steals input the user meant for the
            // app it is inspecting. The overlay's own views still receive touches.
            flags =
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS

            format = PixelFormat.TRANSLUCENT
        }

    private companion object {
        const val TAG = "OverlayManager"
    }
}
