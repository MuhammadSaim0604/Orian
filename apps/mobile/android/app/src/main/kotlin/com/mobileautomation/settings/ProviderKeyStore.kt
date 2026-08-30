package com.mobileautomation.settings

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * API keys for several providers, one Keystore key each.
 *
 * The generalisation of [ProviderCredentialStore], which held exactly one key under one alias. A registry
 * needs one per provider, and **a shared alias would be wrong rather than merely untidy**: deleting one
 * provider would invalidate every other provider's key, and a user who removed a local gateway would find
 * their OpenAI key silently unreadable.
 *
 * ADR 0007 is unchanged and this is the layer that keeps it true:
 *
 * - The key is written and read, never listed. There is no "give me every key" method, because no screen
 *   has a legitimate reason to hold one and an API that offered it would eventually be used.
 * - [hasKey] answers the only question a settings screen actually has — whether one is configured.
 * - Reads happen at request time, from the provider client, and the value never enters JS state, a
 *   component tree, a log, or a prompt.
 *
 * Written by hand rather than with `androidx.security:security-crypto`, which is deprecated and whose
 * replacement is not stable. The primitive needed is one AES-GCM key per provider and one value each.
 */
class ProviderKeyStore(
    context: Context,
) {
    private val preferences: SharedPreferences =
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    /**
     * Stores a provider's key, or clears it when null or empty.
     *
     * Returns false rather than throwing when the keystore is unavailable — some devices have a broken or
     * reset keystore, and a settings screen should be able to say "your key could not be saved" instead of
     * crashing. Silently succeeding would be worse still: the user would believe they had configured a
     * provider and only discover otherwise when a run failed.
     */
    fun putKey(
        providerId: String,
        apiKey: String?,
    ): Boolean {
        if (providerId.isBlank()) return false

        if (apiKey.isNullOrEmpty()) {
            clearKey(providerId)
            return true
        }

        return try {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, secretKey(providerId))

            val encrypted = cipher.doFinal(apiKey.toByteArray(Charsets.UTF_8))

            preferences
                .edit()
                .putString(cipherKeyFor(providerId), encode(encrypted))
                // The IV must be kept alongside the ciphertext: GCM needs the same one to decrypt, and it
                // is not itself secret.
                .putString(ivKeyFor(providerId), encode(cipher.iv))
                .apply()

            true
        } catch (error: Exception) {
            false
        }
    }

    /**
     * Reads a provider's key back, or null.
     *
     * A decryption failure is reported as "no key" rather than an error. It means the Keystore entry was
     * invalidated — a factory reset, a restored backup, a changed lock screen — and the only remedy is for
     * the user to enter it again, which is exactly what "no key" leads them to.
     */
    fun getKey(providerId: String): String? {
        val stored = preferences.getString(cipherKeyFor(providerId), null) ?: return null
        val iv = preferences.getString(ivKeyFor(providerId), null) ?: return null

        return try {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(
                Cipher.DECRYPT_MODE,
                secretKey(providerId),
                GCMParameterSpec(TAG_LENGTH_BITS, decode(iv)),
            )
            String(cipher.doFinal(decode(stored)), Charsets.UTF_8)
        } catch (error: Exception) {
            null
        }
    }

    /** Whether a key is stored, without decrypting it. The only question a screen may ask. */
    fun hasKey(providerId: String): Boolean = preferences.contains(cipherKeyFor(providerId))

    /**
     * Forgets a provider's key and its Keystore entry.
     *
     * Both halves, because leaving the Keystore alias behind would accumulate an entry per provider ever
     * configured — and a later provider that happened to reuse the id would decrypt against a key it did
     * not create.
     */
    fun clearKey(providerId: String) {
        preferences
            .edit()
            .remove(cipherKeyFor(providerId))
            .remove(ivKeyFor(providerId))
            .apply()

        runCatching {
            KeyStore.getInstance(KEYSTORE_TYPE).apply { load(null) }.deleteEntry(aliasFor(providerId))
        }
    }

    /**
     * Fetches or creates a provider's encryption key.
     *
     * `setUserAuthenticationRequired` is deliberately not set. It would require the user to unlock the
     * device every time the agent read a key, and for a background automation run that means the run
     * simply fails — the protection would cost the feature it protects.
     */
    private fun secretKey(providerId: String): SecretKey {
        val alias = aliasFor(providerId)
        val keyStore = KeyStore.getInstance(KEYSTORE_TYPE).apply { load(null) }

        val existing = keyStore.getKey(alias, null) as? SecretKey
        if (existing != null) return existing

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_TYPE)

        generator.init(
            KeyGenParameterSpec
                .Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(KEY_SIZE_BITS)
                .build(),
        )

        return generator.generateKey()
    }

    private fun encode(bytes: ByteArray): String = Base64.encodeToString(bytes, Base64.NO_WRAP)

    private fun decode(value: String): ByteArray = Base64.decode(value, Base64.NO_WRAP)

    companion object {
        private const val PREFERENCES_NAME = "ai_provider_keys"
        private const val KEYSTORE_TYPE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val TAG_LENGTH_BITS = 128
        private const val KEY_SIZE_BITS = 256

        /**
         * The Keystore alias for a provider.
         *
         * Sanitised because a provider id reaches here from JavaScript and Keystore aliases are not
         * arbitrary strings. Prefixed so these entries are identifiable among any other app aliases, and
         * so a provider id could never collide with the single-provider alias this replaces.
         */
        fun aliasFor(providerId: String): String = "ai_provider_key_${sanitise(providerId)}"

        private fun cipherKeyFor(providerId: String): String = "key_${sanitise(providerId)}"

        private fun ivKeyFor(providerId: String): String = "iv_${sanitise(providerId)}"

        /**
         * Reduces an id to characters safe in an alias and a preferences key.
         *
         * Deliberately **not** a hash: a readable alias makes a Keystore dump diagnosable, and the ids are
         * generated by us rather than supplied by a user, so collisions between two different sanitised ids
         * are not a practical concern. Empty input is rejected by the callers instead.
         */
        private fun sanitise(providerId: String): String =
            providerId.map { character ->
                if (character.isLetterOrDigit() || character == '_' || character == '-') character else '_'
            }.joinToString("")
    }
}
