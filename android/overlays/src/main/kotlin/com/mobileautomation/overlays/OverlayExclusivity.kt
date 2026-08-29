package com.mobileautomation.overlays

/**
 * Ensures only one overlay window is visible at a time.
 *
 * There are two overlays now — the node toolset (Workflow Mode) and the agent status strip (Agent
 * Mode) — and they must never both be shown. Three reasons, in order of how badly each would go:
 *
 * 1. **Ambiguous controls.** The agent strip has a stop button. With a toolset panel also floating,
 *    it is not obvious what that button stops.
 * 2. **They belong to different modes** (ADR 0011), and the modes share no UI. Two overlays on screen
 *    would be the clearest possible contradiction of that.
 * 3. **They compete for space.** Both are sized to leave the underlying app visible; together they
 *    would not.
 *
 * The rule is **last-one-wins**, and it is claimed rather than negotiated: showing an overlay evicts
 * the other. The alternative — refusing the second — would mean a user in Agent Mode being told they
 * cannot see their running agent because a toolset from the other mode is still open somewhere.
 *
 * A `object` rather than an injected coordinator because it arbitrates between two singletons owned by
 * two different React Native modules, neither of which can see the other. Its state is one nullable
 * field, and the eviction callback is registered by whoever owns each window.
 */
object OverlayExclusivity {
    /** Which overlay is on screen. */
    enum class Kind {
        NODE_TOOLSET,
        AGENT_STATUS,
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
