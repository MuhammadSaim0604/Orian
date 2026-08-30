package com.mobileautomation.storage

import android.content.Context

/**
 * The AI provider registry - the storage module's third public type.
 *
 * Replaces the single-provider `ProviderCredentialStore` arrangement, where one base URL and one model
 * lived in SharedPreferences (issue B6). Several providers now coexist and one is active, and both modes
 * read the same registry: the provider is a root-level concern shared by Agent Mode and Workflow Mode
 * (issue A5), so it must not belong to either.
 *
 * **Keys are not here.** Non-secret fields are rows in Room; each provider's key is encrypted in the
 * Android Keystore under an alias derived from the provider id, which is the `ProviderKeyStore`'s job.
 * The split is deliberate and worth restating at every layer, because the convenient mistake - putting
 * the key on the row so an edit form can show it - is exactly what ADR 0007 forbids.
 *
 * Room types stay behind this class, for the same reason as [WorkflowStore]: a caller that touched the
 * database would need Room on its own classpath.
 */
class ProviderRegistryStore(
    context: Context,
) {
    private val dao = AutomationDatabase.get(context).providers()

    /** Every configured provider, oldest first. Never includes a key. */
    suspend fun list(): List<StoredProvider> = dao.list().map { it.toStored() }

    /**
     * The provider a run should use, or null when none is configured.
     *
     * Null is a real state the caller must handle - a fresh install has no provider - and it is
     * different from "configured but missing a key", which the caller learns from the key store.
     */
    suspend fun active(): StoredProvider? = dao.findActive()?.toStored()

    suspend fun find(id: String): StoredProvider? = dao.findById(id)?.toStored()

    /**
     * Adds or updates a provider.
     *
     * The first provider added becomes active automatically. Requiring an explicit activation step would
     * mean a user who configured exactly one provider and then found the agent refusing to run.
     */
    suspend fun save(
        id: String,
        label: String,
        baseUrl: String,
        model: String?,
    ): StoredProvider {
        val existing = dao.findById(id)
        val isFirst = dao.count() == 0

        val entity =
            ProviderEntity(
                id = id,
                label = label,
                baseUrl = baseUrl,
                model = model,
                // Preserved across an edit: changing a label should not throw away a discovered model
                // list and force another network round trip.
                models = existing?.models,
                modelsFetchedAtEpochMs = existing?.modelsFetchedAtEpochMs,
                isActive = existing?.isActive ?: isFirst,
                createdAtEpochMs = existing?.createdAtEpochMs ?: System.currentTimeMillis(),
            )

        dao.upsert(entity)
        return entity.toStored()
    }

    suspend fun setActive(id: String) {
        if (dao.findById(id) == null) return
        dao.setActive(id)
    }

    /**
     * Deletes a provider, re-electing an active one if this was it.
     *
     * Without the re-election, deleting the active provider would leave every provider inactive and the
     * agent reporting that none is configured while the settings screen shows two.
     */
    suspend fun remove(id: String) {
        val removed = dao.findById(id) ?: return

        dao.deleteById(id)

        if (removed.isActive) {
            dao.oldest()?.let { dao.setActive(it.id) }
        }
    }

    /** Records a discovered or manually entered model list. */
    suspend fun putModels(
        id: String,
        models: List<String>,
    ) {
        if (dao.findById(id) == null) return
        dao.putModels(id, encodeModels(models), System.currentTimeMillis())
    }

    suspend fun putModel(
        id: String,
        model: String,
    ) {
        if (dao.findById(id) == null) return
        dao.putModel(id, model)
    }

    suspend fun count(): Int = dao.count()

    private fun ProviderEntity.toStored(): StoredProvider =
        StoredProvider(
            id = id,
            label = label,
            baseUrl = baseUrl,
            model = model,
            models = decodeModels(models),
            modelsFetchedAtEpochMs = modelsFetchedAtEpochMs,
            isActive = isActive,
            createdAtEpochMs = createdAtEpochMs,
        )

    companion object {
        /**
         * Encodes a model list as a JSON array, by hand.
         *
         * `org.json` is **stubbed in Android JVM unit tests** and returns default values, so anything
         * that must be unit-testable off-device cannot use it. `android/bridge` and the rest of this
         * module hand-roll JSON for the same reason.
         */
        fun encodeModels(models: List<String>): String =
            models.joinToString(prefix = "[", postfix = "]") { "\"${escape(it)}\"" }

        /**
         * Decodes that array.
         *
         * Tolerant by design: a malformed cache is not worth failing a settings screen over, and an
         * empty list simply means the user re-runs discovery or types a name.
         */
        fun decodeModels(encoded: String?): List<String> {
            if (encoded == null) return emptyList()

            val trimmed = encoded.trim()
            if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return emptyList()

            val body = trimmed.substring(1, trimmed.length - 1).trim()
            if (body.isEmpty()) return emptyList()

            return splitTopLevel(body).mapNotNull { unquote(it.trim()) }
        }

        private fun escape(value: String): String =
            value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")

        /**
         * Splits on commas that are not inside a string.
         *
         * Model ids can legitimately contain a comma in principle, and a naive `split(",")` would tear
         * one in half - producing two model names that do not exist.
         */
        private fun splitTopLevel(body: String): List<String> {
            val parts = mutableListOf<String>()
            val current = StringBuilder()
            var inString = false
            var escaped = false

            for (character in body) {
                when {
                    escaped -> {
                        current.append(character)
                        escaped = false
                    }
                    character == '\\' -> {
                        current.append(character)
                        escaped = true
                    }
                    character == '"' -> {
                        current.append(character)
                        inString = !inString
                    }
                    character == ',' && !inString -> {
                        parts.add(current.toString())
                        current.clear()
                    }
                    else -> current.append(character)
                }
            }

            if (current.isNotEmpty()) parts.add(current.toString())
            return parts
        }

        private fun unquote(value: String): String? {
            if (value.length < 2 || !value.startsWith("\"") || !value.endsWith("\"")) return null

            return value
                .substring(1, value.length - 1)
                .replace("\\\"", "\"")
                .replace("\\\\", "\\")
                .ifEmpty { null }
        }
    }
}
