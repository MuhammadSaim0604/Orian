package com.mobileautomation.assistant

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
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
    fun `a host that declines to show is reported honestly`() {
        // The session closes on false rather than leaving an empty window the user has to work out how to dismiss.
        val host = RecordingHost(canShow = false)
        AssistPanelRegistry.register(host)

        assertFalse(AssistPanelRegistry.hostOrNull()!!.show(NoOpSession))
    }

    private class RecordingHost(
        private val canShow: Boolean = true,
    ) : AssistPanelHost {
        var hidden = false
            private set

        override fun show(session: AssistSessionHandle): Boolean = canShow

        override fun hide() {
            hidden = true
        }
    }

    private object NoOpSession : AssistSessionHandle {
        override fun setContent(view: android.view.View) = Unit

        override fun close() = Unit
    }
}
