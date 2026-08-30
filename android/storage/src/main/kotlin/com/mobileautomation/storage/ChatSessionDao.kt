package com.mobileautomation.storage

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction

/**
 * Session and message queries.
 *
 * Room verifies these at compile time, so a column rename breaks the build rather than the app.
 */
@Dao
interface ChatSessionDao {
    /**
     * Sessions for one mode, newest activity first.
     *
     * The message count comes from a correlated subquery rather than a second round trip, because the
     * sidebar shows it on every row and N+1 queries on a list is the classic way to make a screen feel
     * slow for no reason.
     *
     * Ordered by `updated_at` rather than `created_at`: the conversation someone was last in is the one
     * they want to return to.
     */
    @Query(
        "SELECT s.id, s.mode, s.title, s.created_at, s.updated_at, " +
            "(SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id) AS message_count " +
            "FROM chat_sessions s WHERE s.mode = :mode ORDER BY s.updated_at DESC",
    )
    suspend fun listSummaries(mode: String): List<SessionSummaryRow>

    @Query("SELECT * FROM chat_sessions WHERE id = :id")
    suspend fun findById(id: String): ChatSessionEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(session: ChatSessionEntity)

    @Query("UPDATE chat_sessions SET title = :title, updated_at = :updatedAtEpochMs WHERE id = :id")
    suspend fun rename(
        id: String,
        title: String,
        updatedAtEpochMs: Long,
    )

    @Query("UPDATE chat_sessions SET updated_at = :updatedAtEpochMs WHERE id = :id")
    suspend fun touch(
        id: String,
        updatedAtEpochMs: Long,
    )

    /** Messages cascade, so this is the only delete needed. */
    @Query("DELETE FROM chat_sessions WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("SELECT COUNT(*) FROM chat_sessions WHERE mode = :mode")
    suspend fun count(mode: String): Int

    // --- messages ---------------------------------------------------------

    /**
     * A session's messages, oldest first.
     *
     * Oldest first because that is the order a conversation reads in, and because seeding the agent's
     * memory from history depends on the sequence being right.
     */
    @Query("SELECT * FROM chat_messages WHERE session_id = :sessionId ORDER BY created_at ASC")
    suspend fun listMessages(sessionId: String): List<ChatMessageEntity>

    /**
     * The most recent messages, oldest first within the window.
     *
     * For seeding memory on a long session: the whole transcript could be thousands of messages, and
     * the prompt only has room for the recent past anyway. `ORDER BY … DESC LIMIT` then reversed in
     * Kotlin, because SQLite cannot take the last N rows in ascending order directly.
     */
    @Query(
        "SELECT * FROM chat_messages WHERE session_id = :sessionId " +
            "ORDER BY created_at DESC LIMIT :limit",
    )
    suspend fun listRecentMessagesDescending(
        sessionId: String,
        limit: Int,
    ): List<ChatMessageEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMessage(message: ChatMessageEntity)

    /**
     * Appends a message and bumps the session's activity time in one transaction.
     *
     * Together, because a message whose session still claims to be older than it would sort wrongly in
     * the sidebar - and the sidebar's order is the only way a user finds a conversation again.
     */
    @Transaction
    suspend fun appendMessage(message: ChatMessageEntity) {
        insertMessage(message)
        touch(message.sessionId, message.createdAtEpochMs)
    }

    @Query("DELETE FROM chat_messages WHERE session_id = :sessionId")
    suspend fun deleteMessages(sessionId: String)

    @Query("SELECT COUNT(*) FROM chat_messages WHERE session_id = :sessionId")
    suspend fun messageCount(sessionId: String): Int
}
