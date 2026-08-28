package com.mobileautomation.overlay

import android.os.Bundle
import android.view.View
import android.widget.FrameLayout
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.interfaces.fabric.ReactSurface

/**
 * Builds the React Native view the overlay window hosts.
 *
 * Uses `ReactHost.createSurface` rather than `ReactRootView.startReactApplication`, because this app
 * runs the **new architecture** (`newArchEnabled=true`): under bridgeless there is no
 * `ReactInstanceManager` to start a root view against, and the old path fails at runtime rather than
 * at compile time.
 *
 * Two things make this delicate, and both are why it is its own class rather than a lambda inside
 * the module.
 *
 * **The surface is per-session.** A stopped surface cannot be restarted into a new window, so one is
 * created per overlay session and stopped when the window detaches. Reusing one produces a blank
 * overlay on the second open - which looks like the feature broke rather than like a lifecycle
 * mistake.
 *
 * **The bound node id crosses as an initial prop.** Not through a store or an event, because the RN
 * content mounts inside a window the app's component tree knows nothing about: there is no shared
 * React context to read from. Passing it at mount means the overlay can never render without
 * knowing which node it is configuring.
 */
class OverlayReactHost(
    private val reactContext: ReactApplicationContext,
) {
    private var surface: ReactSurface? = null

    /**
     * Creates the overlay's content view, bound to [nodeId].
     *
     * `COMPONENT_NAME` must match the component registered in `index.js`. A mismatch produces an
     * empty window with only a warning in the log, so the name is a constant shared by both sides
     * rather than a string written twice.
     *
     * Returns a container rather than the surface's own view, because a surface may not have
     * attached its view synchronously - and `WindowManager.addView` needs something to add now.
     */
    fun createView(nodeId: String): View {
        // Any previous surface is released first: keeping two would leak one per session, and the
        // old one is already detached from its window by this point.
        release()

        val application = reactContext.applicationContext as ReactApplication
        val container = FrameLayout(reactContext)

        // `ReactApplication.reactHost` is nullable - it is null on the old architecture. Returning
        // an empty container rather than throwing means the window still appears and can be
        // dismissed, instead of failing inside `WindowManager.addView`.
        val host = application.reactHost ?: return container

        val created =
            host.createSurface(
                reactContext,
                COMPONENT_NAME,
                Bundle().apply { putString(PROP_NODE_ID, nodeId) },
            )

        if (created == null) {
            // A null surface means the React host is not ready. Same reasoning: an overlay the user
            // can close beats an exception inside the window manager.
            return container
        }

        surface = created
        created.start()

        created.view?.let { view ->
            // Reparented into the container we already returned, since the surface's view is
            // created by the host and may already have a parent from a previous attach.
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
     * Called when the window detaches. Without this the JS component tree stays mounted with no
     * window to draw into, holding its subscriptions and its share of the runtime.
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
        const val COMPONENT_NAME = "ConfigureWithAiOverlay"

        /** Initial prop name, mirrored by the TypeScript overlay entry point. */
        const val PROP_NODE_ID = "nodeId"
    }
}
