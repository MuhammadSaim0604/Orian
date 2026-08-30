package com.mobileautomation.storage

import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Transaction

/**
 * A configured AI provider - **everything except the key**.
 *
 * The API key is not here and must never be. It lives in the Android Keystore under an alias derived
 * from this row's id (ADR 0007), so this table can be read, backed up, or logged without exposing a
 * credential. That split is the reason a provider is a row here rather than a blob in SharedPreferences:
 * the non-secret half wants querying and ordering, the secret half wants encryption and nothing else.
 *
 * `models` is a cached JSON array of model ids from the provider's `/models` endpoint. Cached because
 * discovery needs a network round trip and the list changes rarely, and because a provider that does not
 * implement `/models` must still be usable - the user types a model name and it is stored here exactly
 * as if it had been discovered.
 */
@Entity(tableName = "ai_providers")
data class ProviderEntity(
    @PrimaryKey val id: String,
    /** What the user calls it, e.g. "OpenAI" or "my laptop". */
    @ColumnInfo(name = "label") val label: String,
    @ColumnInfo(name = "base_url") val baseUrl: String,
    /** The model to use. Null until one is chosen, which is a state the UI must handle. */
    @ColumnInfo(name = "model") val model: String?,
    /** Cached `/models` result as a JSON array of strings, or null when never discovered. */
    @ColumnInfo(name = "models") val models: String?,
    @ColumnInfo(name = "models_fetched_at") val modelsFetchedAtEpochMs: Long?,
    /**
     * Exactly one provider is active.
     *
     * Stored as a flag rather than a separate "active provider id" setting, so the invariant is
     * enforced in one transaction by the DAO instead of two writes that can disagree.
     */
    @ColumnInfo(name = "is_active") val isActive: Boolean,
    @ColumnInfo(name = "created_at") val createdAtEpochMs: Long,
)

/** A provider as a settings screen sees it. Room-free, and still without the key. */
data class StoredProvider(
    val id: String,
    val label: String,
    val baseUrl: String,
    val model: String?,
    /** Discovered or manually entered model ids. */
    val models: List<String>,
    val modelsFetchedAtEpochMs: Long?,
    val isActive: Boolean,
    val createdAtEpochMs: Long,
)

@Dao
interface ProviderDao {
    /** Oldest first, so the list does not reorder itself as the user edits. */
    @Query("SELECT * FROM ai_providers ORDER BY created_at ASC")
    suspend fun list(): List<ProviderEntity>

    @Query("SELECT * FROM ai_providers WHERE id = :id")
    suspend fun findById(id: String): ProviderEntity?

    @Query("SELECT * FROM ai_providers WHERE is_active = 1 LIMIT 1")
    suspend fun findActive(): ProviderEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(provider: ProviderEntity)

    @Query("DELETE FROM ai_providers WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("UPDATE ai_providers SET is_active = 0")
    suspend fun clearActive()

    @Query("UPDATE ai_providers SET is_active = 1 WHERE id = :id")
    suspend fun markActive(id: String)

    /**
     * Makes one provider active and every other inactive, atomically.
     *
     * A transaction because the two statements together are the invariant. Interleaved, they could leave
     * no provider active - and an agent run that finds no provider reports "add a key in settings" to a
     * user who has three configured.
     */
    @Transaction
    suspend fun setActive(id: String) {
        clearActive()
        markActive(id)
    }

    @Query(
        "UPDATE ai_providers SET models = :models, models_fetched_at = :fetchedAtEpochMs WHERE id = :id",
    )
    suspend fun putModels(
        id: String,
        models: String,
        fetchedAtEpochMs: Long,
    )

    @Query("UPDATE ai_providers SET model = :model WHERE id = :id")
    suspend fun putModel(
        id: String,
        model: String,
    )

    @Query("SELECT COUNT(*) FROM ai_providers")
    suspend fun count(): Int

    /** The oldest provider, used to re-elect an active one after the active provider is deleted. */
    @Query("SELECT * FROM ai_providers ORDER BY created_at ASC LIMIT 1")
    suspend fun oldest(): ProviderEntity?
}
