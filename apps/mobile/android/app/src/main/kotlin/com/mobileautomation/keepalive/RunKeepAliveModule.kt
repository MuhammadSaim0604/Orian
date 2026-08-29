package com.mobileautomation.keepalive

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import android.util.Log

/**
 * Keeps JavaScript timers running while the app is backgrounded.
 *
 * **The foreground service was not enough.** Device testing found the agent freezing the instant it
 * opened another app: it reported "Opening com.whatsapp" and stayed there until the app was reopened.
 * The service kept the process alive and the loop still stopped.
 *
 * The cause is in React Native itself. `JavaTimerManager` is a `LifecycleEventListener`:
 *
 * ```
 * override fun onHostPause() {
 *     isPaused.set(true)
 *     clearFrameCallback()   // removes the TIMERS_EVENTS choreographer callback
 * }
 * ```
 *
 * With that callback gone, **`setTimeout` and `setInterval` stop firing altogether** - not throttled,
 * stopped. The agent loop awaits timers between steps, so it stalls wherever it had reached. A
 * foreground service keeps the *process* alive, but the timer system is driven by the **activity**
 * lifecycle and the service has no bearing on it. That correction is recorded in ADR 0012.
 *
 * `clearFrameCallback` has exactly one escape hatch:
 *
 * ```
 * if (frameCallbackPosted && isPaused.get() && !headlessJsTaskContext.hasActiveTasks()) { ... }
 * ```
 *
 * An active headless task means the callback is never removed. So this module holds one open for the
 * duration of a run.
 *
 * **The task does no work.** It is a lifetime, not a worker: the run continues on the main JS context
 * exactly as ADR 0012 requires. Running the agent *inside* a headless task would give it a second
 * execution context with its own copy of the run controller's module state, which is the single thing
 * ADR 0016 exists to prevent.
 */
class RunKeepAliveModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    /** The task holding timers open, or null. At most one, because there is at most one run. */
    private var taskId: Int? = null

    override fun getName(): String = NAME

    override fun invalidate() {
        stopInternal()
        super.invalidate()
    }

    /**
     * Starts the keep-alive task.
     *
     * Resolves with whether timers are now protected, rather than rejecting. A run whose keep-alive
     * failed still works while the app is in front; refusing to run at all would be the worse outcome,
     * and the caller reports the degraded state instead.
     *
     * Two constraints from React Native, both of which make this look more roundabout than it is:
     *
     * - **`startTask` asserts it is on the UI thread**, and a `@ReactMethod` runs on the native modules
     *   thread. Hence the hop.
     * - **`isAllowedInForeground` must be true.** The task has to already be running before the activity
     *   pauses; a task started only on pause would race the very callback removal it exists to prevent,
     *   and `startTask` throws outright if a foreground-disallowed task is started while resumed.
     */
    @ReactMethod
    fun start(promise: Promise) {
        UiThreadUtil.runOnUiThread {
            if (taskId != null) {
                // Already held. Starting a second would leave one orphaned, and one is enough - the
                // timer manager only asks whether *any* task is active.
                promise.resolve(true)
                return@runOnUiThread
            }

            val started =
                runCatching {
                    val context = HeadlessJsTaskContext.getInstance(reactContext)

                    taskId =
                        context.startTask(
                            HeadlessJsTaskConfig(
                                TASK_KEY,
                                Arguments.createMap(),
                                // No timeout: the task lives as long as the run, and this layer cannot
                                // know how long that is. The agent's own step and deadline budgets are
                                // what bound a run.
                                0,
                                // Allowed in the foreground, which is the point - see the class comment.
                                //
                                // This four-argument constructor defaults the retry policy to
                                // NoRetryPolicy, which is what we want and also all we can have:
                                // NoRetryPolicy is declared internal, so Kotlin cannot name it even
                                // though the Java constructor taking it is public.
                                true,
                            ),
                        )

                    Log.i(TAG, "Keep-alive task ${taskId} started; JS timers will survive backgrounding")
                    true
                }.getOrElse { error ->
                    Log.w(TAG, "Could not start the keep-alive task; a backgrounded run may stall", error)
                    taskId = null
                    false
                }

            promise.resolve(started)
        }
    }

    /**
     * Ends the keep-alive task.
     *
     * Must be called on every exit from a run. An unfinished task keeps the choreographer callback
     * posted for the life of the process, which burns battery for no reason and - worse - makes the
     * next run's measurements look fine whether or not the mechanism actually works.
     */
    @ReactMethod
    fun stop(promise: Promise) {
        UiThreadUtil.runOnUiThread {
            stopInternal()
            promise.resolve(null)
        }
    }

    /** Whether timers are currently protected, so the UI can report a degraded run honestly. */
    @ReactMethod
    fun isHeld(promise: Promise) {
        promise.resolve(taskId != null)
    }

    private fun stopInternal() {
        val active = taskId ?: return
        taskId = null

        runCatching {
            val context = HeadlessJsTaskContext.getInstance(reactContext)

            // Guarded: the task may already have been finished by a context teardown, and finishing an
            // unknown id is not something to surface to the user mid-run.
            if (context.isTaskRunning(active)) context.finishTask(active)

            Log.i(TAG, "Keep-alive task $active finished")
        }.onFailure { error ->
            Log.w(TAG, "Could not finish the keep-alive task", error)
        }
    }

    companion object {
        const val NAME = "RunKeepAlive"

        /** Must match the task registered with `AppRegistry.registerHeadlessTask` in `index.js`. */
        const val TASK_KEY = "AgentRunKeepAlive"

        private const val TAG = "RunKeepAlive"
    }
}
