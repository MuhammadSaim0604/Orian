package com.mobileautomation.assistant

/**
 * How the assist session reaches the React panel.
 *
 * The session lives in `android/assistant`, a module that must not know React Native exists — it is depended on by
 * the app module purely so the three service declarations merge into the manifest. But the panel's content is a
 * React surface built by the app module, which is above it in the dependency graph.
 *
 * So the app module registers a host here at startup, and the session calls it. Exactly the arrangement
 * `OverlayExclusivity` uses to arbitrate between two overlay managers it cannot see: hold a lambda-shaped
 * interface rather than a reference to the implementation, and let the layer that can see both do the wiring.
 *
 * ## Why this is shaped as create / show / hide / release
 *
 * The first version had only `show` and `hide`, and it built a surface on every show. A `VoiceInteractionSession`
 * is created once and reused, and a stopped `ReactSurface` cannot be restarted — so the second summoning silently
 * produced nothing at all.
 *
 * The lifecycle here mirrors the platform's: content is built **once**, shown and hidden many times, and released
 * when the session is destroyed. That is what makes `onShown` necessary — with a surface that never remounts, the
 * panel has to be *told* a new exchange has begun rather than inferring it from mounting.
 */
interface AssistPanelHost {
    /**
     * Builds the panel's content view, once per session.
     *
     * Called from `onCreateContentView`, before the first show. Returning null means there is nothing to display —
     * the assistant can be summoned before the app has ever been opened, so there may be no React host yet. The
     * session closes rather than showing an empty window.
     */
    fun createContent(session: AssistSessionHandle): android.view.View?

    /**
     * A new summoning.
     *
     * This is what clears the previous exchange. Without it the second summoning would open on the first one's
     * transcript, breaking the promise that each invocation is its own conversation.
     *
     * [hasScreenContext] is passed rather than read, because it is knowable only at this moment and it can change
     * again a fraction later — assist data arrives after the show.
     */
    fun onShown(hasScreenContext: Boolean)

    /** Screen context arrived (or did not) after the panel was already showing. */
    fun onScreenContextChanged(hasScreenContext: Boolean)

    /** The window is going away. The exchange ends; the surface does not. */
    fun onHidden()

    /** The session is being destroyed. The only point at which the surface is stopped. */
    fun releaseContent()
}

/**
 * The parts of a `VoiceInteractionSession` the panel is allowed to touch.
 *
 * Narrowed on purpose. A session exposes a large surface — voice requests, activity launching, assist data — and
 * handing all of it to the app module would invite the panel to drive the session in ways its lifecycle does not
 * expect.
 */
interface AssistSessionHandle {
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
