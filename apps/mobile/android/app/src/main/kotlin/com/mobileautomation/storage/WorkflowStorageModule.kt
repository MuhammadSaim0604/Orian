package com.mobileautomation.storage

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Workflow persistence, exposed to React Native.
 *
 * Talks to `WorkflowStore` rather than to Room directly. That is not just tidiness: Room's
 * generated code needs its annotation processor on the compile classpath, and reaching past the
 * facade made this file fail to compile in CI with "cannot access RoomDatabase" - the module
 * boundary has to be real to be useful.
 *
 * The workflow document crosses as a JSON **string** rather than a bridge map. Converting a
 * nested workflow to `ReadableMap` and back would need a Kotlin mirror of a schema that
 * TypeScript and third-party node packages own, and every node config change would break it.
 *
 * Database work runs on IO with its own scope, cancelled when the module is torn down - a write
 * outliving the React context would otherwise resolve a promise nobody is listening to.
 */
class WorkflowStorageModule(
    reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    private val store = WorkflowStore(reactContext.applicationContext)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun getName(): String = NAME

    override fun invalidate() {
        scope.cancel()
        super.invalidate()
    }

    /** Summaries for the list screen. Never reads the documents. */
    @ReactMethod
    fun list(promise: Promise) {
        scope.launch {
            try {
                val array = WritableNativeArray()

                for (summary in store.list()) {
                    val map = WritableNativeMap()
                    map.putString("id", summary.id)
                    map.putString("name", summary.name)
                    map.putString("description", summary.description)
                    map.putInt("nodeCount", summary.nodeCount)
                    // A double because the bridge has no 64-bit integer, and an epoch
                    // millisecond value silently truncates as an Int.
                    map.putDouble("updatedAtEpochMs", summary.updatedAtEpochMs.toDouble())
                    array.pushMap(map)
                }

                promise.resolve(array)
            } catch (error: Exception) {
                promise.reject("storage_read_failed", error.message, error)
            }
        }
    }

    @ReactMethod
    fun load(
        id: String,
        promise: Promise,
    ) {
        scope.launch {
            try {
                promise.resolve(store.load(id))
            } catch (error: Exception) {
                promise.reject("storage_read_failed", error.message, error)
            }
        }
    }

    @ReactMethod
    fun save(
        id: String,
        document: String,
        promise: Promise,
    ) {
        scope.launch {
            try {
                store.save(id, document)
                promise.resolve(null)
            } catch (error: Exception) {
                promise.reject("storage_write_failed", error.message, error)
            }
        }
    }

    @ReactMethod
    fun remove(
        id: String,
        promise: Promise,
    ) {
        scope.launch {
            try {
                store.remove(id)
                promise.resolve(null)
            } catch (error: Exception) {
                promise.reject("storage_write_failed", error.message, error)
            }
        }
    }

    @ReactMethod
    fun count(promise: Promise) {
        scope.launch {
            try {
                promise.resolve(store.count())
            } catch (error: Exception) {
                promise.reject("storage_read_failed", error.message, error)
            }
        }
    }

    companion object {
        const val NAME = "WorkflowStorage"
    }
}
