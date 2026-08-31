package com.mobileautomation.bridge

import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.mobileautomation.accessibility.selector.SelectorResolver
import com.mobileautomation.accessibility.service.AccessibilityConnection
import com.mobileautomation.accessibility.service.GlobalAction
import com.mobileautomation.accessibility.service.UiAutomationAccessibilityService
import com.mobileautomation.automation.DefaultAutomationRuntime
import com.mobileautomation.gestures.AccessibilityGestureDispatcher
import com.mobileautomation.gestures.GestureBuilder
import com.mobileautomation.gestures.GestureDispatcher
import com.mobileautomation.gestures.GestureEngine
import com.mobileautomation.gestures.GestureOutcome
import com.mobileautomation.gestures.GestureSpec
import com.mobileautomation.screen.MediaProjectionScreenCapture
import com.mobileautomation.screen.ScreenCapture
import com.mobileautomation.screen.ScreenCaptureService
import com.mobileautomation.screen.ScreenshotStore
import com.mobileautomation.tools.AndroidPermissionGate
import com.mobileautomation.tools.android.AndroidAlarmTool
import com.mobileautomation.tools.android.AndroidAppManager
import com.mobileautomation.tools.android.AndroidClipboardTool
import com.mobileautomation.tools.android.AndroidContactsReader
import com.mobileautomation.tools.android.AndroidIntentTool
import com.mobileautomation.tools.android.AndroidMediaTool
import com.mobileautomation.tools.android.AndroidNotificationTool
import com.mobileautomation.tools.android.AndroidPhoneTool
import com.mobileautomation.tools.android.AndroidRingerTool
import com.mobileautomation.tools.android.AndroidSmsTool
import com.mobileautomation.tools.android.AndroidSystemSettingsReader
import com.mobileautomation.tools.android.AndroidSystemSettingsWriter
import java.io.File

/**
 * Builds the automation runtime and holds the pieces that outlive a single call.
 *
 * This is the composition root for the native layer. It exists as an object rather
 * than being constructed inside the React Native module because two things have
 * lifetimes the module does not control:
 *
 * - the **accessibility service**, created and destroyed by the system whenever the
 *   user toggles it in Settings, so the runtime must be assembled per call and be
 *   absent when the service is off;
 * - the **MediaProjection session**, granted once by the user and reused across
 *   captures until they revoke it, so it must survive a JS reload.
 */
object AutomationRuntimeProvider {
private const val TAG = "AutomationRuntime"
private const val CAPTURE_DIRECTORY = "captures"

    private val accessibilityServiceClassName = UiAutomationAccessibilityService::class.java.name

    @Volatile
    private var screenCapture: MediaProjectionScreenCapture? = null

    /**
     * A bridge over the current runtime. **Always available.**
     *
     * It used to return null whenever the accessibility service was off, and the module then rejected
     * every call with `accessibility_unavailable`. That was wrong for most of the tool set: taking a
     * screenshot, opening an app, reading contacts or the clipboard, setting an alarm, posting a
     * notification, launching an intent, reading a setting and controlling media all work perfectly well
     * with accessibility disabled. Fourteen of the twenty-four tools were unreachable because a
     * capability none of them use was missing - and the error told the user to enable accessibility,
     * which would not have fixed anything.
     *
     * So the runtime is always constructed and the accessibility-shaped parts degrade instead: the
     * screen reader is absent, the gesture dispatcher reports `Unavailable`, and global actions return
     * false. [DefaultAutomationRuntime] already turns each of those into `AccessibilityUnavailable` for
     * exactly the tools that need it, so the error still reaches the user - on the right tools.
     *
     * Rebuilt per call rather than cached: caching would hold a reference to a service instance the
     * system has already destroyed, and every call would then fail in a way that looks like a device
     * problem rather than a revoked permission.
     */
    fun bridge(context: Context): AutomationBridge {
        // The concrete service when connected, because gestures and global actions need the real type.
        // Null is a normal state, not a refusal.
        val gestureService = AccessibilityConnection.readerOrNull() as? UiAutomationAccessibilityService

        val metrics = context.resources.displayMetrics
        val permissionGate =
            AndroidPermissionGate(
                context = context,
                accessibilityServiceClassName = accessibilityServiceClassName,
                hasScreenCaptureSession = { hasScreenCaptureSession() },
            )

        val runtime =
            DefaultAutomationRuntime(
                screenReaderProvider = { AccessibilityConnection.readerOrNull() },
                actionPerformerProvider = { AccessibilityConnection.actionPerformerOrNull() },
                gestureEngine =
                    GestureEngine(
                        dispatcher =
                            if (gestureService == null) {
                                // Nothing can be dispatched, so this reports rather than refuses - which
                                // is what lets the tools needing no gestures keep working.
                                UnavailableGestureDispatcher
                            } else {
                                AccessibilityGestureDispatcher(
                                    service = gestureService,
                                    isServiceConnected = { AccessibilityConnection.isConnected },
                                )
                            },
                        builder =
                            GestureBuilder(
                                screenWidthPx = metrics.widthPixels,
                                screenHeightPx = metrics.heightPixels,
                            ),
                    ),
                screenCapture = screenCaptureOrPlaceholder(context),
                appManager =
                    AndroidAppManager(
                        context = context,
                        // The foreground app can only be known through the
                        // accessibility service; there is no public API for it.
                        currentPackageProvider = { AccessibilityConnection.readerOrNull()?.currentPackageName() },
                        currentActivityProvider = { AccessibilityConnection.readerOrNull()?.currentActivityName() },
                    ),
                contactsReader = AndroidContactsReader(context, permissionGate),
                clipboardTool = AndroidClipboardTool(context),
                alarmTool = AndroidAlarmTool(context),
                notificationTool =
                    AndroidNotificationTool(
                        context = context,
                        permissionGate = permissionGate,
                        smallIconResId = android.R.drawable.ic_dialog_info,
                    ),
                intentTool = AndroidIntentTool(context),
                systemSettingsReader = AndroidSystemSettingsReader(context),
                mediaTool = AndroidMediaTool(context),
                smsTool = AndroidSmsTool(context, permissionGate),
                phoneTool = AndroidPhoneTool(context, permissionGate),
                systemSettingsWriter = AndroidSystemSettingsWriter(context, permissionGate),
                ringerTool = AndroidRingerTool(context, permissionGate),
                globalActionPerformer = { action: GlobalAction ->
                    // Re-read rather than closing over the instance above: the user can enable the
                    // service between this runtime being built and the action being performed.
                    (AccessibilityConnection.readerOrNull() as? UiAutomationAccessibilityService)
                        ?.perform(action) == true
                },
                selectorResolver = SelectorResolver(),
                // Vision needs a screenshot and a model call, so the matcher is
                // supplied by the agent layer in Phase 7. Until then the chain
                // reports honestly that vision was not attempted.
            )

        return AutomationBridge(
            runtime = runtime,
            canCaptureScreen = { hasScreenCaptureSession() },
            canDrawOverlay = { canDrawOverlay(context) },
        )
    }

    /**
     * Adopts a MediaProjection the user just consented to.
     *
     * This is the caller Phase 2 was missing: the capture pipeline existed but
     * nothing could grant it a session, because launching the consent dialog needs
     * an Activity and therefore belongs to the RN layer.
     *
     * **The foreground service must be in the foreground first.** From API 34 `getMediaProjection`
     * throws unless a `mediaProjection` service is already running, and `startForegroundService` merely
     * *posts* `onStartCommand` to the main thread.
     *
     * That makes this necessarily asynchronous, and the reason is worth stating because the synchronous
     * version shipped and crashed. It polled with `Thread.sleep` from `onActivityResult`, which runs on
     * the main thread - so the service could not start until the polling finished, every attempt failed,
     * and stopping the service on the failure path left `startForegroundService`'s contract unsatisfied.
     * Android killed the process with `ForegroundServiceDidNotStartInTimeException`.
     *
     * So [onResult] is called when the answer is known, on the main thread, exactly once. The consent
     * token stays valid while waiting - it is the service that is not ready, not the grant.
     */
    fun attachScreenCapture(
        context: Context,
        resultCode: Int,
        data: Intent,
        onResult: (Boolean) -> Unit,
    ) {
        val manager =
            context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as? MediaProjectionManager

        if (manager == null) {
            onResult(false)
            return
        }

        ScreenCaptureService.start(context) { ready ->
            if (!ready) {
                // The service never reached the foreground, so the projection cannot be created. No stop
                // call here: the service reports its own failure and stops itself, and stopping a start
                // that is still queued is what crashed the process last time.
                Log.w(TAG, "Screen capture service unavailable; cannot create a projection")
                onResult(false)
                return@start
            }

            val projection =
                runCatching { manager.getMediaProjection(resultCode, data) }
                    .onFailure { Log.e(TAG, "MediaProjection could not be created", it) }
                    .getOrNull()

            if (projection == null) {
                // Safe now, because the service is genuinely in the foreground - its start contract is
                // satisfied, so stopping it is an ordinary stop.
                ScreenCaptureService.stop(context)
                Log.w(TAG, "Consent was granted but MediaProjection could not be created")
                onResult(false)
                return@start
            }

            val metrics = context.resources.displayMetrics
            val capture =
                MediaProjectionScreenCapture(
                    context = context,
                    store = ScreenshotStore(File(context.filesDir, CAPTURE_DIRECTORY)),
                    screenWidthPx = metrics.widthPixels,
                    screenHeightPx = metrics.heightPixels,
                    densityDpi = metrics.densityDpi,
                    currentPackageName = { AccessibilityConnection.readerOrNull()?.currentPackageName() },
                )

            capture.attachProjection(projection)
            screenCapture?.release()
            screenCapture = capture

            Log.i(TAG, "Screen capture session attached")
            onResult(true)
        }
    }

    /** Ends the capture session, stopping the system recording indicator. */
    fun releaseScreenCapture(context: Context? = null) {
        screenCapture?.release()
        screenCapture = null

        // The service exists only to make the projection possible, so it goes with the session. Left
        // running it would tell the user their screen is being read when it is not.
        //
        // Guarded on the service actually being in the foreground: stopping a start that is still queued
        // leaves startForegroundService's contract unsatisfied and Android kills the process for it.
        if (context != null && ScreenCaptureService.isInForeground) ScreenCaptureService.stop(context)

        Log.i(TAG, "Screen capture session released")
    }

    /**
     * Whether a screen-capture session is currently held.
     *
     * Exposed separately from [bridge] because the two are **independent**, and conflating
     * them caused a real bug (issue E1): `getStatus` fell back to a stub whenever the accessibility
     * service was off, and that stub hardcoded capture as unavailable - so a user who granted screen
     * recording was told it had not worked, because a different permission was missing.
     *
     * MediaProjection has nothing to do with accessibility. This reads the session directly.
     */
    fun hasScreenCaptureSession(): Boolean = screenCapture?.isReady == true

    /** Deletes every stored screenshot. Called when the user clears data. */
    fun clearScreenshots(context: Context): Int =
        ScreenshotStore(File(context.filesDir, CAPTURE_DIRECTORY)).clear()

    /**
     * The live capture, or one that always reports missing consent.
     *
     * A placeholder rather than null so `takeScreenshot` returns the typed
     * `capture_consent_required` error - which tells the caller to ask the user -
     * instead of a generic failure.
     */
    private fun screenCaptureOrPlaceholder(context: Context): ScreenCapture = screenCapture ?: ConsentRequiredScreenCapture

    /**
     * Whether "display over other apps" is granted.
     *
     * Public because the event bridge needs it too: a status event that guessed at this would report the
     * overlay as unavailable every time the accessibility connection changed, which is the class of bug
     * E1 was.
     */
    fun canDrawOverlay(context: Context): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(context)
        } else {
            true
        }

    /**
     * The permission gate, for callers that need capability state without a runtime.
     *
     * The permissions module uses this: capability state must be readable when the accessibility
     * service is **off**, since that is precisely when the user is being asked to turn it on.
     */
    fun permissionGate(context: Context): AndroidPermissionGate =
        AndroidPermissionGate(
            context = context,
            accessibilityServiceClassName = accessibilityServiceClassName,
            hasScreenCaptureSession = { hasScreenCaptureSession() },
        )

    /** Stands in before the user has granted a capture session. */
    private object ConsentRequiredScreenCapture : ScreenCapture {
        override val isReady: Boolean = false

        override suspend fun capture(): com.mobileautomation.screen.CaptureResult =
            com.mobileautomation.screen.CaptureResult.ConsentRequired

        override fun release() = Unit
    }

    /**
     * Stands in when the accessibility service is off.
     *
     * `Unavailable` rather than `Failed`, because the two mean different things downstream: this is a
     * permission the user can grant, not a gesture that went wrong.
     */
    private object UnavailableGestureDispatcher : GestureDispatcher {
        override val isAvailable: Boolean = false

        override suspend fun dispatch(spec: GestureSpec): GestureOutcome = GestureOutcome.Unavailable
    }
}
