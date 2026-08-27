package com.mobileautomation.screen

import java.io.File

/**
 * Manages screenshot files on disk.
 *
 * Screenshots are the most sensitive data the app handles - they can contain
 * messages, banking details, anything on screen. So they live only in
 * app-private storage, are named predictably enough to be cleaned up, and are
 * pruned aggressively: an execution trace should not leave a permanent archive
 * of the user's screen behind.
 *
 * @param directory app-private directory for captures. The caller passes
 *   `context.filesDir`-derived paths, keeping this class free of Android types
 *   and therefore unit-testable.
 * @param maxFiles how many captures to keep. Oldest are deleted beyond this.
 * @param maxAgeMs how long a capture may live regardless of count.
 */
class ScreenshotStore(
    private val directory: File,
    private val maxFiles: Int = DEFAULT_MAX_FILES,
    private val maxAgeMs: Long = DEFAULT_MAX_AGE_MS,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    init {
        require(maxFiles > 0) { "maxFiles must be positive, was $maxFiles" }
        require(maxAgeMs > 0) { "maxAgeMs must be positive, was $maxAgeMs" }
    }

    /** Creates the directory if needed and returns the file to write next. */
    fun allocate(prefix: String = DEFAULT_PREFIX): File {
        directory.mkdirs()
        val name = "$prefix${clock()}.${CapturePolicy.IMAGE_FORMAT}"
        return File(directory, name)
    }

    /** Captures currently on disk, newest first. */
    fun list(): List<File> =
        directory
            .listFiles { file -> file.isFile && file.name.endsWith(".${CapturePolicy.IMAGE_FORMAT}") }
            ?.sortedByDescending { it.lastModified() }
            ?: emptyList()

    /**
     * Deletes captures beyond the count or age limit.
     *
     * @return how many files were removed.
     */
    fun prune(): Int {
        val files = list()
        val now = clock()

        val tooOld = files.filter { now - it.lastModified() > maxAgeMs }
        val surplus = files.drop(maxFiles)
        val doomed = (tooOld + surplus).distinct()

        return doomed.count { it.delete() }
    }

    /**
     * Deletes every capture.
     *
     * Called when the user clears data or revokes screen-capture consent; they
     * should not have to trust that pruning eventually gets round to it.
     */
    fun clear(): Int = list().count { it.delete() }

    fun totalSizeBytes(): Long = list().sumOf { it.length() }

    companion object {
        const val DEFAULT_PREFIX: String = "capture-"

        /** Enough for one long agent run to be reviewed afterwards. */
        const val DEFAULT_MAX_FILES: Int = 50

        /** One hour: long enough to debug a run, short enough not to accumulate. */
        const val DEFAULT_MAX_AGE_MS: Long = 60 * 60 * 1000L
    }
}
