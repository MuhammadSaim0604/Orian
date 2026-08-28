package com.mobileautomation.overlays

/**
 * What the overlay is doing, as anything outside this module needs to know it.
 *
 * A data class rather than a set of getters on the manager, so a caller can read a consistent
 * snapshot. Reading `isShowing` and then `boundNodeId` separately invites a state that never
 * actually existed - the user can dismiss the overlay between the two reads.
 */
data class OverlayState(
    val isShowing: Boolean,
    val boundNodeId: String?,
    val layout: OverlayLayout?,
    /** Present only while showing, so a caller can position its own UI relative to it. */
    val spec: OverlayWindowSpec?,
) {
    companion object {
        val HIDDEN = OverlayState(isShowing = false, boundNodeId = null, layout = null, spec = null)
    }
}

/**
 * Why an overlay could not be shown.
 *
 * Enumerated rather than returned as a boolean, because the three cases need three different
 * responses from the UI: a permission denial needs a settings deep link, a missing node id is
 * a programming error, and a window failure is worth reporting but not worth blaming the user
 * for.
 */
enum class OverlayFailure {
    /** "Display over other apps" has not been granted. Only the user can fix it. */
    PERMISSION_DENIED,

    /** No node id supplied - the overlay would have nothing to configure. */
    NO_BOUND_NODE,

    /** WindowManager rejected the window. Rare, and not the user's fault. */
    WINDOW_REJECTED,

    /** Asked to change something while nothing is shown. */
    NOT_SHOWING,
}

/** The outcome of an overlay operation. */
sealed interface OverlayResult {
    data class Shown(val state: OverlayState) : OverlayResult

    data class Failed(val failure: OverlayFailure) : OverlayResult

    val succeeded: Boolean get() = this is Shown
}
