package com.mobileautomation.overlays

/**
 * Ensures only one overlay window is visible at a time.
 *
 * There are three overlays now — the node toolset (Workflow Mode), the agent status strip (Agent Mode), and the
 * Orion Assist panel — and no two may be shown together. Three reasons, in order of how badly each would go:
 *
 * 1. **Ambiguous controls.** The agent strip has a stop button and the assist panel has its own. With two
 *    floating windows it is not obvious what either one stops.
 * 2. **They belong to different modes** (ADR 0011), and the modes share no UI. Two overlays on screen would be
 *    the clearest possible contradiction of that. The assist panel belongs to neither mode, which is a further
 *    reason it must not appear beside one.
 * 3. **They compete for space.** Each is sized to leave the underlying app visible; together they would not.
 *
 * The rule is **last-one-wins**, and it is claimed rather than negotiated: showing an overlay evicts the other.
 * The alternative — refusing the second — would mean a user summoning Orion and getting nothing because a toolset
 * from the other mode is still open somewhere.
 *
 * A `object` rather than an injected coordinator because it arbitrates between singletons owned by three
 * different React Native modules, none of which can see the others. Its state is one nullable field, and the
 * eviction callback is registered by whoever owns each window.
 */
object OverlayExclusivity {
    /** Which overlay is on screen. */
    enum class Kind {
        NODE_TOOLSET,
        AGENT_STATUS,

        /**
         * The Orion Assist panel.
         *
         * Unlike the other two this one is summoned by a system gesture, so it can arrive at any moment — over
         * either mode, or with the app not in the foreground at all. That is precisely why it goes through the
         * same arbitration rather than being treated as a special case.
         */
        ASSIST_PANEL,
    }

    private var holder: Kind? = null
    private val evictors = mutableMapOf<Kind, () -> Unit>()

    /** The overlay currently on screen, or null. */
    val current: Kind? get() = holder

    /**
     * Registers how to dismiss [kind].
     *
     * Called once by each overlay's owner. Held as a lambda rather than a reference to the manager, so
     * this object depends on neither implementation.
     */
    fun registerEvictor(
        kind: Kind,
        evict: () -> Unit,
    ) {
        evictors[kind] = evict
    }

    /**
     * Claims the screen for [kind], dismissing the other overlay if it is showing.
     *
     * Idempotent: claiming what you already hold does nothing, so an overlay updating itself does not
     * evict itself.
     */
    fun claim(kind: Kind) {
        if (holder == kind) return

        holder?.let { previous -> evictors[previous]?.invoke() }
        holder = kind
    }

    /**
     * Releases the screen if [kind] holds it.
     *
     * Guarded on ownership deliberately: a late `hide()` from an overlay that was already evicted must
     * not clear the claim of the one that replaced it.
     */
    fun release(kind: Kind) {
        if (holder == kind) holder = null
    }

    /** Test-only. Object state persists across tests. */
    fun resetForTests() {
        holder = null
        evictors.clear()
    }
}
