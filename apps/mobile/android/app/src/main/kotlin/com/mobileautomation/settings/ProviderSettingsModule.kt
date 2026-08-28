package com.mobileautomation.settings

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap

/**
 * Exposes AI provider settings to React Native.
 *
 * The asymmetry is the point: TypeScript can **write** the API key and ask whether one
 * exists, but the only way to read it back is `getApiKey`, which the provider client calls
 * at the moment of a request. Nothing keeps it in JS state, no screen renders it, and it
 * never enters a prompt (ADR 0007).
 *
 * `getSettings` deliberately returns `hasApiKey` rather than the key, so the settings
 * screen can show whether one is configured without ever holding it.
 */
class ProviderSettingsModule(
    reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    private val store = ProviderCredentialStore(reactContext.applicationContext)

    override fun getName(): String = NAME

    /** The non-secret settings, plus whether a key is stored. */
    @ReactMethod
    fun getSettings(promise: Promise) {
        try {
            val result = WritableNativeMap()
            result.putString("baseUrl", store.getBaseUrl())
            result.putString("model", store.getModel())
            result.putBoolean("hasApiKey", store.hasApiKey())
            promise.resolve(result)
        } catch (error: Exception) {
            promise.reject("settings_read_failed", error.message, error)
        }
    }

    @ReactMethod
    fun setBaseUrl(
        baseUrl: String,
        promise: Promise,
    ) {
        try {
            store.putBaseUrl(baseUrl)
            promise.resolve(null)
        } catch (error: Exception) {
            promise.reject("settings_write_failed", error.message, error)
        }
    }

    @ReactMethod
    fun setModel(
        model: String,
        promise: Promise,
    ) {
        try {
            store.putModel(model)
            promise.resolve(null)
        } catch (error: Exception) {
            promise.reject("settings_write_failed", error.message, error)
        }
    }

    /**
     * Stores the API key, encrypted.
     *
     * Resolves false rather than rejecting when the keystore is unavailable, so the
     * settings screen can tell the user their key could not be saved instead of showing
     * a crash.
     */
    @ReactMethod
    fun setApiKey(
        apiKey: String?,
        promise: Promise,
    ) {
        try {
            promise.resolve(store.putApiKey(apiKey))
        } catch (error: Exception) {
            promise.reject("keystore_failed", error.message, error)
        }
    }

    /**
     * Reads the key back.
     *
     * Called only by the provider client, immediately before a request. Not surfaced in
     * any screen.
     */
    @ReactMethod
    fun getApiKey(promise: Promise) {
        try {
            promise.resolve(store.getApiKey())
        } catch (error: Exception) {
            promise.reject("keystore_failed", error.message, error)
        }
    }

    @ReactMethod
    fun clear(promise: Promise) {
        try {
            store.clear()
            promise.resolve(null)
        } catch (error: Exception) {
            promise.reject("settings_write_failed", error.message, error)
        }
    }

    companion object {
        const val NAME = "ProviderSettings"
    }
}
