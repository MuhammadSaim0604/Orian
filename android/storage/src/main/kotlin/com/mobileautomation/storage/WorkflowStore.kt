package com.mobileautomation.storage

import android.content.Context
import java.io.File

/**
 * The storage module's public surface.
 *
 * Deliberately the **only** thing outside this module should use. Room types stay behind it:
 * `AutomationDatabase` extends `RoomDatabase`, so a caller that touched it would need Room on
 * its own compile classpath, and the module boundary would exist in name only.
 *
 * Everything here speaks plain Kotlin types, which also means the React Native module above it
 * needs no knowledge of how workflows are stored.
 */
class WorkflowStore(context: Context) {
    private val database = AutomationDatabase.get(context)
    private val dao = database.workflows()
    private val traceDao = database.traces()
    private val screenshots = TraceScreenshotStore(File(context.filesDir, "trace-screenshots"))

    /** Summaries for a list screen. Never reads the documents. */
    suspend fun list(): List<StoredWorkflowSummary> =
        dao.listSummaries().map {
            StoredWorkflowSummary(
                id = it.id,
                name = it.name,
                description = it.description,
                nodeCount = it.nodeCount,
                updatedAtEpochMs = it.updatedAtEpochMs,
            )
        }

    /** The full document, or null when there is no such workflow. */
    suspend fun load(id: String): String? = dao.findById(id)?.document

    /**
     * Saves a workflow.
     *
     * The queryable columns are derived from the document here rather than passed in, so a list
     * row can never disagree with the document it describes.
     */
    suspend fun save(
        id: String,
        document: String,
    ) {
        val existing = dao.findById(id)
        val nowMs = System.currentTimeMillis()

        dao.upsert(
            WorkflowEntity(
                id = id,
                name = WorkflowDocumentReader.readName(document),
                description = WorkflowDocumentReader.readDescription(document),
                document = document,
                nodeCount = WorkflowDocumentReader.readNodeCount(document),
                // Preserved on update, so re-saving does not make an old workflow look newly
                // created.
                createdAtEpochMs = existing?.createdAtEpochMs ?: nowMs,
                updatedAtEpochMs = nowMs,
            ),
        )
    }

    suspend fun remove(id: String) = dao.deleteById(id)

    suspend fun count(): Int = dao.count()

    // --- traces (Phase 9) --------------------------------------------------

    /** Recorded runs, newest first. Never reads the documents. */
    suspend fun listTraces(): List<StoredTraceSummary> =
        traceDao.listSummaries().map {
            StoredTraceSummary(
                id = it.id,
                goal = it.goal,
                outcome = it.outcome,
                stepCount = it.stepCount,
                recordedAtEpochMs = it.recordedAtEpochMs,
            )
        }

    suspend fun loadTrace(id: String): String? = traceDao.findById(id)?.document

    /**
     * Saves a trace, then prunes old ones.
     *
     * Pruning happens on write rather than on a schedule, because that is the only moment the
     * app is certainly running and the user is certainly not reading an older trace. Traces
     * accumulate with every agent run and each carries screenshots, so unbounded growth would
     * quietly consume a user's storage for recordings they will never open again.
     */
    suspend fun saveTrace(
        id: String,
        runId: String,
        goal: String,
        outcome: String,
        stepCount: Int,
        document: String,
    ) {
        traceDao.upsert(
            TraceEntity(
                id = id,
                runId = runId,
                goal = goal,
                outcome = outcome,
                stepCount = stepCount,
                document = document,
                screenshotDir = screenshots.directoryFor(id).absolutePath,
                recordedAtEpochMs = System.currentTimeMillis(),
            ),
        )

        pruneTraces()
    }

    /**
     * Removes a trace and its screenshots.
     *
     * Files first, then the row: if it failed the other way round, the row would be gone and
     * nothing would ever know which files to delete.
     */
    suspend fun removeTrace(id: String) {
        screenshots.deleteFor(id)
        traceDao.deleteById(id)
    }

    /** Directory this trace's screenshots belong in, for the recorder to write into. */
    suspend fun screenshotDirectoryFor(id: String): String =
        traceDao.screenshotDirFor(id) ?: screenshots.directoryFor(id).absolutePath

    suspend fun traceCount(): Int = traceDao.count()

    /** Bytes held by trace screenshots, so the UI can say what recordings cost. */
    fun screenshotBytesUsed(): Long = screenshots.bytesUsed()

    private suspend fun pruneTraces() {
        for (id in traceDao.idsBeyondNewest(MAX_RETAINED_TRACES)) {
            screenshots.deleteFor(id)
            traceDao.deleteById(id)
        }
    }

    companion object {
        /**
         * How many recorded runs to keep.
         *
         * Twenty is well past what anyone reviews and small enough that the screenshots stay a
         * few tens of megabytes rather than growing without limit.
         */
        const val MAX_RETAINED_TRACES = 20
    }
}

/**
 * A workflow as a list screen sees it.
 *
 * A separate type from the Room projection on purpose: this one is free of Room annotations, so
 * it can cross the module boundary without dragging Room with it.
 */
data class StoredWorkflowSummary(
    val id: String,
    val name: String,
    val description: String?,
    val nodeCount: Int,
    val updatedAtEpochMs: Long,
)

/** A recorded run as a list screen sees it. Room-free, for the same reason. */
data class StoredTraceSummary(
    val id: String,
    val goal: String,
    val outcome: String,
    val stepCount: Int,
    val recordedAtEpochMs: Long,
)
