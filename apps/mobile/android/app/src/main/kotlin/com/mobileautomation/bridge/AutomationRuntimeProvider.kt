package com.mobileautomation.bridge

import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjection
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
import com.mobileautomation.gestures.GestureEngine
import com.mobileautomation.screen.MediaProjectionScreenCapture
import com.mobileautomation.screen.ScreenCapture
import com.mobileautomation.screen.ScreenshotStore
import com.mobileautomation.tools.AndroidPermissionGate
import com.mobileautomation.tools.android.AndroidAlarmTool
import com.mobileautomation.tools.android.AndroidAppManager
import com.mobileautomation.tools.android.AndroidClipboardTool
import com.mobileautomation.tools.android.AndroidContactsReader
import com.mobileautomation.tools.android.AndroidIntentTool
import com.mobileautomation.tools.android.AndroidMediaTool
import com.mobileautomation.tools.android.AndroidNotificationTool
import com.mobileautomation.tools.android.AndroidSystemSettingsReader
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
     * A bridge over the current runtime, or null when the accessibility service is
     * not connected.
     *
     * Rebuilt per call rather than cached: caching would hold a reference to a
     * service instance the system has already destroyed, and every call would then
     * fail in a way that looks like a device problem rather than a revoked
     * permission.
     */
    fun bridgeOrNull(context: Context): AutomationBridge? {
        val service = AccessibilityConnection.readerOrNull() ?: return null
        val performer = AccessibilityConnection.actionPerformerOrNull()

        val gestureService = service as? UiAutomationAccessibilityService
        if (gestureService == null) {
            // The reader is not the real service, which happens only in tests. There
            // is no way to dispatch a gesture, so refuse rather than half-work.
            Log.w(TAG, "Connected screen reader cannot dispatch gestures")
            return null
        }

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
                            AccessibilityGestureDispatcher(
                                service = gestureService,
                                isServiceConnected = { AccessibilityConnection.isConnected },
                            ),
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
                globalActionPerformer = { action: GlobalAction -> gestureService.perform(action) },
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
     * @return whether a session is now active.
     */
    fun attachScreenCapture(
        context: Context,
        resultCode: Int,
        data: Intent,
    ): Boolean {
        val manager =
            context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as? MediaProjectionManager
                ?: return false

        val projection: MediaProjection =
            runCatching { manager.getMediaProjection(resultCode, data) }.getOrNull() ?: return false

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
        return true
    }

    /** Ends the capture session, stopping the system recording indicator. */
    fun releaseScreenCapture() {
        screenCapture?.release()
        screenCapture = null
        Log.i(TAG, "Screen capture session released")
    }

    /**
     * Whether a screen-capture session is currently held.
     *
     * Exposed separately from [bridgeOrNull] because the two are **independent**, and conflating
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

    private fun canDrawOverlay(context: Context): Boolean =
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
}
