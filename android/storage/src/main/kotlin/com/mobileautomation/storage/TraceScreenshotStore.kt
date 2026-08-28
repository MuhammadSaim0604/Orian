package com.mobileautomation.storage

import java.io.File

/**
 * Where a trace's screenshots live.
 *
 * Screenshots are files with paths in the database, not blobs (ADR 0005). That keeps the
 * database small enough to stay fast, at the cost of two places to keep consistent - which is
 * what this class exists to manage.
 *
 * The consistency risk runs one way: a deleted trace leaving orphaned files. So deletion
 * removes the directory, and pruning returns paths for the caller to clean up rather than
 * quietly forgetting them.
 */
class TraceScreenshotStore(private val root: File) {
    /** The directory for a trace, created on demand. */
    fun directoryFor(traceId: String): File {
        val directory = File(root, sanitise(traceId))
        directory.mkdirs()
        return directory
    }

    /**
     * Removes a trace's screenshots.
     *
     * Returns whether anything was deleted rather than throwing: a missing directory is a
     * normal outcome (a trace with no screenshots), and failing here would block deleting the
     * trace row itself - leaving the user unable to remove a recording at all.
     */
    fun deleteFor(traceId: String): Boolean {
        val directory = File(root, sanitise(traceId))
        return if (directory.exists()) directory.deleteRecursively() else false
    }

    /** Total bytes held, so the UI can tell the user what recordings are costing them. */
    fun bytesUsed(): Long =
        root
            .walkTopDown()
            .filter { it.isFile }
            .sumOf { it.length() }

    /**
     * Deletes directories with no corresponding trace.
     *
     * The cleanup for the failure this design allows: a crash between writing files and
     * committing the row, or a database restored from a backup that predates them.
     */
    fun deleteOrphans(knownTraceIds: Set<String>): Int {
        val sanitised = knownTraceIds.map { sanitise(it) }.toSet()

        return (root.listFiles() ?: emptyArray())
            .filter { it.isDirectory && it.name !in sanitised }
            .count { it.deleteRecursively() }
    }

    /**
     * Keeps a trace id safe to use as a directory name.
     *
     * Ids are generated internally, but a path built from an id that ever contained `..` would
     * write outside the intended directory - so this is enforced rather than assumed.
     */
    private fun sanitise(traceId: String): String = traceId.replace(Regex("[^A-Za-z0-9_-]"), "_")
}
