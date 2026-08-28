package com.mobileautomation.storage

import android.content.Context

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
    private val dao = AutomationDatabase.get(context).workflows()

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
