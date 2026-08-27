package com.mobileautomation.accessibility.parser

import android.view.accessibility.AccessibilityNodeInfo
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumentation tests for the adapter that wraps a real
 * [AccessibilityNodeInfo].
 *
 * These cannot be JVM unit tests: `AccessibilityNodeInfo` is a framework class
 * backed by a native pool, and the Android JVM stub returns default values for
 * every call, so a unit test would pass while proving nothing.
 *
 * The nodes here are constructed directly rather than obtained from a live
 * accessibility service, which keeps the tests hermetic - they verify the
 * *mapping* from platform node to [NodeSource]. Reading another app's real
 * hierarchy needs a user-enabled service and is exercised manually against the
 * definition of done.
 */
@RunWith(AndroidJUnit4::class)
class AccessibilityNodeSourceInstrumentedTest {
    @Test
    fun mapsTextAndDescriptionFromARealNode() {
        val node = AccessibilityNodeInfo.obtain()
        try {
            node.text = "Send"
            node.contentDescription = "Send message"
            node.className = "android.widget.ImageButton"

            val source = AccessibilityNodeSource(node)

            assertEquals("Send", source.text)
            assertEquals("Send message", source.contentDescription)
            assertEquals("android.widget.ImageButton", source.className)
        } finally {
            @Suppress("DEPRECATION")
            node.recycle()
        }
    }

    @Test
    fun mapsInteractionFlags() {
        val node = AccessibilityNodeInfo.obtain()
        try {
            node.isClickable = true
            node.isLongClickable = true
            node.isScrollable = true
            node.isEnabled = true

            val source = AccessibilityNodeSource(node)

            assertTrue(source.isClickable)
            assertTrue(source.isLongClickable)
            assertTrue(source.isScrollable)
            assertTrue(source.isEnabled)
        } finally {
            @Suppress("DEPRECATION")
            node.recycle()
        }
    }

    @Test
    fun readsBoundsInScreenCoordinates() {
        val node = AccessibilityNodeInfo.obtain()
        try {
            node.setBoundsInScreen(android.graphics.Rect(900, 1800, 1050, 1950))

            val bounds = AccessibilityNodeSource(node).bounds

            assertEquals(900, bounds.left)
            assertEquals(1800, bounds.top)
            assertEquals(1050, bounds.right)
            assertEquals(1950, bounds.bottom)
            // The centre is what a gesture targets, so it must be right.
            assertEquals(975, bounds.centerX)
            assertEquals(1875, bounds.centerY)
        } finally {
            @Suppress("DEPRECATION")
            node.recycle()
        }
    }

    @Test
    fun reportsNullForUnsetOptionalFields() {
        val node = AccessibilityNodeInfo.obtain()
        try {
            val source = AccessibilityNodeSource(node)

            // A fresh node has no text; the adapter must not invent an empty string,
            // because the walker relies on null to mean "absent".
            assertEquals(null, source.text)
            assertEquals(null, source.contentDescription)
            assertEquals(null, source.resourceId)
        } finally {
            @Suppress("DEPRECATION")
            node.recycle()
        }
    }

    @Test
    fun walkerProducesATreeFromRealNodes() {
        val root = AccessibilityNodeInfo.obtain()
        try {
            root.className = "android.widget.FrameLayout"
            root.setBoundsInScreen(android.graphics.Rect(0, 0, 1080, 2400))

            val result = UiTreeWalker(includeInvisible = true).walk(AccessibilityNodeSource(root))

            assertNotNull(result.root)
            assertEquals("android.widget.FrameLayout", result.root.className)
            assertEquals(1, result.nodeCount)
        } finally {
            @Suppress("DEPRECATION")
            root.recycle()
        }
    }

    @Test
    fun recycleDoesNotThrowOnAnAlreadyRecycledNode() {
        val node = AccessibilityNodeInfo.obtain()
        val source = AccessibilityNodeSource(node)

        source.recycle()
        // Double recycling throws IllegalStateException on some API levels. The
        // adapter swallows it, because the walker recycles in a finally block and a
        // throw there would mask the original failure.
        source.recycle()
    }
}
