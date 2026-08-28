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
 * The workflow document crosses as a JSON **string** rather than a bridge map. Converting a
 * nested workflow to `ReadableMap` and back would need a Kotlin mirror of a schema that
 * TypeScript and third-party node packages own, and every node config change would break it.
 * As a string the document is opaque here, which is exactly what keeps this layer stable.
 *
 * Database work runs on IO with its own scope, cancelled when the module is torn down - a
 * write outliving the React context would otherwise resolve a promise nobody is listening to.
 */
class WorkflowStorageModule(
    reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    private val dao = AutomationDatabase.get(reactContext.applicationContext).workflows()
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

                for (summary in dao.listSummaries()) {
                    val map = WritableNativeMap()
                    map.putString("id", summary.id)
                    map.putString("name", summary.name)
                    map.putString("description", summary.description)
                    map.putInt("nodeCount", summary.nodeCount)
                    // Doubles because the bridge has no 64-bit integer, and an epoch
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

    /** The full document, or null when there is no such workflow. */
    @ReactMethod
    fun load(
        id: String,
        promise: Promise,
    ) {
        scope.launch {
            try {
                promise.resolve(dao.findById(id)?.document)
            } catch (error: Exception) {
                promise.reject("storage_read_failed", error.message, error)
            }
        }
    }

    /**
     * Saves a workflow.
     *
     * The queryable columns are derived from the document here rather than passed separately,
     * so a list row can never disagree with the document it describes.
     */
    @ReactMethod
    fun save(
        id: String,
        document: String,
        promise: Promise,
    ) {
        scope.launch {
            try {
                val existing = dao.findById(id)
                val nowMs = System.currentTimeMillis()

                dao.upsert(
                    WorkflowEntity(
                        id = id,
                        name = WorkflowDocumentReader.readName(document),
                        description = WorkflowDocumentReader.readDescription(document),
                        document = document,
                        nodeCount = WorkflowDocumentReader.readNodeCount(document),
                        // Preserved on update, so re-saving does not make an old workflow look
                        // newly created.
                        createdAtEpochMs = existing?.createdAtEpochMs ?: nowMs,
                        updatedAtEpochMs = nowMs,
                    ),
                )

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
                dao.deleteById(id)
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
                promise.resolve(dao.count())
            } catch (error: Exception) {
                promise.reject("storage_read_failed", error.message, error)
            }
        }
    }

    companion object {
        const val NAME = "WorkflowStorage"
    }
}
