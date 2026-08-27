package com.mobileautomation.accessibility.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.mobileautomation.accessibility.model.UiTree
import com.mobileautomation.accessibility.parser.AccessibilityNodeSource
import com.mobileautomation.accessibility.parser.UiTreeWalker

/**
 * The accessibility service: the app's only window onto other apps' screens.
 *
 * This is the highest-trust component in the product. It can read the content of
 * every app the user opens, so it does the minimum necessary: it tracks the
 * foreground package/activity and, on request, walks the current hierarchy. It
 * does not log screen content, does not persist anything, and does not act on
 * events on its own initiative.
 *
 * The user enables it manually in system Settings after an in-app rationale
 * screen; there is no way for the app to grant it silently
 * (`conventions/Permission_Model.md`).
 */
class UiAutomationAccessibilityService :
    AccessibilityService(),
    ScreenReader,
    NodeActionPerformer {
    @Volatile
    private var connected: Boolean = false

    @Volatile
    private var lastPackageName: String? = null

    @Volatile
    private var lastActivityName: String? = null

    private val walker = UiTreeWalker()

    override val isAvailable: Boolean
        get() = connected

    override fun onServiceConnected() {
        super.onServiceConnected()

        // Configured in code as well as XML: the XML config is what the system
        // shows the user before they consent, and this keeps the effective
        // configuration explicit and reviewable in one place.
        serviceInfo =
            AccessibilityServiceInfo().apply {
                eventTypes =
                    AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
                    AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
                feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
                flags =
                    AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                    AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS or
                    AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS
                notificationTimeout = EVENT_THROTTLE_MS
            }

        connected = true
        AccessibilityConnection.attach(this)
        Log.i(TAG, "Accessibility service connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        // Only window transitions are tracked, and only the identity of the
        // window - never its content. Screen content is read on demand instead,
        // so nothing sensitive is retained just because the user opened an app.
        if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            lastPackageName = event.packageName?.toString()
            lastActivityName = event.className?.toString()
        }
    }

    override fun onInterrupt() {
        // Required by the platform. Nothing to abandon: this service performs no
        // long-running feedback of its own.
    }

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        markDisconnected()
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        markDisconnected()
        super.onDestroy()
    }

    // --- ScreenReader ------------------------------------------------------

    override fun captureUiTree(): UiTree? {
        if (!connected) return null

        // Null on secure windows and transiently during activity transitions,
        // which is normal rather than an error.
        val root = rootInActiveWindow ?: return null

        val source = AccessibilityNodeSource(root)
        return try {
            val result = walker.walk(source)
            if (result.wasTruncated) {
                Log.w(
                    TAG,
                    "UI tree truncated (depth=${result.truncatedByDepth}, nodes=${result.nodeCount})",
                )
            }
            UiTree(
                root = result.root,
                packageName = root.packageName?.toString() ?: lastPackageName,
                activityName = lastActivityName,
                capturedAtEpochMs = System.currentTimeMillis(),
                screenWidthPx = resources.displayMetrics.widthPixels,
                screenHeightPx = resources.displayMetrics.heightPixels,
            )
        } finally {
            source.recycle()
        }
    }

    override fun currentPackageName(): String? = rootInActiveWindow?.packageName?.toString() ?: lastPackageName

    override fun currentActivityName(): String? = lastActivityName

    /**
     * Performs a global action such as back or home.
     *
     * Returns false when the action is unsupported on this API level rather than
     * throwing, so callers can degrade instead of crashing on older devices.
     */
    fun perform(action: GlobalAction): Boolean {
        if (!connected) return false
        if (!action.isSupportedOn(Build.VERSION.SDK_INT)) return false
        return performGlobalAction(action.platformConstant)
    }

    // --- NodeActionPerformer ----------------------------------------------

    override fun setText(
        structuralPath: String,
        text: String,
    ): Boolean =
        withLiveNode(structuralPath) { node ->
            val arguments =
                Bundle().apply {
                    putCharSequence(
                        AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                        text,
                    )
                }
            node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
        }

    override fun performClick(structuralPath: String): Boolean =
        withLiveNode(structuralPath) { node ->
            node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        }

    override fun performFocus(structuralPath: String): Boolean =
        withLiveNode(structuralPath) { node ->
            node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        }

    /**
     * Re-walks to the live node at [structuralPath] and runs [action] on it.
     *
     * The path is resolved against the current hierarchy rather than a cached one,
     * because the screen may have changed since it was captured. Every node
     * obtained along the way is recycled.
     */
    private fun withLiveNode(
        structuralPath: String,
        action: (AccessibilityNodeInfo) -> Boolean,
    ): Boolean {
        if (!connected) return false

        val root = rootInActiveWindow ?: return false
        val indices = parsePath(structuralPath) ?: return false

        var current: AccessibilityNodeInfo = root
        val obtained = mutableListOf<AccessibilityNodeInfo>()

        return try {
            for (index in indices) {
                val child = current.getChild(index) ?: return false
                obtained.add(child)
                current = child
            }
            action(current)
        } catch (error: IllegalStateException) {
            // Thrown when a node has been recycled by the system because the
            // screen changed under us. Reported as a failure so the caller
            // re-reads the screen rather than acting on stale structure.
            Log.w(TAG, "Node at $structuralPath is stale", error)
            false
        } finally {
            @Suppress("DEPRECATION")
            obtained.forEach { node -> runCatching { node.recycle() } }
        }
    }

    /**
     * Parses `0.2.1` into the child indices below the root.
     *
     * The leading segment identifies the root itself, so it is dropped: the walk
     * starts from `rootInActiveWindow`.
     */
    private fun parsePath(structuralPath: String): List<Int>? {
        val segments = structuralPath.split('.')
        if (segments.isEmpty()) return null

        val indices = segments.drop(1).map { it.toIntOrNull() ?: return null }
        return if (indices.any { it < 0 }) null else indices
    }

    private fun markDisconnected() {
        connected = false
        lastPackageName = null
        lastActivityName = null
        AccessibilityConnection.detach()
        Log.i(TAG, "Accessibility service disconnected")
    }

    private companion object {
        const val TAG = "UiAutomationA11y"

        /**
         * Content-change events fire continuously on animated screens. Throttling
         * keeps the service from waking constantly; the tree is read on demand
         * anyway, so nothing is missed.
         */
        const val EVENT_THROTTLE_MS = 100L
    }
}
