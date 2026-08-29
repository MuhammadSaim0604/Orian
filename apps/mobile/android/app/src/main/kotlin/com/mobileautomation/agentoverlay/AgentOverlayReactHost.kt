package com.mobileautomation.agentoverlay

import android.os.Bundle
import android.view.View
import android.widget.FrameLayout
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.interfaces.fabric.ReactSurface

/**
 * Builds the React Native view the agent status overlay window hosts.
 *
 * The same pattern as `OverlayReactHost`, and deliberately a separate instance rather than a shared
 * one: each host owns exactly one surface, and the two overlays can in principle be torn down
 * independently. Sharing would mean one overlay's release stopping the other's surface.
 *
 * `ReactHost.createSurface` rather than `ReactRootView.startReactApplication`, because this app runs
 * the **new architecture** - under bridgeless there is no `ReactInstanceManager` to start a root view
 * against, and the old path fails at runtime rather than at compile time.
 *
 * **The surface is per-session.** A stopped surface cannot be restarted into a new window, so one is
 * created per overlay session and stopped when the window detaches. Reusing one produces a blank
 * overlay the second time, which looks like the feature broke rather than a lifecycle mistake.
 */
class AgentOverlayReactHost(
    private val reactContext: ReactApplicationContext,
) {
    private var surface: ReactSurface? = null

    /**
     * Creates the overlay's content view for [runId].
     *
     * The run id crosses as an **initial prop** rather than through a store read, for the same reason
     * the node id does: this content mounts in a window the app's component tree knows nothing about,
     * so there is no shared React context to read from. Passing it at mount means the overlay can never
     * render without knowing which run it is reporting.
     *
     * Returns a container rather than the surface's own view, because a surface may not have attached
     * its view synchronously - and `WindowManager.addView` needs something to add now.
     */
    fun createView(runId: String): View {
        // Any previous surface is released first: keeping two would leak one per session, and the old
        // one is already detached from its window by this point.
        release()

        val application = reactContext.applicationContext as ReactApplication
        val container = FrameLayout(reactContext)

        // `ReactApplication.reactHost` is null on the old architecture. Returning an empty container
        // rather than throwing means the window still appears and can be dismissed, instead of failing
        // inside `WindowManager.addView`.
        val host = application.reactHost ?: return container

        val created =
            host.createSurface(
                reactContext,
                COMPONENT_NAME,
                Bundle().apply { putString(PROP_RUN_ID, runId) },
            )
                ?: return container

        surface = created
        created.start()

        created.view?.let { view ->
            // Reparented into the container already returned, since the surface's view is created by the
            // host and may still have a parent from a previous attach.
            (view.parent as? android.view.ViewGroup)?.removeView(view)
            container.addView(
                view,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT,
                ),
            )
        }

        return container
    }

    /**
     * Stops the surface.
     *
     * Called when the window detaches. Without this the JS tree stays mounted with no window to draw
     * into, holding its subscriptions - and for this overlay that means holding a subscription to a run
     * controller that will keep publishing to it.
     */
    fun release() {
        surface?.let { active ->
            runCatching { active.stop() }
            runCatching { active.detach() }
        }
        surface = null
    }

    companion object {
        /** Must match `AppRegistry.registerComponent` in `index.js`. */
        const val COMPONENT_NAME = "AgentStatusOverlay"

        /** Initial prop name, mirrored by the TypeScript overlay entry point. */
        const val PROP_RUN_ID = "runId"
    }
}
