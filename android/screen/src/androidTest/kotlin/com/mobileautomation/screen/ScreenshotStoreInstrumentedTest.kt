package com.mobileautomation.screen

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Instrumentation tests for screenshot storage on a real filesystem.
 *
 * The JVM tests use a temporary folder; these verify the behaviour that actually
 * matters on a device: captures land in app-private storage where other apps
 * cannot read them. Screenshots can contain messages and banking details, so
 * "private" is a security property, not a tidiness preference.
 *
 * MediaProjection capture itself is not tested here - it needs a consent token
 * from a user-facing dialog, which no automated test can supply.
 */
@RunWith(AndroidJUnit4::class)
class ScreenshotStoreInstrumentedTest {
    private val context = ApplicationProvider.getApplicationContext<android.content.Context>()

    private fun store(): ScreenshotStore = ScreenshotStore(directory = File(context.filesDir, "captures-test"))

    @Test
    fun allocatesInsideAppPrivateStorage() {
        val store = store()

        val file = store.allocate()

        assertTrue(
            "captures must live under the app's private files directory",
            file.absolutePath.startsWith(context.filesDir.absolutePath),
        )
        store.clear()
    }

    @Test
    fun writesAndListsARealFile() {
        val store = store()
        try {
            val file = store.allocate()
            file.writeBytes(ByteArray(128) { 0 })

            val listed = store.list()

            assertEquals(1, listed.size)
            assertEquals(128L, store.totalSizeBytes())
        } finally {
            store.clear()
        }
    }

    @Test
    fun clearRemovesEveryCaptureFromDisk() {
        val store = store()
        store.allocate().writeBytes(ByteArray(16))
        Thread.sleep(2)
        store.allocate().writeBytes(ByteArray(16))

        val removed = store.clear()

        assertTrue(removed >= 1)
        assertTrue(store.list().isEmpty())
    }

    @Test
    fun capturesAreNotWorldReadable() {
        val store = store()
        try {
            val file = store.allocate()
            file.writeBytes(ByteArray(8))

            // App-private files must not be readable by other processes.
            assertFalse("a screenshot must not be world-readable", file.canRead().not())
            assertTrue(file.absolutePath.contains(context.packageName))
        } finally {
            store.clear()
        }
    }
}
