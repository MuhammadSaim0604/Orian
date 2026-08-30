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
 * Chat session persistence, exposed to React Native.
 *
 * Talks to `SessionStore`, not to Room. The boundary has to be real: reaching past the facade made
 * `WorkflowStorageModule` fail to compile in CI with "cannot access RoomDatabase", because Room's generated
 * code needs its annotation processor on the compile classpath.
 *
 * A separate module from `WorkflowStorage` rather than more methods on it. Agent Mode should not have to
 * call something named after workflows to save a conversation, and the two are free to diverge — which is
 * the whole point of ADR 0011.
 *
 * Database work runs on IO in a scope cancelled with the module, so a write cannot outlive the React context
 * and resolve a promise nobody is listening to.
 */
class SessionStorageModule(
    reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    private val store = SessionStore(reactContext.applicationContext)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun getName(): String = NAME

    override fun invalidate() {
        scope.cancel()
        super.invalidate()
    }

    /**
     * Sessions for one mode, most recently active first.
     *
     * The mode is a required argument rather than defaulted, so a caller cannot accidentally read the other
     * mode's conversations (ADR 0014). Agent Mode and the workflow builder agent are separate products that
     * happen to share a table.
     */
    @ReactMethod
    fun list(
        mode: String,
        promise: Promise,
    ) {
        scope.launch {
            try {
                val array = WritableNativeArray()

                for (session in store.list(mode)) {
                    val map = WritableNativeMap()
                    map.putString("id", session.id)
                    map.putString("mode", session.mode)
                    map.putString("title", session.title)
                    map.putInt("messageCount", session.messageCount)
                    // Doubles because the bridge has no 64-bit integer, and epoch milliseconds silently
                    // truncate as an Int.
                    map.putDouble("createdAtEpochMs", session.createdAtEpochMs.toDouble())
                    map.putDouble("updatedAtEpochMs", session.updatedAtEpochMs.toDouble())
                    array.pushMap(map)
                }

                promise.resolve(array)
            } catch (error: Exception) {
                promise.reject("session_read_failed", error.message, error)
            }
        }
    }

    @ReactMethod
    fun create(
        id: String,
        mode: String,
        title: String,
        promise: Promise,
    ) {
        scope.launch {
            try {
                val created = store.create(id, mode, title)

                val map = WritableNativeMap()
                map.putString("id", created.id)
                map.putString("mode", created.mode)
                map.putString("title", created.title)
                map.putInt("messageCount", created.messageCount)
                map.putDouble("createdAtEpochMs", created.createdAtEpochMs.toDouble())
                map.putDouble("updatedAtEpochMs", created.updatedAtEpochMs.toDouble())

                promise.resolve(map)
            } catch (error: Exception) {
                promise.reject("session_write_failed", error.message, error)
            }
        }
    }

    @ReactMethod
    fun rename(
        id: String,
        title: String,
        promise: Promise,
    ) {
        scope.launch {
            try {
                store.rename(id, title)
                promise.resolve(null)
            } catch (error: Exception) {
                promise.reject("session_write_failed", error.message, error)
            }
        }
    }

    /** Deletes a session. Its messages cascade, so there is no second call to forget. */
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
                promise.reject("session_write_failed", error.message, error)
            }
        }
    }

    @ReactMethod
    fun count(
        mode: String,
        promise: Promise,
    ) {
        scope.launch {
            try {
                promise.resolve(store.count(mode))
            } catch (error: Exception) {
                promise.reject("session_read_failed", error.message, error)
            }
        }
    }

    // --- messages ---------------------------------------------------------

    /** The whole transcript, oldest first — the order a conversation reads in. */
    @ReactMethod
    fun messages(
        sessionId: String,
        promise: Promise,
    ) {
        scope.launch {
            try {
                promise.resolve(store.messages(sessionId).toWritableArray())
            } catch (error: Exception) {
                promise.reject("session_read_failed", error.message, error)
            }
        }
    }

    /**
     * The most recent messages, oldest first.
     *
     * For seeding the agent's memory on a long session, where the full transcript would not fit in a
     * prompt.
     */
    @ReactMethod
    fun recentMessages(
        sessionId: String,
        limit: Int,
        promise: Promise,
    ) {
        scope.launch {
            try {
                promise.resolve(store.recentMessages(sessionId, limit).toWritableArray())
            } catch (error: Exception) {
                promise.reject("session_read_failed", error.message, error)
            }
        }
    }

    /**
     * Appends a message.
     *
     * Resolves **false** when the session no longer exists rather than rejecting. A run outliving its
     * session is a real case — the user can delete a conversation while the agent is still working in it —
     * and a rejection would surface mid-run as a crash for something they did on purpose.
     */
    @ReactMethod
    fun appendMessage(
        id: String,
        sessionId: String,
        role: String,
        text: String,
        detail: String?,
        runId: String?,
        promise: Promise,
    ) {
        scope.launch {
            try {
                promise.resolve(store.appendMessage(id, sessionId, role, text, detail, runId))
            } catch (error: Exception) {
                promise.reject("session_write_failed", error.message, error)
            }
        }
    }

    /** Empties a session without deleting it, for starting over in place. */
    @ReactMethod
    fun clearMessages(
        sessionId: String,
        promise: Promise,
    ) {
        scope.launch {
            try {
                store.clearMessages(sessionId)
                promise.resolve(null)
            } catch (error: Exception) {
                promise.reject("session_write_failed", error.message, error)
            }
        }
    }

    private fun List<StoredMessage>.toWritableArray(): WritableNativeArray {
        val array = WritableNativeArray()

        for (message in this) {
            val map = WritableNativeMap()
            map.putString("id", message.id)
            map.putString("sessionId", message.sessionId)
            map.putString("role", message.role)
            map.putString("text", message.text)
            map.putString("detail", message.detail)
            map.putString("runId", message.runId)
            map.putDouble("createdAtEpochMs", message.createdAtEpochMs.toDouble())
            array.pushMap(map)
        }

        return array
    }

    companion object {
        const val NAME = "SessionStorage"
    }
}
