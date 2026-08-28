package com.mobileautomation.storage

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

/** Trace queries. Room checks them at compile time, so a column rename fails the build. */
@Dao
interface TraceDao {
    /** Newest first: the run someone just watched is the one they want to turn into a workflow. */
    @Query(
        "SELECT id, goal, outcome, step_count, recorded_at FROM traces " +
            "ORDER BY recorded_at DESC",
    )
    suspend fun listSummaries(): List<TraceSummary>

    @Query("SELECT * FROM traces WHERE id = :id")
    suspend fun findById(id: String): TraceEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(trace: TraceEntity)

    @Query("DELETE FROM traces WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("SELECT COUNT(*) FROM traces")
    suspend fun count(): Int

    /**
     * Ids of traces beyond the newest [keep].
     *
     * Traces accumulate silently - every agent run makes one - and each carries screenshots.
     * Left unbounded they would consume a user's storage for recordings they will never look
     * at again. Returns the ids rather than deleting, so the caller can remove the files too.
     */
    @Query(
        "SELECT id FROM traces ORDER BY recorded_at DESC LIMIT -1 OFFSET :keep",
    )
    suspend fun idsBeyondNewest(keep: Int): List<String>

    @Query("SELECT screenshot_dir FROM traces WHERE id = :id")
    suspend fun screenshotDirFor(id: String): String?
}
