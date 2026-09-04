package com.mobileautomation.assistant

/**
 * How the assist session reaches the React panel.
 *
 * The session lives in `android/assistant`, a module that must not know React Native exists — it is depended on
 * by the app module purely so the three service declarations merge into the manifest. But the panel's content is
 * a React surface built by the app module, which is above it in the dependency graph.
 *
 * So the app module registers a host here at startup, and the session calls it. Exactly the arrangement
 * `OverlayExclusivity` uses to arbitrate between two overlay managers it cannot see: hold a lambda-shaped
 * interface rather than a reference to the implementation, and let the layer that can see both do the wiring.
 *
 * Without this, `:assistant` would have to depend on the app module, which is upward and would not compile.
 */
interface AssistPanelHost {
    /**
     * Builds and shows the panel's content in [session].
     *
     * Given the session rather than a context because the panel is drawn *into the session's own window*, which
     * is the whole reason it needs no overlay permission.
     *
     * Returns false when the panel cannot be shown — no React host yet, or the app was never opened. The session
     * then closes itself, which is better than an empty window the user has to dismiss.
     */
    fun show(session: AssistSessionHandle): Boolean

    /** Called when the session closes, so the surface is stopped and its subscriptions released. */
    fun hide()
}

/**
 * The parts of a `VoiceInteractionSession` the panel is allowed to touch.
 *
 * Narrowed on purpose. A session exposes a large surface — voice requests, activity launching, assist data — and
 * handing all of it to the app module would invite the panel to drive the session in ways its lifecycle does not
 * expect. The panel needs to put a view in and ask to be closed.
 */
interface AssistSessionHandle {
    /** Sets the session's content view. */
    fun setContent(view: android.view.View)

    /** Asks the session to close. The user tapping away, or the panel deciding it is finished. */
    fun close()
}

/**
 * Where the app module registers its host.
 *
 * A single nullable field, and null is a normal state: the assistant can be summoned before the app has ever been
 * opened, in which case there is no React host and nothing to show. The session handles that by closing rather
 * than by crashing.
 */
object AssistPanelRegistry {
    @Volatile
    private var host: AssistPanelHost? = null

    fun register(newHost: AssistPanelHost) {
        host = newHost
    }

    fun unregister() {
        host = null
    }

    fun hostOrNull(): AssistPanelHost? = host
}
