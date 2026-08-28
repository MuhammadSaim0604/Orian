package com.mobileautomation.storage

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * A recorded agent run.
 *
 * Same shape of decision as `WorkflowEntity`: the trace document is **one JSON column**,
 * because its schema is owned by TypeScript and a relational mirror here would need a
 * migration every time a step field changed.
 *
 * Screenshots are **not** in this table. They are files, referenced by path from inside the
 * document (ADR 0005) - a twenty-step trace with inline images would be tens of megabytes in
 * a single row, and SQLite would be a poor place to keep them.
 */
@Entity(tableName = "traces")
data class TraceEntity(
    @PrimaryKey val id: String,
    /** The agent run this came from, so a trace can be tied back to its session. */
    @ColumnInfo(name = "run_id") val runId: String,
    @ColumnInfo(name = "goal") val goal: String,
    @ColumnInfo(name = "outcome") val outcome: String,
    @ColumnInfo(name = "step_count") val stepCount: Int,
    /** The full trace JSON, validated by Zod on the TypeScript side. */
    @ColumnInfo(name = "document") val document: String,
    /**
     * Directory holding this trace's screenshots.
     *
     * Stored so deleting a trace can delete its files too. Without it, removing a trace would
     * leave orphaned images that nothing ever cleans up.
     */
    @ColumnInfo(name = "screenshot_dir") val screenshotDir: String?,
    @ColumnInfo(name = "recorded_at") val recordedAtEpochMs: Long,
)

/**
 * A trace as the list screen sees it.
 *
 * Excludes the document, so listing recorded runs does not read every trace into memory.
 */
data class TraceSummary(
    val id: String,
    val goal: String,
    val outcome: String,
    @ColumnInfo(name = "step_count") val stepCount: Int,
    @ColumnInfo(name = "recorded_at") val recordedAtEpochMs: Long,
)
