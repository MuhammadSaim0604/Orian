package com.mobileautomation.screen

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class ScreenshotStoreTest {
    @get:Rule
    val temporaryFolder = TemporaryFolder()

    private var now: Long = 1_700_000_000_000L

    private fun store(
        maxFiles: Int = ScreenshotStore.DEFAULT_MAX_FILES,
        maxAgeMs: Long = ScreenshotStore.DEFAULT_MAX_AGE_MS,
    ) = ScreenshotStore(
        directory = File(temporaryFolder.root, "captures"),
        maxFiles = maxFiles,
        maxAgeMs = maxAgeMs,
        clock = { now },
    )

    private fun writeCapture(
        store: ScreenshotStore,
        ageMs: Long = 0L,
    ): File {
        val file = store.allocate()
        file.writeText("fake png bytes")
        file.setLastModified(now - ageMs)
        // Advance so the next allocation gets a distinct name.
        now += 1
        return file
    }

    @Test
    fun `allocates inside app-private storage with the configured format`() {
        val file = store().allocate()

        assertTrue(file.name.startsWith(ScreenshotStore.DEFAULT_PREFIX))
        assertTrue(file.name.endsWith(".${CapturePolicy.IMAGE_FORMAT}"))
        assertTrue(file.parentFile!!.exists())
    }

    @Test
    fun `allocates distinct names for successive captures`() {
        val store = store()
        val first = store.allocate()
        now += 1
        val second = store.allocate()

        assertFalse(first.name == second.name)
    }

    @Test
    fun `lists captures newest first`() {
        val store = store()
        val oldest = writeCapture(store, ageMs = 5_000L)
        val newest = writeCapture(store, ageMs = 0L)

        val listed = store.list()

        assertEquals(2, listed.size)
        assertEquals(newest.name, listed.first().name)
        assertEquals(oldest.name, listed.last().name)
    }

    @Test
    fun `lists nothing when the directory does not exist yet`() {
        assertTrue(store().list().isEmpty())
    }

    @Test
    fun `ignores unrelated files`() {
        val store = store()
        writeCapture(store)
        File(temporaryFolder.root, "captures/notes.txt").writeText("not a capture")

        assertEquals(1, store.list().size)
    }

    @Test
    fun `prunes captures beyond the count limit oldest first`() {
        val store = store(maxFiles = 2)
        writeCapture(store, ageMs = 3_000L)
        writeCapture(store, ageMs = 2_000L)
        val keepA = writeCapture(store, ageMs = 1_000L)
        val keepB = writeCapture(store, ageMs = 0L)

        val deleted = store.prune()

        assertEquals(2, deleted)
        assertEquals(setOf(keepB.name, keepA.name), store.list().map { it.name }.toSet())
    }

    @Test
    fun `prunes captures older than the age limit even when under the count limit`() {
        val store = store(maxFiles = 100, maxAgeMs = 1_000L)
        writeCapture(store, ageMs = 5_000L)
        val fresh = writeCapture(store, ageMs = 0L)

        val deleted = store.prune()

        assertEquals(1, deleted)
        assertEquals(listOf(fresh.name), store.list().map { it.name })
    }

    @Test
    fun `prune is a no-op when nothing exceeds the limits`() {
        val store = store(maxFiles = 10, maxAgeMs = 60_000L)
        writeCapture(store)

        assertEquals(0, store.prune())
        assertEquals(1, store.list().size)
    }

    @Test
    fun `does not double-count a file that is both too old and surplus`() {
        val store = store(maxFiles = 1, maxAgeMs = 1_000L)
        writeCapture(store, ageMs = 9_000L)
        writeCapture(store, ageMs = 0L)

        // The stale file is surplus *and* expired; it must count once.
        assertEquals(1, store.prune())
    }

    @Test
    fun `clear removes every capture`() {
        val store = store()
        writeCapture(store)
        writeCapture(store)

        assertEquals(2, store.clear())
        assertTrue(store.list().isEmpty())
    }

    @Test
    fun `reports total size on disk`() {
        val store = store()
        writeCapture(store)
        writeCapture(store)

        assertEquals("fake png bytes".length * 2L, store.totalSizeBytes())
    }

    @Test
    fun `rejects a non-positive file limit`() {
        assertTrue(
            runCatching { ScreenshotStore(temporaryFolder.root, maxFiles = 0) }.exceptionOrNull()
                is IllegalArgumentException,
        )
    }

    @Test
    fun `rejects a non-positive age limit`() {
        assertTrue(
            runCatching { ScreenshotStore(temporaryFolder.root, maxAgeMs = 0L) }.exceptionOrNull()
                is IllegalArgumentException,
        )
    }
}
