package com.mobileautomation.overlays

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Geometry for the agent status overlay.
 *
 * The rules here are what make the overlay usable rather than an obstruction, and none of them can be
 * checked on a device without a person looking at the screen — so they are pinned as arithmetic.
 */
class AgentOverlayGeometryTest {
    private val phone =
        AgentOverlayGeometry(
            screenWidthPx = 1080,
            screenHeightPx = 2400,
            statusBarHeightPx = 72,
            navigationBarHeightPx = 48,
        )

    @Test
    fun `sits on the right edge`() {
        // Right rather than left: on-screen content is left-aligned, so the right edge covers less of
        // what the user is reading.
        val spec = phone.specFor(OverlayLayout.COMPACT)

        assertEquals(1080 - AgentOverlayGeometry.EDGE_MARGIN_DP, spec.right)
    }

    @Test
    fun `is vertically centred in the usable area`() {
        // Centred rather than top-anchored, so it misses the app's toolbar - which is usually where the
        // controls the agent is about to press are.
        val spec = phone.specFor(OverlayLayout.COMPACT)
        val centre = spec.top + (spec.size.heightPx / 2)
        val usableCentre = phone.usableTop + (phone.usableHeight / 2)

        assertTrue(
            "expected roughly centred, got $centre against $usableCentre",
            Math.abs(centre - usableCentre) <= 2,
        )
    }

    @Test
    fun `clears the system bars`() {
        val spec = phone.specFor(OverlayLayout.EXPANDED)

        assertTrue(spec.top >= phone.usableTop)
        assertTrue(spec.bottom <= phone.usableBottom)
    }

    @Test
    fun `collapsed is a narrow strip`() {
        // A status line and a stop button. Scaling it with the screen would make it a slab on a tablet.
        assertEquals(
            AgentOverlayGeometry.COLLAPSED_WIDTH_DP,
            phone.widthFor(OverlayLayout.COMPACT),
        )
    }

    @Test
    fun `expanded is wider than collapsed`() {
        assertTrue(phone.widthFor(OverlayLayout.EXPANDED) > phone.widthFor(OverlayLayout.COMPACT))
    }

    @Test
    fun `expanded is taller than collapsed`() {
        assertTrue(phone.heightFor(OverlayLayout.EXPANDED) > phone.heightFor(OverlayLayout.COMPACT))
    }

    @Test
    fun `collapsed leaves the app visible`() {
        // The whole point of the status overlay is watching what the agent does. One that covered the
        // action would defeat itself.
        assertTrue(phone.leavesAppVisible(phone.specFor(OverlayLayout.COMPACT)))
    }

    @Test
    fun `expanded still leaves the app visible`() {
        assertTrue(phone.leavesAppVisible(phone.specFor(OverlayLayout.EXPANDED)))
    }

    @Test
    fun `every layout is fully on screen`() {
        for (layout in OverlayLayout.entries) {
            assertTrue(layout.name, phone.isFullyOnScreen(phone.specFor(layout)))
        }
    }

    @Test
    fun `a drag is clamped rather than rejected`() {
        // The user drags the strip to uncover something beneath it; a drag past the edge should stop at
        // the edge rather than snapping back.
        val spec = phone.specFor(OverlayLayout.COMPACT)
        val moved = phone.moveWithinScreen(spec, OverlayPoint(x = 9_000, y = 9_000))

        assertTrue(phone.isFullyOnScreen(moved))
    }

    @Test
    fun `a drag above the status bar is clamped to it`() {
        val spec = phone.specFor(OverlayLayout.COMPACT)
        val moved = phone.moveWithinScreen(spec, OverlayPoint(x = 0, y = -500))

        assertEquals(phone.usableTop, moved.top)
    }

    @Test
    fun `expanding re-pins to the right edge`() {
        // Growing in place would extend the window rightwards from its current x, pushing it off screen
        // rather than widening it.
        val collapsed = phone.specFor(OverlayLayout.COMPACT)
        val expanded = phone.applyLayout(collapsed, OverlayLayout.EXPANDED)

        assertEquals(1080 - AgentOverlayGeometry.EDGE_MARGIN_DP, expanded.right)
        assertTrue(phone.isFullyOnScreen(expanded))
    }

    @Test
    fun `expanding keeps the vertical position the user chose`() {
        val collapsed = phone.specFor(OverlayLayout.COMPACT)
        val dragged = phone.moveWithinScreen(collapsed, OverlayPoint(collapsed.left, 300))
        val expanded = phone.applyLayout(dragged, OverlayLayout.EXPANDED)

        // Not necessarily identical - expanding is taller and may need pulling up to fit - but it must
        // stay near where the user put it rather than jumping back to centre.
        assertTrue("expected to stay near y=300, got ${expanded.top}", expanded.top <= 300)
        assertTrue(phone.isFullyOnScreen(expanded))
    }

    @Test
    fun `collapsing again returns to the strip`() {
        val spec = phone.specFor(OverlayLayout.COMPACT)
        val expanded = phone.applyLayout(spec, OverlayLayout.EXPANDED)
        val collapsed = phone.applyLayout(expanded, OverlayLayout.COMPACT)

        assertEquals(AgentOverlayGeometry.COLLAPSED_WIDTH_DP, collapsed.size.widthPx)
        assertTrue(phone.isFullyOnScreen(collapsed))
    }

    @Test
    fun `works on a small screen`() {
        // A 720x1280 device: the fixed collapsed width and minimum height must not exceed it.
        val small =
            AgentOverlayGeometry(
                screenWidthPx = 720,
                screenHeightPx = 1280,
                statusBarHeightPx = 48,
                navigationBarHeightPx = 48,
            )

        for (layout in OverlayLayout.entries) {
            assertTrue(layout.name, small.isFullyOnScreen(small.specFor(layout)))
        }
    }

    @Test
    fun `refuses an impossible screen`() {
        // Better to fail loudly at construction than to compute a window nobody can see.
        val failure = runCatching { AgentOverlayGeometry(0, 0) }.exceptionOrNull()

        assertTrue(failure is IllegalArgumentException)
    }

    @Test
    fun `refuses system bars that consume the screen`() {
        val failure =
            runCatching {
                AgentOverlayGeometry(1080, 100, statusBarHeightPx = 60, navigationBarHeightPx = 60)
            }.exceptionOrNull()

        assertTrue(failure is IllegalArgumentException)
    }
}

/**
 * The two overlays cannot coexist.
 *
 * The rule matters most for the case that reads as a bug: an agent strip with a stop button, floating
 * beside a node toolset, where it is not obvious what the button stops.
 */
class OverlayExclusivityTest {
    @Before
    fun reset() {
        OverlayExclusivity.resetForTests()
    }

    @Test
    fun `nothing holds the screen initially`() {
        assertNull(OverlayExclusivity.current)
    }

    @Test
    fun `claiming records the holder`() {
        OverlayExclusivity.claim(OverlayExclusivity.Kind.AGENT_STATUS)

        assertEquals(OverlayExclusivity.Kind.AGENT_STATUS, OverlayExclusivity.current)
    }

    @Test
    fun `claiming evicts the other overlay`() {
        var toolsetEvicted = false
        OverlayExclusivity.registerEvictor(OverlayExclusivity.Kind.NODE_TOOLSET) { toolsetEvicted = true }

        OverlayExclusivity.claim(OverlayExclusivity.Kind.NODE_TOOLSET)
        OverlayExclusivity.claim(OverlayExclusivity.Kind.AGENT_STATUS)

        assertTrue(toolsetEvicted)
        assertEquals(OverlayExclusivity.Kind.AGENT_STATUS, OverlayExclusivity.current)
    }

    @Test
    fun `re-claiming does not evict itself`() {
        // An overlay updating its own layout must not tear itself down.
        var evicted = 0
        OverlayExclusivity.registerEvictor(OverlayExclusivity.Kind.AGENT_STATUS) { evicted += 1 }

        OverlayExclusivity.claim(OverlayExclusivity.Kind.AGENT_STATUS)
        OverlayExclusivity.claim(OverlayExclusivity.Kind.AGENT_STATUS)

        assertEquals(0, evicted)
    }

    @Test
    fun `releasing clears the holder`() {
        OverlayExclusivity.claim(OverlayExclusivity.Kind.AGENT_STATUS)
        OverlayExclusivity.release(OverlayExclusivity.Kind.AGENT_STATUS)

        assertNull(OverlayExclusivity.current)
    }

    @Test
    fun `a late release from an evicted overlay does not clear the new holder`() {
        // The ordering bug this prevents: the toolset is evicted, its hide() completes asynchronously and
        // calls release, and the agent overlay that replaced it loses its claim.
        OverlayExclusivity.registerEvictor(OverlayExclusivity.Kind.NODE_TOOLSET) {}

        OverlayExclusivity.claim(OverlayExclusivity.Kind.NODE_TOOLSET)
        OverlayExclusivity.claim(OverlayExclusivity.Kind.AGENT_STATUS)
        OverlayExclusivity.release(OverlayExclusivity.Kind.NODE_TOOLSET)

        assertEquals(OverlayExclusivity.Kind.AGENT_STATUS, OverlayExclusivity.current)
    }

    @Test
    fun `claiming without a registered evictor is safe`() {
        // The other overlay's module may never have been constructed - Workflow Mode might not have been
        // opened this session.
        OverlayExclusivity.claim(OverlayExclusivity.Kind.NODE_TOOLSET)
        OverlayExclusivity.claim(OverlayExclusivity.Kind.AGENT_STATUS)

        assertEquals(OverlayExclusivity.Kind.AGENT_STATUS, OverlayExclusivity.current)
    }

    @Test
    fun `both overlays are never held at once`() {
        OverlayExclusivity.registerEvictor(OverlayExclusivity.Kind.NODE_TOOLSET) {}
        OverlayExclusivity.registerEvictor(OverlayExclusivity.Kind.AGENT_STATUS) {}

        OverlayExclusivity.claim(OverlayExclusivity.Kind.AGENT_STATUS)
        OverlayExclusivity.claim(OverlayExclusivity.Kind.NODE_TOOLSET)

        assertFalse(OverlayExclusivity.current == OverlayExclusivity.Kind.AGENT_STATUS)
        assertEquals(OverlayExclusivity.Kind.NODE_TOOLSET, OverlayExclusivity.current)
    }
}
