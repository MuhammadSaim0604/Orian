package com.mobileautomation.storage

import android.content.Context

/**
 * Chat sessions, exposed as the storage module's second public type.
 *
 * Separate from [WorkflowStore] rather than added to it. The two have nothing in common beyond both
 * using Room: a workflow is a document a user edits, a session is a conversation that grows one message
 * at a time. Folding sessions into `WorkflowStore` would make Agent Mode depend on a type named after
 * Workflow Mode's central object, which is exactly the coupling ADR 0011 exists to prevent.
 *
 * Everything here speaks plain Kotlin. Room types stay behind it, because a caller that touched
 * `AutomationDatabase` would need Room on its own compile classpath and the module boundary would be
 * decorative - which is how the Phase 6 CI failure happened.
 */
class SessionStore(
    context: Context,
) {
    private val dao = AutomationDatabase.get(context).chatSessions()

    /**
     * Sessions for one mode, most recently active first.
     *
     * Scoped by mode at the query, not filtered by the caller. Agent Mode must not be able to see the
     * builder agent's conversations even by accident (ADR 0014): the builder agent has no device tools,
     * and mixing the two transcripts would put device actions in a context where they cannot happen.
     */
    suspend fun list(mode: String): List<StoredSessionSummary> =
        dao.listSummaries(mode).map {
            StoredSessionSummary(
                id = it.id,
                mode = it.mode,
                title = it.title,
                messageCount = it.messageCount,
                createdAtEpochMs = it.createdAtEpochMs,
                updatedAtEpochMs = it.updatedAtEpochMs,
            )
        }

    /**
     * Creates a session.
     *
     * The id comes from the caller so the UI can navigate to the new session without waiting for the
     * write. A session that exists on screen before it exists on disk is fine; a screen that cannot open
     * until a database round trip finishes is a visible stall for no reason.
     */
    suspend fun create(
        id: String,
        mode: String,
        title: String,
    ): StoredSessionSummary {
        val nowMs = System.currentTimeMillis()

        dao.upsert(
            ChatSessionEntity(
                id = id,
                mode = mode,
                title = title,
                createdAtEpochMs = nowMs,
                updatedAtEpochMs = nowMs,
            ),
        )

        return StoredSessionSummary(
            id = id,
            mode = mode,
            title = title,
            messageCount = 0,
            createdAtEpochMs = nowMs,
            updatedAtEpochMs = nowMs,
        )
    }

    /**
     * Renames a session.
     *
     * Does **not** bump activity time to now. Renaming is housekeeping, and reordering the sidebar
     * because someone fixed a typo would move the conversation they were looking at.
     */
    suspend fun rename(
        id: String,
        title: String,
    ) {
        val existing = dao.findById(id) ?: return
        dao.rename(id, title, existing.updatedAtEpochMs)
    }

    /** Deletes a session. Its messages cascade. */
    suspend fun remove(id: String) = dao.deleteById(id)

    suspend fun count(mode: String): Int = dao.count(mode)

    suspend fun exists(id: String): Boolean = dao.findById(id) != null

    // --- messages ---------------------------------------------------------

    /** The whole transcript, oldest first. */
    suspend fun messages(sessionId: String): List<StoredMessage> = dao.listMessages(sessionId).map { it.toStored() }

    /**
     * The most recent messages, oldest first.
     *
     * For seeding the agent's memory: a long session's full transcript would not fit in a prompt, and
     * the recent past is what the model needs. Reversed here because SQLite can only take the last N
     * rows in descending order.
     */
    suspend fun recentMessages(
        sessionId: String,
        limit: Int,
    ): List<StoredMessage> = dao.listRecentMessagesDescending(sessionId, limit).map { it.toStored() }.reversed()

    /**
     * The most recent messages of one role, oldest first.
     *
     * For replaying the model's conversation, stored under `ROLE_WIRE`. Filtered in SQL because the table
     * interleaves the user's transcript with the wire messages: an unfiltered window of sixty rows might hold
     * twenty replayable messages or none, depending on how much narration the run produced.
     */
    suspend fun recentMessagesByRole(
        sessionId: String,
        role: String,
        limit: Int,
    ): List<StoredMessage> =
        dao
            .listRecentMessagesByRoleDescending(sessionId, role, limit)
            .map { it.toStored() }
            .reversed()

    /**
     * Appends a message.
     *
     * Returns false when the session is gone rather than throwing. A run can outlive the session it
     * belongs to - the user can delete a conversation while the agent is still working in it - and a
     * rejected insert would surface as a crash mid-run for something the user did deliberately. The
     * foreign key would reject it anyway; checking first makes the outcome predictable.
     */
    suspend fun appendMessage(
        id: String,
        sessionId: String,
        role: String,
        text: String,
        detail: String?,
        runId: String?,
    ): Boolean {
        if (dao.findById(sessionId) == null) return false

        dao.appendMessage(
            ChatMessageEntity(
                id = id,
                sessionId = sessionId,
                role = role,
                text = text,
                detail = detail,
                runId = runId,
                createdAtEpochMs = System.currentTimeMillis(),
            ),
        )

        return true
    }

    /** Empties a session without deleting it, for a user who wants to start over in place. */
    suspend fun clearMessages(sessionId: String) = dao.deleteMessages(sessionId)

    suspend fun messageCount(sessionId: String): Int = dao.messageCount(sessionId)

    private fun ChatMessageEntity.toStored(): StoredMessage =
        StoredMessage(
            id = id,
            sessionId = sessionId,
            role = role,
            text = text,
            detail = detail,
            runId = runId,
            createdAtEpochMs = createdAtEpochMs,
        )

    companion object {
        /** Agent Mode's conversations. */
        const val MODE_AGENT = "agent"

        /** The workflow builder agent's conversations, isolated from the above (ADR 0014). */
        const val MODE_WORKFLOW_BUILDER = "workflowBuilder"

        /**
         * The role under which the model's own conversation is stored.
         *
         * Distinct from the transcript roles because it serves a different reader. A `tool` row's text is a
         * readable summary of what a call did; a `wire` row's `detail` is the exact Chat Completions message the
         * model was sent, including the `tool_call_id` links that make a request valid. Replaying the summary
         * instead would replay a conversation that never happened.
         */
        const val ROLE_WIRE = "wire"

        /**
         * How many messages to replay from a session.
         *
         * Sixty is roughly twenty tool calls with their answers — enough for the model to know what it already
         * tried, and small enough that the request stays affordable. It costs less than it used to: the tool
         * list now travels in the request's `tools` array and a UI tree arrives once as a tool result, rather
         * than both being re-injected on every call.
         */
        const val MEMORY_SEED_MESSAGES = 60
    }
}
