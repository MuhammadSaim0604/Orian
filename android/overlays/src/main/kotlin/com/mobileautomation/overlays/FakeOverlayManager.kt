package com.mobileautomation.overlays

/**
 * A recording overlay manager for tests and for hosts without a window.
 *
 * Exists because the Configure-with-AI flow is mostly decisions - which node is bound, when the
 * layout changes, whether a permission denial is surfaced - and none of those need a real
 * `WindowManager`. Testing them through one would mean an instrumentation test for logic that
 * is not device-dependent.
 *
 * It enforces the same rules as the real manager, so a test passing here is not passing against
 * a more permissive fake.
 */
class FakeOverlayManager(
    private val geometry: OverlayGeometry = OverlayGeometry(1_080, 2_400, 72, 48),
    /** Set false to simulate the user not having granted "display over other apps". */
    var permissionGranted: Boolean = true,
    /** Set true to simulate WindowManager rejecting the window. */
    var windowRejects: Boolean = false,
) : OverlayManager {
    private var current: OverlayState = OverlayState.HIDDEN

    /** Every operation attempted, in order, so a test can assert on the sequence. */
    val calls: MutableList<String> = mutableListOf()

    override val isShowing: Boolean get() = current.isShowing

    override val boundNodeId: String? get() = current.boundNodeId

    override val currentSpec: OverlayWindowSpec? get() = current.spec

    override val state: OverlayState get() = current

    override fun show(
        nodeId: String,
        layout: OverlayLayout,
    ): OverlayResult {
        calls += "show($nodeId, $layout)"

        if (nodeId.isBlank()) return OverlayResult.Failed(OverlayFailure.NO_BOUND_NODE)
        if (!permissionGranted) return OverlayResult.Failed(OverlayFailure.PERMISSION_DENIED)
        if (windowRejects) return OverlayResult.Failed(OverlayFailure.WINDOW_REJECTED)

        val spec = geometry.specFor(layout)
        current = OverlayState(isShowing = true, boundNodeId = nodeId, layout = layout, spec = spec)
        return OverlayResult.Shown(current)
    }

    override fun setLayout(layout: OverlayLayout): OverlayResult {
        calls += "setLayout($layout)"

        val spec = current.spec ?: return OverlayResult.Failed(OverlayFailure.NOT_SHOWING)

        val updated = geometry.applyLayout(spec, layout)
        current = current.copy(layout = layout, spec = updated)
        return OverlayResult.Shown(current)
    }

    override fun moveTo(
        x: Int,
        y: Int,
    ): OverlayResult {
        calls += "moveTo($x, $y)"

        val spec = current.spec ?: return OverlayResult.Failed(OverlayFailure.NOT_SHOWING)

        current = current.copy(spec = geometry.moveWithinScreen(spec, OverlayPoint(x, y)))
        return OverlayResult.Shown(current)
    }

    override fun hide() {
        calls += "hide()"
        current = OverlayState.HIDDEN
    }
}
