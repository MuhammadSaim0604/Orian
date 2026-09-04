package com.mobileautomation.assist

import android.os.Bundle
import android.view.View
import android.widget.FrameLayout
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.interfaces.fabric.ReactSurface

/**
 * Builds the React Native view the Orion Assist panel hosts.
 *
 * A **fourth** React root in this process — app, node toolset, agent status strip, and this. The same
 * `ReactHost.createSurface` pattern as the other two, deliberately: nothing new architecturally is the reason to
 * do it this way, and a bespoke path here would be a second thing to keep working under bridgeless.
 *
 * `createSurface` rather than `ReactRootView.startReactApplication` because this app runs the new architecture,
 * where there is no `ReactInstanceManager` to start a root view against — the old path fails at runtime rather
 * than at compile time.
 *
 * **The surface is per-invocation.** A stopped surface cannot be restarted into a new window, and the assist
 * gesture can be used repeatedly, so one is created each time the panel opens and stopped when it closes. Reusing
 * one produces a blank panel on the second summoning, which reads as the feature having broken.
 */
class AssistPanelReactHost(
    private val reactContext: ReactApplicationContext,
) {
    private var surface: ReactSurface? = null

    /**
     * Creates the panel's content view.
     *
     * Takes no bound id, unlike the other two hosts. That is the point of Orion Assist: there is no session and no
     * run to bind to, so there is nothing to pass. The panel reads everything it needs from
     * `assistantController`, a module the root imports directly.
     *
     * `hasScreenContext` does cross as an initial prop, because it is knowable only here and only now — whether
     * the system actually handed us the screen. The panel needs it to distinguish "the screen was empty" from
     * "we were not shown the screen", and the second is worth telling the user about since they can fix it.
     */
    fun createView(hasScreenContext: Boolean): View {
        // Any previous surface is released first: keeping two would leak one per invocation, and the old one is
        // already detached from its window by this point.
        release()

        val application = reactContext.applicationContext as ReactApplication
        val container = FrameLayout(reactContext)

        // Null on the old architecture. An empty container means the session still closes cleanly instead of
        // failing inside the window it was about to fill.
        val host = application.reactHost ?: return container

        val created =
            host.createSurface(
                reactContext,
                COMPONENT_NAME,
                Bundle().apply { putBoolean(PROP_HAS_SCREEN_CONTEXT, hasScreenContext) },
            )
                ?: return container

        surface = created
        created.start()

        created.view?.let { view ->
            // Reparented into the container already returned, since the surface's view is created by the host and
            // may still have a parent from a previous attach.
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
     * Called when the session closes. Without it the JS tree stays mounted with no window to draw into, holding a
     * subscription to the assistant controller — and for this panel that means a text-to-speech voice that could
     * carry on talking after the window the user dismissed has gone.
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
        const val COMPONENT_NAME = "OrionAssistPanel"

        /** Initial prop name, mirrored by the TypeScript panel root. */
        const val PROP_HAS_SCREEN_CONTEXT = "hasScreenContext"
    }
}
