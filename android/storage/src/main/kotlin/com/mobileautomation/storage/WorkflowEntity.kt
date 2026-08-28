package com.mobileautomation.storage

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * A stored workflow.
 *
 * The workflow document itself is kept as **JSON in one column** rather than decomposed into
 * node and edge tables. That is deliberate: the schema of a node's config is owned by
 * TypeScript and by third-party node packages, so a relational shape here would have to
 * mirror something Kotlin cannot validate and would need a migration every time a node
 * package changed. The document is opaque to this layer, which is what keeps it stable.
 *
 * The queryable columns are only what a list screen needs - name, timestamps, node count -
 * so listing workflows never parses JSON.
 */
@Entity(tableName = "workflows")
data class WorkflowEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "name") val name: String,
    @ColumnInfo(name = "description") val description: String?,
    /** The full workflow JSON, validated by Zod on the TypeScript side. */
    @ColumnInfo(name = "document") val document: String,
    @ColumnInfo(name = "node_count") val nodeCount: Int,
    @ColumnInfo(name = "created_at") val createdAtEpochMs: Long,
    @ColumnInfo(name = "updated_at") val updatedAtEpochMs: Long,
)

/**
 * A row for the workflow list.
 *
 * Excludes the document column, so opening the list of workflows does not read every
 * document into memory - which on a device with fifty saved workflows would be several
 * megabytes for a screen that shows names.
 */
data class WorkflowSummary(
    val id: String,
    val name: String,
    val description: String?,
    @ColumnInfo(name = "node_count") val nodeCount: Int,
    @ColumnInfo(name = "updated_at") val updatedAtEpochMs: Long,
)
