package com.mobileautomation.accessibility.service

import com.mobileautomation.accessibility.model.UiNode
import com.mobileautomation.accessibility.model.UiTree
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class AccessibilityConnectionTest {
    private class FakeScreenReader(
        override var isAvailable: Boolean = true,
        private val tree: UiTree? = UiTree(root = UiNode()),
    ) : ScreenReader {
        override fun captureUiTree(): UiTree? = tree

        override fun currentPackageName(): String? = "com.example"

        override fun currentActivityName(): String? = "com.example.MainActivity"
    }

    @Before
    fun setUp() {
        AccessibilityConnection.reset()
    }

    @After
    fun tearDown() {
        AccessibilityConnection.reset()
    }

    @Test
    fun `reports disconnected before the service attaches`() {
        assertFalse(AccessibilityConnection.isConnected)
        assertNull(AccessibilityConnection.readerOrNull())
    }

    @Test
    fun `exposes the reader once attached`() {
        val reader = FakeScreenReader()

        AccessibilityConnection.attach(reader)

        assertTrue(AccessibilityConnection.isConnected)
        assertSame(reader, AccessibilityConnection.readerOrNull())
    }

    @Test
    fun `hides the reader again after detaching`() {
        AccessibilityConnection.attach(FakeScreenReader())
        AccessibilityConnection.detach()

        assertFalse(AccessibilityConnection.isConnected)
        assertNull(AccessibilityConnection.readerOrNull())
    }

    @Test
    fun `withholds a reader that reports itself unavailable`() {
        // Mirrors the user revoking the accessibility grant while the service
        // object still exists but can no longer read.
        AccessibilityConnection.attach(FakeScreenReader(isAvailable = false))

        assertFalse(AccessibilityConnection.isConnected)
        assertNull(AccessibilityConnection.readerOrNull())
    }

    @Test
    fun `notifies listeners on connect and disconnect`() {
        val events = mutableListOf<Boolean>()
        AccessibilityConnection.addConnectionListener { events.add(it) }

        AccessibilityConnection.attach(FakeScreenReader())
        AccessibilityConnection.detach()

        assertEquals(listOf(true, false), events)
    }

    @Test
    fun `stops notifying a removed listener`() {
        val events = mutableListOf<Boolean>()
        val listener: (Boolean) -> Unit = { events.add(it) }

        AccessibilityConnection.addConnectionListener(listener)
        AccessibilityConnection.attach(FakeScreenReader())
        AccessibilityConnection.removeConnectionListener(listener)
        AccessibilityConnection.detach()

        assertEquals(listOf(true), events)
    }

    @Test
    fun `a throwing listener does not prevent the others from being notified`() {
        val events = mutableListOf<String>()
        AccessibilityConnection.addConnectionListener { error("listener blew up") }
        AccessibilityConnection.addConnectionListener { events.add("second") }

        AccessibilityConnection.attach(FakeScreenReader())

        assertEquals(listOf("second"), events)
    }

    @Test
    fun `attaching a second reader replaces the first`() {
        val first = FakeScreenReader()
        val second = FakeScreenReader()

        AccessibilityConnection.attach(first)
        AccessibilityConnection.attach(second)

        assertSame(second, AccessibilityConnection.readerOrNull())
    }
}
