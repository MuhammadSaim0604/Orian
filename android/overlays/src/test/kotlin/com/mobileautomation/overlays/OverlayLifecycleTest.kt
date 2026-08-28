package com.mobileautomation.overlays

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Overlay lifecycle rules.
 *
 * Tested through `FakeOverlayManager`, which enforces the same rules as the real one. These are
 * decisions rather than device behaviour: which node is bound, what happens when the permission
 * is missing, and whether showing twice stacks. A `WindowManager` would add nothing.
 */
class OverlayLifecycleTest {
    private fun manager() = FakeOverlayManager()

    @Test
    fun `starts hidden with nothing bound`() {
        val subject = manager()

        assertFalse(subject.isShowing)
        assertNull(subject.boundNodeId)
        assertEquals(OverlayState.HIDDEN, subject.state)
    }

    @Test
    fun `binds the overlay to a node id`() {
        // The AI is always configuring one specific node; an unbound overlay would leave the
        // model guessing what it is looking at.
        val subject = manager()

        val result = subject.show("if_23")

        assertTrue(result.succeeded)
        assertEquals("if_23", subject.boundNodeId)
    }

    @Test
    fun `refuses a blank node id rather than showing a placeholder`() {
        val subject = manager()

        val result = subject.show("")

        assertEquals(OverlayResult.Failed(OverlayFailure.NO_BOUND_NODE), result)
        assertFalse(subject.isShowing)
    }

    @Test
    fun `refuses to show without the overlay permission`() {
        // Only the user can grant "display over other apps"; there is no way to work around it.
        val subject = FakeOverlayManager(permissionGranted = false)

        val result = subject.show("if_23")

        assertEquals(OverlayResult.Failed(OverlayFailure.PERMISSION_DENIED), result)
        assertFalse(subject.isShowing)
    }

    @Test
    fun `distinguishes a permission denial from a window failure`() {
        // The UI responds differently: one needs a settings deep link, the other is not the
        // user's fault.
        val denied = FakeOverlayManager(permissionGranted = false).show("if_23")
        val rejected = FakeOverlayManager(windowRejects = true).show("if_23")

        assertEquals(OverlayResult.Failed(OverlayFailure.PERMISSION_DENIED), denied)
        assertEquals(OverlayResult.Failed(OverlayFailure.WINDOW_REJECTED), rejected)
    }

    @Test
    fun `opens compact by default`() {
        // The toolset must not cover the screen the user is configuring against.
        val subject = manager()
        subject.show("if_23")

        assertEquals(OverlayLayout.COMPACT, subject.state.layout)
    }

    @Test
    fun `switching layout keeps the same bound node`() {
        // The eye toggle reveals more tools; it does not change what is being configured.
        val subject = manager()
        subject.show("if_23")

        subject.setLayout(OverlayLayout.EXPANDED)

        assertEquals("if_23", subject.boundNodeId)
        assertEquals(OverlayLayout.EXPANDED, subject.state.layout)
    }

    @Test
    fun `expanding makes the overlay taller`() {
        val subject = manager()
        subject.show("if_23")
        val compactHeight = subject.currentSpec!!.size.heightPx

        subject.setLayout(OverlayLayout.EXPANDED)

        assertTrue(subject.currentSpec!!.size.heightPx > compactHeight)
    }

    @Test
    fun `refuses a layout change when nothing is showing`() {
        val subject = manager()

        assertEquals(
            OverlayResult.Failed(OverlayFailure.NOT_SHOWING),
            subject.setLayout(OverlayLayout.EXPANDED),
        )
    }

    @Test
    fun `refuses a move when nothing is showing`() {
        val subject = manager()

        assertEquals(OverlayResult.Failed(OverlayFailure.NOT_SHOWING), subject.moveTo(0, 0))
    }

    @Test
    fun `showing for another node rebinds rather than stacking`() {
        // Two overlays would leave the AI unsure which node is being configured.
        val subject = manager()
        subject.show("if_23")

        subject.show("click_4")

        assertEquals("click_4", subject.boundNodeId)
    }

    @Test
    fun `hiding clears the binding`() {
        val subject = manager()
        subject.show("if_23")

        subject.hide()

        assertFalse(subject.isShowing)
        assertNull(subject.boundNodeId)
        assertNull(subject.currentSpec)
    }

    @Test
    fun `hiding twice is harmless`() {
        // The user can dismiss the overlay while the app is also tearing it down.
        val subject = manager()
        subject.show("if_23")

        subject.hide()
        subject.hide()

        assertFalse(subject.isShowing)
    }

    @Test
    fun `reports a consistent snapshot rather than separate fields`() {
        // Reading isShowing then boundNodeId separately invites a state that never existed,
        // because the user can dismiss the overlay between the two reads.
        val subject = manager()
        subject.show("if_23", OverlayLayout.EXPANDED)

        val snapshot = subject.state

        assertTrue(snapshot.isShowing)
        assertEquals("if_23", snapshot.boundNodeId)
        assertEquals(OverlayLayout.EXPANDED, snapshot.layout)
        assertEquals(snapshot.spec, subject.currentSpec)
    }

    @Test
    fun `keeps the overlay on screen when moved past the edge`() {
        // A drag that would strand the window somewhere unreachable clamps instead.
        val subject = manager()
        subject.show("if_23")

        subject.moveTo(99_999, 99_999)

        val spec = subject.currentSpec!!
        assertTrue(spec.right <= 1_080)
        assertTrue(spec.bottom <= 2_400 - 48)
    }
}
