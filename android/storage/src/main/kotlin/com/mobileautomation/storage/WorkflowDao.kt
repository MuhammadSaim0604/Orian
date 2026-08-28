package com.mobileautomation.storage

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

/**
 * Workflow queries.
 *
 * Room checks these at compile time, so a column rename that breaks a query fails the build
 * rather than the app.
 */
@Dao
interface WorkflowDao {
    /**
     * The list, newest first.
     *
     * Ordered by update time rather than creation, because the workflow a user last touched is
     * the one they are most likely to want again.
     */
    @Query(
        "SELECT id, name, description, node_count, updated_at FROM workflows " +
            "ORDER BY updated_at DESC",
    )
    suspend fun listSummaries(): List<WorkflowSummary>

    @Query("SELECT * FROM workflows WHERE id = :id")
    suspend fun findById(id: String): WorkflowEntity?

    /**
     * Saves, replacing an existing row with the same id.
     *
     * Replace rather than fail: the app's save button is an upsert from the user's point of
     * view, and making them delete before re-saving would be absurd.
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(workflow: WorkflowEntity)

    @Query("DELETE FROM workflows WHERE id = :id")
    suspend fun deleteById(id: String)

    @Delete
    suspend fun delete(workflow: WorkflowEntity)

    @Query("SELECT COUNT(*) FROM workflows")
    suspend fun count(): Int
}
