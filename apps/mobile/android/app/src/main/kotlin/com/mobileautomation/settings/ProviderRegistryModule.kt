package com.mobileautomation.settings

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap
import com.mobileautomation.storage.ProviderRegistryStore
import com.mobileautomation.storage.StoredProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * The AI provider registry, exposed to React Native.
 *
 * Replaces the single-provider `ProviderSettingsModule` for everything except the legacy read path (issue
 * B6). Several providers, one active, shared by both modes — the registry is a root-level concern and must
 * not belong to Agent Mode or Workflow Mode (issue A5).
 *
 * **The key never crosses this bridge outward.** `setKey` writes, `hasKey` reports existence, and
 * `getActiveKey` is called only by the provider client immediately before a request. There is deliberately
 * no method that lists keys or returns one by id for display: a screen has no legitimate use for the value,
 * and an API that offered it would eventually be called (ADR 0007).
 *
 * The registry's rows and the keys live in different places — Room and the Keystore — so this module is the
 * one place that knows both. It reports them together as `hasApiKey` on each provider, which is the only
 * combined view anything needs.
 */
class ProviderRegistryModule(
    reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    private val registry = ProviderRegistryStore(reactContext.applicationContext)
    private val keys = ProviderKeyStore(reactContext.applicationContext)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun getName(): String = NAME

    override fun invalidate() {
        scope.cancel()
        super.invalidate()
    }

    /** Every provider, with whether each has a key. Never with the key. */
    @ReactMethod
    fun list(promise: Promise) {
        scope.launch {
            try {
                val array = WritableNativeArray()
                for (provider in registry.list()) array.pushMap(provider.toMap())
                promise.resolve(array)
            } catch (error: Exception) {
                promise.reject("provider_read_failed", error.message, error)
            }
        }
    }

    /**
     * The provider a run should use, or null.
     *
     * Null is a real state — a fresh install has none — and distinct from a provider configured without a
     * key, which the caller sees as `hasApiKey` false.
     */
    @ReactMethod
    fun getActive(promise: Promise) {
        scope.launch {
            try {
                promise.resolve(registry.active()?.toMap())
            } catch (error: Exception) {
                promise.reject("provider_read_failed", error.message, error)
            }
        }
    }

    /**
     * Adds or updates a provider.
     *
     * Non-secret fields only. The key is a separate call, so no code path exists in which a provider row
     * and a credential travel together.
     */
    @ReactMethod
    fun save(
        id: String,
        label: String,
        baseUrl: String,
        model: String?,
        promise: Promise,
    ) {
        scope.launch {
            try {
                promise.resolve(registry.save(id, label, baseUrl, model).toMap())
            } catch (error: Exception) {
                promise.reject("provider_write_failed", error.message, error)
            }
        }
    }

    @ReactMethod
    fun setActive(
        id: String,
        promise: Promise,
    ) {
        scope.launch {
            try {
                registry.setActive(id)
                promise.resolve(null)
            } catch (error: Exception) {
                promise.reject("provider_write_failed", error.message, error)
            }
        }
    }

    /** Deletes a provider and its key. Both, or the Keystore would accumulate orphaned entries. */
    @ReactMethod
    fun remove(
        id: String,
        promise: Promise,
    ) {
        scope.launch {
            try {
                registry.remove(id)
                keys.clearKey(id)
                promise.resolve(null)
            } catch (error: Exception) {
                promise.reject("provider_write_failed", error.message, error)
            }
        }
    }

    /** Records a discovered or manually entered model list. */
    @ReactMethod
    fun setModels(
        id: String,
        models: com.facebook.react.bridge.ReadableArray,
        promise: Promise,
    ) {
        scope.launch {
            try {
                val names = mutableListOf<String>()

                for (index in 0 until models.size()) {
                    models.getString(index)?.takeIf { it.isNotBlank() }?.let { names.add(it) }
                }

                registry.putModels(id, names)
                promise.resolve(null)
            } catch (error: Exception) {
                promise.reject("provider_write_failed", error.message, error)
            }
        }
    }

    @ReactMethod
    fun setModel(
        id: String,
        model: String,
        promise: Promise,
    ) {
        scope.launch {
            try {
                registry.putModel(id, model)
                promise.resolve(null)
            } catch (error: Exception) {
                promise.reject("provider_write_failed", error.message, error)
            }
        }
    }

    /**
     * Stores a provider's key.
     *
     * Resolves false when the keystore refused, so the UI can say the key was not saved rather than
     * showing a crash or, worse, implying success.
     */
    @ReactMethod
    fun setKey(
        id: String,
        apiKey: String?,
        promise: Promise,
    ) {
        try {
            promise.resolve(keys.putKey(id, apiKey))
        } catch (error: Exception) {
            promise.reject("keystore_failed", error.message, error)
        }
    }

    /** Whether a key is stored. The only question about a key that a screen may ask. */
    @ReactMethod
    fun hasKey(
        id: String,
        promise: Promise,
    ) {
        try {
            promise.resolve(keys.hasKey(id))
        } catch (error: Exception) {
            promise.reject("keystore_failed", error.message, error)
        }
    }

    /**
     * Reads the active provider's key.
     *
     * Called by the provider client at the moment of a request and nowhere else. Deliberately keyed on
     * "active" rather than taking an id: a caller that could name any provider could enumerate keys, and
     * the only key anyone legitimately needs is the one about to be used.
     */
    @ReactMethod
    fun getActiveKey(promise: Promise) {
        scope.launch {
            try {
                val active = registry.active()
                promise.resolve(if (active == null) null else keys.getKey(active.id))
            } catch (error: Exception) {
                promise.reject("keystore_failed", error.message, error)
            }
        }
    }

    private fun StoredProvider.toMap(): WritableNativeMap {
        val map = WritableNativeMap()
        map.putString("id", id)
        map.putString("label", label)
        map.putString("baseUrl", baseUrl)
        map.putString("model", model)

        val modelArray = WritableNativeArray()
        for (name in models) modelArray.pushString(name)
        map.putArray("models", modelArray)

        // A double because the bridge has no 64-bit integer and epoch milliseconds truncate as an Int.
        //
        // Bound to a local first: `modelsFetchedAtEpochMs` is a public property from another Gradle module,
        // which Kotlin refuses to smart-cast because that module could change it between the null check and
        // the read.
        val fetchedAt = modelsFetchedAtEpochMs
        if (fetchedAt == null) {
            map.putNull("modelsFetchedAtEpochMs")
        } else {
            map.putDouble("modelsFetchedAtEpochMs", fetchedAt.toDouble())
        }

        map.putBoolean("isActive", isActive)
        map.putDouble("createdAtEpochMs", createdAtEpochMs.toDouble())

        // Read from the Keystore, not from the row. The two live in different places precisely so that a
        // row can be inspected without exposing a credential.
        map.putBoolean("hasApiKey", keys.hasKey(id))

        return map
    }

    companion object {
        const val NAME = "ProviderRegistry"
    }
}
