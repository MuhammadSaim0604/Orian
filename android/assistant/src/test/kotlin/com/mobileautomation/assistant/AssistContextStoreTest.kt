package com.mobileautomation.assistant

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The assist context store, and the host registry that lets the session reach the panel.
 *
 * Two things worth testing off-device, and one that is not:
 *
 * - **Clearing.** The store holds a screenshot and a full view tree of whatever app the user was looking at — the
 *   most sensitive things this app ever handles. That they do not survive the session is a correctness property,
 *   not housekeeping.
 * - **The absent host.** The assistant can be summoned before the app has ever been opened, so `hostOrNull()`
 *   returning null is a normal state the session must handle rather than an error.
 *
 * What cannot be tested here is whether Android actually hands us the structure and the screenshot. That depends on
 * the user's "Use screen context" setting and on the OEM, and it needs a device.
 */
class AssistContextStoreTest {
    @After
    fun tearDown() {
        // Object state persists across tests in the same JVM, which is exactly the leak being guarded against.
        AssistContextStore.clear()
        AssistPanelRegistry.unregister()
    }

    @Test
    fun `starts with no screen context`() {
        AssistContextStore.clear()

        assertFalse(AssistContextStore.hasScreenContext())
        assertNull(AssistContextStore.structureOrNull())
        assertNull(AssistContextStore.screenshotOrNull())
    }

    @Test
    fun `reports no screen context when the system withheld it`() {
        // A real and common state rather than a failure: the user can turn off "Use screen context" while leaving
        // this app as their assistant. The panel needs to tell that apart from an empty screen, because the first is
        // fixable.
        AssistContextStore.putAssist(null, null)
        AssistContextStore.putScreenshot(null)

        assertFalse(AssistContextStore.hasScreenContext())
    }

    @Test
    fun `clearing removes everything`() {
        AssistContextStore.putInvocation(android.os.Bundle())
        AssistContextStore.clear()

        assertFalse(AssistContextStore.hasScreenContext())
        assertNull(AssistContextStore.structureOrNull())
        assertNull(AssistContextStore.screenshotOrNull())
    }

    @Test
    fun `screen info is null when there is no structure`() {
        AssistContextStore.clear()

        val info = AssistContextStore.screenInfo()

        assertNull(info.packageName)
        assertNull(info.activityName)
    }
}

/**
 * How the app module hands the session a way to show React content.
 *
 * The registry exists because `android/assistant` must not know React Native exists — it is depended on by the app
 * module purely so its three service declarations merge into the manifest, and depending upward would not compile.
 *
 * The **shape** of the host is what these protect, and it is worth stating why it matters: the first version had
 * only `show` and `hide` and built a React surface on every show. A `VoiceInteractionSession` is created once and
 * reused, and a stopped `ReactSurface` cannot be restarted — so the panel opened exactly once and then silently
 * produced nothing. Content is now created once and shown many times.
 */
class AssistPanelRegistryTest {
    @After
    fun tearDown() {
        AssistPanelRegistry.unregister()
    }

    @Test
    fun `has no host until one is registered`() {
        AssistPanelRegistry.unregister()

        // Not an error. The assist gesture works before the app has ever been opened, in which case there is no
        // React host to build a surface from and the session closes instead.
        assertNull(AssistPanelRegistry.hostOrNull())
    }

    @Test
    fun `hands back the registered host`() {
        val host = RecordingHost()
        AssistPanelRegistry.register(host)

        assertEquals(host, AssistPanelRegistry.hostOrNull())
    }

    @Test
    fun `a later registration replaces an earlier one`() {
        // The React context can be recreated — a JS reload, or the activity being rebuilt — and the newer host owns
        // the surface. Keeping the first would show a panel from a dead context.
        val first = RecordingHost()
        val second = RecordingHost()

        AssistPanelRegistry.register(first)
        AssistPanelRegistry.register(second)

        assertEquals(second, AssistPanelRegistry.hostOrNull())
    }

    @Test
    fun `unregistering leaves nothing behind`() {
        AssistPanelRegistry.register(RecordingHost())
        AssistPanelRegistry.unregister()

        assertNull(AssistPanelRegistry.hostOrNull())
    }

    @Test
    fun `a host with no content is reported honestly`() {
        // Null content means the session closes rather than leaving an empty window the user has to work out how to
        // dismiss.
        val host = RecordingHost(hasContent = false)
        AssistPanelRegistry.register(host)

        assertNull(AssistPanelRegistry.hostOrNull()!!.createContent(NoOpSession))
    }

    @Test
    fun `content is built once and shown many times`() {
        /**
         * The lifecycle that fixes the panel opening only once.
         *
         * A surface built per show cannot work: a stopped `ReactSurface` is not restartable, and the replacement
         * races the window created during session creation. So this asserts the shape the session relies on —
         * one build, many shows.
         */
        val host = RecordingHost()
        AssistPanelRegistry.register(host)

        val live = AssistPanelRegistry.hostOrNull()!!

        live.createContent(NoOpSession)
        live.onShown(true)
        live.onHidden()
        live.onShown(false)
        live.onHidden()

        assertEquals(1, host.builds)
        assertEquals(2, host.shows)
        assertEquals(2, host.hides)
        assertEquals(0, host.releases)
    }

    @Test
    fun `releasing is separate from hiding`() {
        // Releasing on hide is precisely what broke the second summoning. They must be different calls, so the
        // session can hide repeatedly and release only on destroy.
        val host = RecordingHost()
        AssistPanelRegistry.register(host)

        val live = AssistPanelRegistry.hostOrNull()!!

        live.createContent(NoOpSession)
        live.onHidden()

        assertEquals(0, host.releases)

        live.releaseContent()

        assertEquals(1, host.releases)
    }

    @Test
    fun `the shown flag can change after the panel is up`() {
        // Assist data arrives *after* onShow, so the first answer about screen context can be wrong for a fraction
        // of a second. Without a second channel the panel would keep claiming the screen was withheld.
        val host = RecordingHost()
        AssistPanelRegistry.register(host)

        val live = AssistPanelRegistry.hostOrNull()!!

        live.onShown(false)
        live.onScreenContextChanged(true)

        assertTrue(host.lastScreenContext)
    }

    private class RecordingHost(
        private val hasContent: Boolean = true,
    ) : AssistPanelHost {
        var builds = 0
            private set

        var shows = 0
            private set

        var hides = 0
            private set

        var releases = 0
            private set

        var lastScreenContext = false
            private set

        override fun createContent(session: AssistSessionHandle): android.view.View? {
            builds += 1
            // Null rather than a real View: instantiating one needs a Context, and what is being tested is the
            // lifecycle's shape rather than the view itself.
            return null
        }

        override fun onShown(hasScreenContext: Boolean) {
            shows += 1
            lastScreenContext = hasScreenContext
        }

        override fun onScreenContextChanged(hasScreenContext: Boolean) {
            lastScreenContext = hasScreenContext
        }

        override fun onHidden() {
            hides += 1
        }

        override fun releaseContent() {
            releases += 1
        }
    }

    private object NoOpSession : AssistSessionHandle {
        override fun close() = Unit
    }
}
