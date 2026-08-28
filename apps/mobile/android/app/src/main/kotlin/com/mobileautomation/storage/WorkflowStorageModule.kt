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

    // --- traces (Phase 9) --------------------------------------------------

    /** Recorded runs, newest first. Never reads the documents. */
    @ReactMethod
    fun listTraces(promise: Promise) {
        scope.launch {
            try {
                val array = WritableNativeArray()

                for (summary in store.listTraces()) {
                    val map = WritableNativeMap()
                    map.putString("id", summary.id)
                    map.putString("goal", summary.goal)
                    map.putString("outcome", summary.outcome)
                    map.putInt("stepCount", summary.stepCount)
                    map.putDouble("recordedAtEpochMs", summary.recordedAtEpochMs.toDouble())
                    array.pushMap(map)
                }

                promise.resolve(array)
            } catch (error: Exception) {
                promise.reject("storage_read_failed", error.message, error)
            }
        }
    }

    @ReactMethod
    fun loadTrace(
        id: String,
        promise: Promise,
    ) {
        scope.launch {
            try {
                promise.resolve(store.loadTrace(id))
            } catch (error: Exception) {
                promise.reject("storage_read_failed", error.message, error)
            }
        }
    }

    /**
     * Saves a recorded run.
     *
     * The queryable columns are passed alongside the document rather than parsed out of it. A
     * trace's shape is more elaborate than a workflow's, and a second hand-rolled parser here
     * would be a second thing to keep in step with the TypeScript schema.
     */
    @ReactMethod
    fun saveTrace(
        id: String,
        runId: String,
        goal: String,
        outcome: String,
        stepCount: Int,
        document: String,
        promise: Promise,
    ) {
        scope.launch {
            try {
                store.saveTrace(id, runId, goal, outcome, stepCount, document)
                promise.resolve(null)
            } catch (error: Exception) {
                promise.reject("storage_write_failed", error.message, error)
            }
        }
    }

    @ReactMethod
    fun removeTrace(
        id: String,
        promise: Promise,
    ) {
        scope.launch {
            try {
                store.removeTrace(id)
                promise.resolve(null)
            } catch (error: Exception) {
                promise.reject("storage_write_failed", error.message, error)
            }
        }
    }

    /** Where this trace's screenshots belong, for the recorder to write into. */
    @ReactMethod
    fun traceScreenshotDirectory(
        id: String,
        promise: Promise,
    ) {
        scope.launch {
            try {
                promise.resolve(store.screenshotDirectoryFor(id))
            } catch (error: Exception) {
                promise.reject("storage_read_failed", error.message, error)
            }
        }
    }

    /** Bytes held by trace screenshots, so the UI can say what recordings cost. */
    @ReactMethod
    fun traceStorageUsed(promise: Promise) {
        scope.launch {
            try {
                promise.resolve(store.screenshotBytesUsed().toDouble())
            } catch (error: Exception) {
                promise.reject("storage_read_failed", error.message, error)
            }
        }
    }

    companion object {
        const val NAME = "WorkflowStorage"
    }
}
