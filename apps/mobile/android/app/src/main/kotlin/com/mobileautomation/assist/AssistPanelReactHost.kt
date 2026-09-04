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
 * `ReactHost.createSurface` pattern as the other two: nothing new architecturally is the reason to do it this way,
 * and a bespoke path here would be a second thing to keep working under bridgeless.
 *
 * ## One surface per session, not per summoning
 *
 * This is the fix for the panel opening only once. The first version created a surface in `onShow` and stopped it
 * in `onHide`, which failed the second time: **a stopped `ReactSurface` cannot be restarted**, and creating a
 * replacement races the window that was built during session creation. The panel appeared once and then never
 * again, with nothing logged.
 *
 * Now `create` is called from `onCreateContentView` — once — and `release` only when the session is destroyed.
 * Between those, show and hide are events the JS tree handles while staying mounted.
 *
 * The consequence is that the panel does **not** remount per summoning, which is why the host has to tell it a new
 * exchange has started. Without that the second summoning would open on the first one's transcript.
 */
class AssistPanelReactHost(
    private val reactContext: ReactApplicationContext,
) {
    private var surface: ReactSurface? = null
    private var container: FrameLayout? = null

    /** Whether a surface exists, so the module can avoid building a second one. */
    fun isCreated(): Boolean = surface != null

    /**
     * Creates the panel's content view.
     *
     * Takes no bound id, unlike the other two hosts. That is the point of Orion Assist: there is no session and no
     * run to bind to, so there is nothing to pass. The panel reads everything it needs from `assistantController`,
     * a module the root imports directly.
     *
     * Returns null when there is no React host — the old architecture, or the app never having been opened. Null
     * rather than an empty container, because the session uses it to decide whether to show anything at all.
     */
    fun create(): View? {
        // Idempotent. `onCreateContentView` should only fire once per session, but a re-created React context can
        // produce a second call, and building two surfaces would leak one and show the wrong one.
        container?.let { existing -> return existing }

        val application = reactContext.applicationContext as ReactApplication
        val host = application.reactHost ?: return null

        val created =
            host.createSurface(reactContext, COMPONENT_NAME, Bundle())
                ?: return null

        val view = FrameLayout(reactContext)
        container = view
        surface = created

        created.start()

        created.view?.let { surfaceView ->
            // Reparented into the container already returned, since the surface's view is created by the host and
            // may still have a parent from a previous attach.
            (surfaceView.parent as? android.view.ViewGroup)?.removeView(surfaceView)
            view.addView(
                surfaceView,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT,
                ),
            )
        }

        return view
    }

    /** The content view, for reading window insets off its own window rather than the activity's. */
    fun contentOrNull(): View? = container

    /**
     * Stops the surface.
     *
     * Called only when the **session** is destroyed, never on hide. Doing it on hide is what broke the second
     * summoning. Without it eventually happening, the JS tree would stay mounted with no window to draw into,
     * holding a subscription to the assistant controller — and for this panel that means a text-to-speech voice
     * that could carry on talking.
     */
    fun release() {
        surface?.let { active ->
            runCatching { active.stop() }
            runCatching { active.detach() }
        }
        surface = null
        container = null
    }

    companion object {
        /** Must match `AppRegistry.registerComponent` in `index.js`. */
        const val COMPONENT_NAME = "OrionAssistPanel"
    }
}
