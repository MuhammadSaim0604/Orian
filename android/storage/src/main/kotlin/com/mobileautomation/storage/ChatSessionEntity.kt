package com.mobileautomation.storage

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * A chat session, and the messages in it.
 *
 * Sessions are per mode, not global. Agent Mode's sessions and Workflow Mode's builder-agent sessions
 * are separate conversations with separate memory (ADR 0011, ADR 0014), and putting them in one table
 * with a `mode` column is what keeps them separate without a second schema - the alternative, two
 * near-identical table pairs, would drift.
 *
 * ## Why messages are rows and not a JSON blob
 *
 * A workflow is stored as one opaque JSON document, because its schema belongs to TypeScript and to
 * third-party node packages. Messages are the opposite case: the shape is small, stable and owned
 * here, and the access pattern needs it decomposed. Loading a session must read its messages without
 * rewriting the whole conversation on every reply, and appending a message during a run must not
 * require reading and re-serialising everything before it.
 */
@Entity(
    tableName = "chat_sessions",
    indices = [Index(value = ["mode", "updated_at"])],
)
data class ChatSessionEntity(
    @PrimaryKey val id: String,
    /** `agent` or `workflowBuilder`. A string rather than an enum so a new mode needs no migration. */
    @ColumnInfo(name = "mode") val mode: String,
    /**
     * The session's name.
     *
     * Derived from the first message when the user has not named it, so a list of sessions reads as a
     * list of tasks rather than "Session 1, Session 2".
     */
    @ColumnInfo(name = "title") val title: String,
    @ColumnInfo(name = "created_at") val createdAtEpochMs: Long,
    /** Bumped on every message, because the list orders by recency of activity. */
    @ColumnInfo(name = "updated_at") val updatedAtEpochMs: Long,
)

/**
 * One message in a session.
 *
 * `role` covers more than the OpenAI roles, and the extra ones serve two different readers:
 *
 * - `tool` and `event` are for the **user**: what a call did, and loop narration such as a plan or a change
 *   of approach. A `tool` row's text is a readable summary, not what the model was sent.
 * - `wire` is for the **model**: it carries the exact Chat Completions message in `detail`, so the next run
 *   can replay the conversation as it happened rather than from a description of it.
 *
 * Both live in one table on purpose. They are two views of the same conversation, and splitting them would
 * make it possible for one to survive a delete without the other.
 *
 * Deleting a session deletes its messages by foreign key, so there is no path that leaves orphans.
 */
@Entity(
    tableName = "chat_messages",
    foreignKeys = [
        ForeignKey(
            entity = ChatSessionEntity::class,
            parentColumns = ["id"],
            childColumns = ["session_id"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index(value = ["session_id", "created_at"])],
)
data class ChatMessageEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "session_id") val sessionId: String,
    /** `user`, `assistant`, `tool`, `event`, or `wire`. */
    @ColumnInfo(name = "role") val role: String,
    @ColumnInfo(name = "text") val text: String,
    /**
     * Structured detail as JSON, for a tool call's arguments and result.
     *
     * Opaque here on purpose. Rendering a tool call as a readable row rather than raw JSON is the UI's
     * job, and the fields it needs come from the agent's event union - which TypeScript owns.
     */
    @ColumnInfo(name = "detail") val detail: String?,
    /** The run this message belongs to, so a transcript can group by run. Null for typed messages. */
    @ColumnInfo(name = "run_id") val runId: String?,
    @ColumnInfo(name = "created_at") val createdAtEpochMs: Long,
)

/**
 * A session as the sidebar sees it.
 *
 * Room-free, like `StoredWorkflowSummary`, so it can cross the module boundary without dragging Room
 * onto the caller's classpath.
 */
data class StoredSessionSummary(
    val id: String,
    val mode: String,
    val title: String,
    val messageCount: Int,
    val createdAtEpochMs: Long,
    val updatedAtEpochMs: Long,
)

/** A message as the transcript sees it. Room-free, for the same reason. */
data class StoredMessage(
    val id: String,
    val sessionId: String,
    val role: String,
    val text: String,
    val detail: String?,
    val runId: String?,
    val createdAtEpochMs: Long,
)

/** A Room projection for the sidebar. Excludes nothing large, but counts messages in SQL. */
data class SessionSummaryRow(
    val id: String,
    val mode: String,
    val title: String,
    @ColumnInfo(name = "message_count") val messageCount: Int,
    @ColumnInfo(name = "created_at") val createdAtEpochMs: Long,
    @ColumnInfo(name = "updated_at") val updatedAtEpochMs: Long,
)
