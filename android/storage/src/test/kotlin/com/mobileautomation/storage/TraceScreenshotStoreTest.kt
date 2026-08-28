package com.mobileautomation.storage

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * The screenshot store, tested off-device.
 *
 * Keeping screenshots as files with paths in the database (ADR 0005) buys a small, fast
 * database at the cost of two places to keep consistent. The failure it allows runs one way -
 * orphaned files nothing cleans up - so that is what these tests are about.
 */
class TraceScreenshotStoreTest {
    @get:Rule
    val folder = TemporaryFolder()

    private fun store() = TraceScreenshotStore(folder.root)

    @Test
    fun `creates a directory per trace`() {
        val directory = store().directoryFor("trace_1")

        assertTrue(directory.exists())
        assertTrue(directory.isDirectory)
    }

    @Test
    fun `gives different traces different directories`() {
        val subject = store()

        assertFalse(subject.directoryFor("trace_1") == subject.directoryFor("trace_2"))
    }

    @Test
    fun `returns the same directory for the same trace`() {
        val subject = store()

        assertEquals(subject.directoryFor("trace_1"), subject.directoryFor("trace_1"))
    }

    @Test
    fun `deletes a trace's screenshots`() {
        val subject = store()
        val directory = subject.directoryFor("trace_1")
        File(directory, "1.png").writeBytes(byteArrayOf(1, 2, 3))

        assertTrue(subject.deleteFor("trace_1"))
        assertFalse(directory.exists())
    }

    @Test
    fun `reports false rather than throwing when there is nothing to delete`() {
        // A trace with no screenshots is normal, and failing here would block deleting the
        // trace row - leaving the user unable to remove a recording at all.
        assertFalse(store().deleteFor("never_existed"))
    }

    @Test
    fun `counts bytes held`() {
        val subject = store()
        File(subject.directoryFor("trace_1"), "1.png").writeBytes(ByteArray(100))
        File(subject.directoryFor("trace_2"), "1.png").writeBytes(ByteArray(50))

        assertEquals(150L, subject.bytesUsed())
    }

    @Test
    fun `counts zero when nothing is stored`() {
        assertEquals(0L, store().bytesUsed())
    }

    @Test
    fun `deletes directories with no matching trace`() {
        // The cleanup for a crash between writing files and committing the row.
        val subject = store()
        subject.directoryFor("kept")
        subject.directoryFor("orphaned")

        assertEquals(1, subject.deleteOrphans(setOf("kept")))
        assertTrue(File(folder.root, "kept").exists())
        assertFalse(File(folder.root, "orphaned").exists())
    }

    @Test
    fun `keeps everything when every directory is known`() {
        val subject = store()
        subject.directoryFor("a")
        subject.directoryFor("b")

        assertEquals(0, subject.deleteOrphans(setOf("a", "b")))
    }

    @Test
    fun `does not escape its root when an id contains path separators`() {
        // Ids are generated internally, but a path built from one containing `..` would write
        // outside the intended directory, so it is enforced rather than assumed.
        val directory = store().directoryFor("../../etc/passwd")

        assertEquals(folder.root, directory.parentFile)
    }

    @Test
    fun `sanitises an id consistently, so delete finds what create made`() {
        val subject = store()
        val directory = subject.directoryFor("trace/with:odd chars")
        File(directory, "1.png").writeBytes(ByteArray(10))

        assertTrue(subject.deleteFor("trace/with:odd chars"))
    }
}
