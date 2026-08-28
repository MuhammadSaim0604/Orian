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
 * Storage for the AI provider credential.
 *
 * ADR 0007 requires the key to live in Android secure storage - never in plain SQLite,
 * never logged, never in a prompt. This encrypts it with a key held in the hardware-backed
 * Android Keystore, so the ciphertext in SharedPreferences is useless without the device.
 *
 * Written by hand rather than with `androidx.security:security-crypto`, which is
 * deprecated and whose replacement is not yet stable. The primitive needed here is small:
 * one AES-GCM key, one value.
 *
 * The base URL and model name are **not** secret and are stored in the clear. Encrypting
 * them would imply they are sensitive, which invites treating the key with the same
 * casualness as the URL.
 */
class ProviderCredentialStore(context: Context) {
    private val preferences: SharedPreferences =
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    /**
     * Stores the key, or clears it when null.
     *
     * Returns false rather than throwing if the keystore is unavailable - some devices
     * with a broken or reset keystore would otherwise make the settings screen crash
     * rather than report a problem.
     */
    fun putApiKey(apiKey: String?): Boolean {
        if (apiKey.isNullOrEmpty()) {
            preferences.edit().remove(KEY_API_KEY).remove(KEY_API_KEY_IV).apply()
            return true
        }

        return try {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, secretKey())

            val encrypted = cipher.doFinal(apiKey.toByteArray(Charsets.UTF_8))

            preferences
                .edit()
                .putString(KEY_API_KEY, encode(encrypted))
                // The IV must be kept with the ciphertext: GCM needs the same one to
                // decrypt, and it is not itself secret.
                .putString(KEY_API_KEY_IV, encode(cipher.iv))
                .apply()

            true
        } catch (error: Exception) {
            false
        }
    }

    /**
     * Reads the key back, or null when none is stored or it cannot be decrypted.
     *
     * A decryption failure is treated as "no key" rather than an error. It means the
     * keystore entry was invalidated - by a factory reset, a restored backup, or the user
     * changing their lock screen - and the only remedy is for them to enter it again.
     */
    fun getApiKey(): String? {
        val stored = preferences.getString(KEY_API_KEY, null) ?: return null
        val iv = preferences.getString(KEY_API_KEY_IV, null) ?: return null

        return try {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(TAG_LENGTH_BITS, decode(iv)))
            String(cipher.doFinal(decode(stored)), Charsets.UTF_8)
        } catch (error: Exception) {
            null
        }
    }

    /** Whether a key is stored, without decrypting it. */
    fun hasApiKey(): Boolean = preferences.contains(KEY_API_KEY)

    fun putBaseUrl(baseUrl: String) {
        preferences.edit().putString(KEY_BASE_URL, baseUrl).apply()
    }

    fun getBaseUrl(): String? = preferences.getString(KEY_BASE_URL, null)

    fun putModel(model: String) {
        preferences.edit().putString(KEY_MODEL, model).apply()
    }

    fun getModel(): String? = preferences.getString(KEY_MODEL, null)

    /** Removes everything, for a user who wants their credential gone. */
    fun clear() {
        preferences.edit().clear().apply()
    }

    /**
     * Fetches or creates the encryption key.
     *
     * `setUserAuthenticationRequired` is deliberately not set. It would require the user
     * to unlock the device every time the agent read the key, which for a background
     * automation run means the run simply fails - the protection would cost the feature.
     */
    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE_TYPE).apply { load(null) }

        val existing = keyStore.getKey(KEY_ALIAS, null) as? SecretKey
        if (existing != null) return existing

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_TYPE)

        generator.init(
            KeyGenParameterSpec
                .Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(KEY_SIZE_BITS)
                .build(),
        )

        return generator.generateKey()
    }

    private fun encode(bytes: ByteArray): String = Base64.encodeToString(bytes, Base64.NO_WRAP)

    private fun decode(value: String): ByteArray = Base64.decode(value, Base64.NO_WRAP)

    companion object {
        private const val PREFERENCES_NAME = "ai_provider_settings"
        private const val KEYSTORE_TYPE = "AndroidKeyStore"
        private const val KEY_ALIAS = "ai_provider_api_key"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val TAG_LENGTH_BITS = 128
        private const val KEY_SIZE_BITS = 256

        private const val KEY_API_KEY = "api_key"
        private const val KEY_API_KEY_IV = "api_key_iv"
        private const val KEY_BASE_URL = "base_url"
        private const val KEY_MODEL = "model"
    }
}
