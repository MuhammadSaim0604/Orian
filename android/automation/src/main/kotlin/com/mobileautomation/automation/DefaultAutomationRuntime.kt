package com.mobileautomation.automation

import com.mobileautomation.accessibility.model.UiTree
import com.mobileautomation.accessibility.selector.ResolutionResult
import com.mobileautomation.accessibility.selector.Selector
import com.mobileautomation.accessibility.selector.SelectorResolver
import com.mobileautomation.accessibility.service.GlobalAction
import com.mobileautomation.accessibility.service.NodeActionPerformer
import com.mobileautomation.accessibility.service.ScreenReader
import com.mobileautomation.gestures.GestureEngine
import com.mobileautomation.gestures.GestureOutcome
import com.mobileautomation.gestures.Rect
import com.mobileautomation.gestures.SwipeDirection
import com.mobileautomation.screen.CaptureResult
import com.mobileautomation.screen.ScreenCapture
import com.mobileautomation.screen.Screenshot
import com.mobileautomation.tools.AlarmTool
import com.mobileautomation.tools.AppManager
import com.mobileautomation.tools.ClipboardTool
import com.mobileautomation.tools.ContactsReader
import com.mobileautomation.tools.IntentRequest
import com.mobileautomation.tools.IntentTool
import com.mobileautomation.tools.MediaCommand
import com.mobileautomation.tools.MediaTool
import com.mobileautomation.tools.MissingPermissionException
import com.mobileautomation.tools.NotificationTool
import com.mobileautomation.tools.SystemSettingsReader
import com.mobileautomation.tools.VolumeDirection
import com.mobileautomation.tools.model.AlarmRequest
import com.mobileautomation.tools.model.Contact
import com.mobileautomation.tools.model.CurrentScreen
import com.mobileautomation.tools.model.InstalledApp
import kotlinx.coroutines.delay

/**
 * Joins the five capability modules into the one runtime both engines call.
 *
 * Every dependency is injected as an interface, so the whole runtime - including
 * the selector-resolve-then-act sequence that is the heart of the product - is
 * unit-testable with fakes. Nothing here touches an Android type directly.
 *
 * Two rules are enforced in one place rather than at each call site:
 * every action first checks the service is connected, and every action resolves
 * its target through the selector chain rather than assuming coordinates.
 */
class DefaultAutomationRuntime(
    private val screenReaderProvider: () -> ScreenReader?,
    private val actionPerformerProvider: () -> NodeActionPerformer?,
    private val gestureEngine: GestureEngine,
    private val screenCapture: ScreenCapture,
    private val appManager: AppManager,
    private val contactsReader: ContactsReader,
    private val clipboardTool: ClipboardTool,
    private val alarmTool: AlarmTool,
    private val notificationTool: NotificationTool,
    private val intentTool: IntentTool,
    private val systemSettingsReader: SystemSettingsReader,
    private val mediaTool: MediaTool,
    private val globalActionPerformer: (GlobalAction) -> Boolean,
    private val selectorResolver: SelectorResolver = SelectorResolver(),
) : AutomationRuntime {
    override val isReady: Boolean
        get() = screenReaderProvider()?.isAvailable == true

    // --- screen reading ---------------------------------------------------

    override suspend fun getUiTree(): ToolResult<UiTree> {
        val reader =
            screenReaderProvider()
                ?: return ToolResult.failure(AutomationError.AccessibilityUnavailable)

        val tree =
            reader.captureUiTree()
                ?: return ToolResult.failure(
                    AutomationError.ToolFailed(
                        "getUiTree",
                        "no readable window; the screen may be secure or mid-transition",
                    ),
                )

        return ToolResult.success(tree)
    }

    override suspend fun getCurrentScreen(): ToolResult<CurrentScreen> {
        if (!isReady) return ToolResult.failure(AutomationError.AccessibilityUnavailable)
        return ToolResult.catching { appManager.currentScreen() }
    }

    override suspend fun findElement(selector: Selector): ToolResult<ResolvedElement> {
        val treeResult = getUiTree()
        val tree = treeResult.valueOrNull ?: return ToolResult.Failure(treeResult.errorOrNull!!)
        return resolve(tree, selector)
    }

    override suspend fun waitForElement(
        selector: Selector,
        timeoutMs: Long,
    ): ToolResult<ResolvedElement> {
        if (timeoutMs <= 0) {
            return ToolResult.failure(AutomationError.InvalidArgument("timeoutMs must be positive"))
        }

        var elapsed = 0L
        var lastError: AutomationError? = null

        // Polls rather than subscribing to accessibility events: content-change
        // events fire constantly on animated screens, so a poll with a settle
        // interval is both simpler and less noisy.
        while (elapsed <= timeoutMs) {
            when (val attempt = findElement(selector)) {
                is ToolResult.Success -> return attempt
                is ToolResult.Failure -> {
                    lastError = attempt.error
                    // A missing permission or disabled service will not resolve
                    // itself by waiting.
                    if (attempt.error.needsUserAction) return attempt
                }
            }

            delay(POLL_INTERVAL_MS)
            elapsed += POLL_INTERVAL_MS
        }

        return ToolResult.failure(
            lastError ?: AutomationError.Timeout("waitForElement", timeoutMs),
        )
    }

    // --- acting on the screen ---------------------------------------------

    override suspend fun click(selector: Selector): ToolResult<Unit> {
        val found = findElement(selector)
        val element = found.valueOrNull ?: return ToolResult.Failure(found.errorOrNull!!)

        // The node's own click action first: it succeeds in cases a coordinate tap
        // cannot, such as a target overlapped by another view or one whose touch
        // area differs from its reported bounds.
        val performer = actionPerformerProvider()
        if (element.clickable && performer?.performClick(element.structuralPath) == true) {
            return ToolResult.success(Unit)
        }

        return dispatch(gestureEngine.tapCenterOf(element.toRect()))
    }

    override suspend fun clickAt(
        x: Int,
        y: Int,
    ): ToolResult<Unit> {
        if (!isReady) return ToolResult.failure(AutomationError.AccessibilityUnavailable)
        return dispatch(gestureEngine.tap(x, y))
    }

    override suspend fun longPress(
        selector: Selector,
        durationMs: Long?,
    ): ToolResult<Unit> {
        val found = findElement(selector)
        val element = found.valueOrNull ?: return ToolResult.Failure(found.errorOrNull!!)

        val outcome =
            if (durationMs != null) {
                gestureEngine.longPressCenterOf(element.toRect(), durationMs)
            } else {
                gestureEngine.longPressCenterOf(element.toRect())
            }
        return dispatch(outcome)
    }

    override suspend fun swipe(
        direction: SwipeDirection,
        distanceFraction: Double,
    ): ToolResult<Unit> {
        if (!isReady) return ToolResult.failure(AutomationError.AccessibilityUnavailable)
        if (distanceFraction <= 0.0 || distanceFraction > 1.0) {
            return ToolResult.failure(
                AutomationError.InvalidArgument("distanceFraction must be in (0, 1]"),
            )
        }
        return dispatch(gestureEngine.scroll(direction, distanceFraction))
    }

    override suspend fun swipeBetween(
        fromX: Int,
        fromY: Int,
        toX: Int,
        toY: Int,
        durationMs: Long?,
    ): ToolResult<Unit> {
        if (!isReady) return ToolResult.failure(AutomationError.AccessibilityUnavailable)
        if (fromX == toX && fromY == toY) {
            return ToolResult.failure(AutomationError.InvalidArgument("a swipe must move"))
        }

        val outcome =
            if (durationMs != null) {
                gestureEngine.swipe(fromX, fromY, toX, toY, durationMs)
            } else {
                gestureEngine.swipe(fromX, fromY, toX, toY)
            }
        return dispatch(outcome)
    }

    override suspend fun typeText(
        selector: Selector,
        text: String,
    ): ToolResult<Unit> {
        val found = findElement(selector)
        val element = found.valueOrNull ?: return ToolResult.Failure(found.errorOrNull!!)

        if (!element.editable) {
            return ToolResult.failure(
                AutomationError.InvalidArgument(
                    "target is not a text field (${element.className ?: "unknown class"})",
                ),
            )
        }

        val performer =
            actionPerformerProvider()
                ?: return ToolResult.failure(AutomationError.AccessibilityUnavailable)

        // Focus first: some fields ignore set-text until they hold focus.
        performer.performFocus(element.structuralPath)

        return if (performer.setText(element.structuralPath, text)) {
            ToolResult.success(Unit)
        } else {
            ToolResult.failure(
                AutomationError.ToolFailed("typeText", "the field rejected the set-text action"),
            )
        }
    }

    override suspend fun pressBack(): ToolResult<Unit> = performGlobal(GlobalAction.BACK, "pressBack")

    override suspend fun pressHome(): ToolResult<Unit> = performGlobal(GlobalAction.HOME, "pressHome")

    // --- screen capture ---------------------------------------------------

    override suspend fun takeScreenshot(): ToolResult<Screenshot> =
        when (val result = screenCapture.capture()) {
            is CaptureResult.Success -> ToolResult.success(result.screenshot)
            CaptureResult.ConsentRequired -> ToolResult.failure(AutomationError.CaptureConsentRequired)
            CaptureResult.SecureWindow -> ToolResult.failure(AutomationError.SecureScreen)
            is CaptureResult.Failed ->
                ToolResult.failure(AutomationError.ToolFailed("takeScreenshot", result.reason))
        }

    // --- apps -------------------------------------------------------------

    override suspend fun openApp(packageName: String): ToolResult<Unit> {
        if (packageName.isBlank()) {
            return ToolResult.failure(AutomationError.InvalidArgument("packageName cannot be blank"))
        }

        return if (appManager.openApp(packageName)) {
            ToolResult.success(Unit)
        } else {
            ToolResult.failure(
                AutomationError.ToolFailed("openApp", "$packageName is not installed or cannot be launched"),
            )
        }
    }

    override suspend fun openAppByName(name: String): ToolResult<InstalledApp> {
        if (name.isBlank()) {
            return ToolResult.failure(AutomationError.InvalidArgument("app name cannot be blank"))
        }

        return appManager.openAppByName(name)?.let { ToolResult.success(it) }
            ?: ToolResult.failure(
                AutomationError.ToolFailed("openAppByName", "no installed app matches \"$name\""),
            )
    }

    override suspend fun listApps(includeSystem: Boolean): ToolResult<List<InstalledApp>> =
        ToolResult.catching { appManager.listApps(includeSystem) }

    // --- device tools -----------------------------------------------------

    override suspend fun getContacts(limit: Int): ToolResult<List<Contact>> =
        guardingPermissions("getContacts") { contactsReader.getContacts(limit) }

    override suspend fun findContacts(query: String): ToolResult<List<Contact>> =
        guardingPermissions("findContacts") { contactsReader.findContacts(query) }

    override suspend fun createAlarm(request: AlarmRequest): ToolResult<Unit> =
        guardingPermissions("createAlarm") {
            if (!alarmTool.createAlarm(request)) {
                error("no clock app on this device handled the request")
            }
        }

    override suspend fun readClipboard(): ToolResult<String?> = ToolResult.catching { clipboardTool.readClipboard() }

    override suspend fun writeClipboard(text: String): ToolResult<Unit> =
        if (clipboardTool.writeClipboard(text)) {
            ToolResult.success(Unit)
        } else {
            ToolResult.failure(AutomationError.ToolFailed("writeClipboard", "the clipboard rejected the write"))
        }

    override suspend fun sendNotification(
        title: String,
        body: String,
    ): ToolResult<Unit> {
        if (title.isBlank()) {
            return ToolResult.failure(AutomationError.InvalidArgument("notification title cannot be blank"))
        }

        return if (notificationTool.sendNotification(title, body)) {
            ToolResult.success(Unit)
        } else {
            ToolResult.failure(
                AutomationError.PermissionDenied(
                    permission = "android.permission.POST_NOTIFICATIONS",
                    requiresSettingsScreen = false,
                ),
            )
        }
    }

    override suspend fun launchIntent(request: IntentRequest): ToolResult<Unit> =
        if (intentTool.launchIntent(request)) {
            ToolResult.success(Unit)
        } else {
            ToolResult.failure(
                AutomationError.ToolFailed("launchIntent", "nothing on this device handles ${request.action}"),
            )
        }

    override suspend fun getSystemSetting(key: String): ToolResult<String?> {
        if (key.isBlank()) {
            return ToolResult.failure(AutomationError.InvalidArgument("setting key cannot be blank"))
        }
        return ToolResult.catching { systemSettingsReader.getSystemSetting(key) }
    }

    // --- media ------------------------------------------------------------

    override suspend fun controlMedia(command: MediaCommand): ToolResult<Unit> =
        if (mediaTool.control(command)) {
            ToolResult.success(Unit)
        } else {
            ToolResult.failure(
                AutomationError.ToolFailed(
                    "controlMedia",
                    "nothing is holding the media session, so ${command.name} had no effect",
                ),
            )
        }

    override suspend fun adjustVolume(direction: VolumeDirection): ToolResult<Unit> =
        if (mediaTool.adjustVolume(direction)) {
            ToolResult.success(Unit)
        } else {
            ToolResult.failure(
                AutomationError.ToolFailed("adjustVolume", "the audio service rejected the change"),
            )
        }

    // --- helpers ----------------------------------------------------------

    private fun resolve(
        tree: UiTree,
        selector: Selector,
    ): ToolResult<ResolvedElement> =
        when (val resolution = selectorResolver.resolve(tree, selector)) {
            is ResolutionResult.Match ->
                ToolResult.success(
                    ResolvedElement(
                        text = resolution.node.text,
                        resourceId = resolution.node.resourceId,
                        className = resolution.node.className,
                        contentDescription = resolution.node.contentDescription,
                        centerX = resolution.node.bounds.centerX,
                        centerY = resolution.node.bounds.centerY,
                        left = resolution.node.bounds.left,
                        top = resolution.node.bounds.top,
                        right = resolution.node.bounds.right,
                        bottom = resolution.node.bounds.bottom,
                        clickable = resolution.node.clickable,
                        editable = resolution.node.editable,
                        enabled = resolution.node.enabled,
                        strategy = resolution.strategy,
                        structuralPath = resolution.structuralPath,
                        alternativeCount = resolution.alternativeCount,
                    ),
                )

            is ResolutionResult.NotFound ->
                ToolResult.failure(
                    AutomationError.ElementNotFound(
                        attemptedStrategies = resolution.attempted.map { it.wireName },
                        detail = resolution.reason,
                    ),
                )
        }

    private fun dispatch(outcome: GestureOutcome): ToolResult<Unit> =
        when (outcome) {
            GestureOutcome.Completed -> ToolResult.success(Unit)
            GestureOutcome.Unavailable -> ToolResult.failure(AutomationError.AccessibilityUnavailable)
            GestureOutcome.Cancelled ->
                ToolResult.failure(
                    AutomationError.GestureFailed("the system cancelled the gesture", isRetryable = true),
                )
            is GestureOutcome.Failed ->
                ToolResult.failure(AutomationError.GestureFailed(outcome.reason, isRetryable = false))
        }

    private fun performGlobal(
        action: GlobalAction,
        toolName: String,
    ): ToolResult<Unit> {
        if (!isReady) return ToolResult.failure(AutomationError.AccessibilityUnavailable)

        return if (globalActionPerformer(action)) {
            ToolResult.success(Unit)
        } else {
            ToolResult.failure(AutomationError.ToolFailed(toolName, "the system rejected the action"))
        }
    }

    /**
     * Runs [block], turning a missing permission into a typed error.
     *
     * The tool layer throws [MissingPermissionException] because a permission
     * check is a precondition; the runtime converts it to data so the agent can
     * prompt the user instead of crashing.
     */
    private inline fun <T> guardingPermissions(
        toolName: String,
        block: () -> T,
    ): ToolResult<T> =
        try {
            ToolResult.success(block())
        } catch (error: MissingPermissionException) {
            ToolResult.failure(
                AutomationError.PermissionDenied(
                    permission = error.capability.permission,
                    requiresSettingsScreen = error.capability.requiresSystemSettingsScreen,
                ),
            )
        } catch (error: Throwable) {
            ToolResult.failure(
                AutomationError.ToolFailed(toolName, error.message ?: error::class.java.simpleName),
            )
        }

    private fun ResolvedElement.toRect(): Rect = Rect(left, top, right, bottom)

    private companion object {
        /**
         * Matches the gesture engine's settle delay: polling faster wastes work
         * re-walking a tree that has not changed.
         */
        const val POLL_INTERVAL_MS = 250L
    }
}
