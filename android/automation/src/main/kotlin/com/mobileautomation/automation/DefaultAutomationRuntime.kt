package com.mobileautomation.automation

import com.mobileautomation.accessibility.model.UiNode
import com.mobileautomation.accessibility.model.UiTree
import com.mobileautomation.accessibility.selector.ResolutionResult
import com.mobileautomation.accessibility.selector.Selector
import com.mobileautomation.accessibility.selector.SelectorResolver
import com.mobileautomation.accessibility.selector.StructuralPath
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
import com.mobileautomation.tools.PhoneTool
import com.mobileautomation.tools.RingerMode
import com.mobileautomation.tools.RingerTool
import com.mobileautomation.tools.SmsTool
import com.mobileautomation.tools.SystemSettingsReader
import com.mobileautomation.tools.SystemSettingsWriter
import com.mobileautomation.tools.VolumeDirection
import com.mobileautomation.tools.model.AlarmRequest
import com.mobileautomation.tools.model.Contact
import com.mobileautomation.tools.model.CurrentScreen
import com.mobileautomation.tools.model.InstalledApp
import com.mobileautomation.tools.model.SmsMessage
import kotlinx.coroutines.delay

/**
 * Joins the capability modules into the one runtime both engines call.
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
    private val smsTool: SmsTool,
    private val phoneTool: PhoneTool,
    private val systemSettingsWriter: SystemSettingsWriter,
    private val ringerTool: RingerTool,
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

    /**
     * Resolves [selector] and keeps the tree it resolved against.
     *
     * [click] and [typeText] both need more than the matched node: a text label's clickable ancestor, or a
     * wrapper's editable child. Neither can be found from a [ResolvedElement], which is a flat snapshot -
     * so the tree has to survive the resolve.
     */
    private suspend fun resolveWithTree(selector: Selector): ToolResult<Pair<UiTree, ResolvedElement>> {
        val treeResult = getUiTree()
        val tree = treeResult.valueOrNull ?: return ToolResult.Failure(treeResult.errorOrNull!!)

        val resolved = resolve(tree, selector)
        val element = resolved.valueOrNull ?: return ToolResult.Failure(resolved.errorOrNull!!)

        return ToolResult.success(tree to element)
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

    /**
     * Taps the element [selector] resolves to, or the nearest ancestor that can actually be tapped.
     *
     * The ancestor walk is the part that matters. A selector by visible text almost always matches a
     * `TextView`, and in nearly every real layout the `TextView` is not clickable - its parent row is. The
     * old code checked only the resolved node, found it not clickable, and fell straight through to a
     * coordinate tap. That works often enough to look correct and fails exactly where it matters: on a
     * zero-area label, on a node covered by another view, and whenever the accessibility service is off so
     * no gesture can be dispatched at all.
     *
     * The coordinate tap is still the last resort, because it genuinely succeeds where the action does not -
     * a custom view that handles touch without declaring itself clickable.
     */
    override suspend fun click(selector: Selector): ToolResult<Unit> {
        val resolved = resolveWithTree(selector)
        val (tree, element) = resolved.valueOrNull ?: return ToolResult.Failure(resolved.errorOrNull!!)

        val performer = actionPerformerProvider()

        if (performer != null) {
            for (path in clickablePathsFor(tree, element)) {
                if (performer.performClick(path)) return ToolResult.success(Unit)
            }
        }

        return dispatch(gestureEngine.tapCenterOf(element.toRect()))
    }

    /**
     * Paths worth performing a click action on, nearest first.
     *
     * The resolved node when it claims to be clickable, then the nearest **clickable** ancestor. Ancestors
     * that are not clickable are skipped rather than tried: a click action on a layout container is either
     * ignored or, worse, handled by something the user did not point at.
     *
     * Bounded by [MAX_CLICKABLE_ANCESTOR_DEPTH] because past a few levels the ancestor is no longer "the row
     * this label is in" - it is the screen.
     */
    private fun clickablePathsFor(
        tree: UiTree,
        element: ResolvedElement,
    ): List<String> {
        val paths = mutableListOf<String>()
        if (element.clickable) paths.add(element.structuralPath)

        var path = element.structuralPath
        var levels = 0

        while (path.contains('.') && levels < MAX_CLICKABLE_ANCESTOR_DEPTH) {
            path = path.substringBeforeLast('.')
            levels++

            val ancestor = nodeAt(tree.root, path) ?: break
            if (!ancestor.enabled) break

            if (ancestor.clickable) {
                paths.add(path)
                break
            }
        }

        return paths
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

    /**
     * Types into the field [selector] resolves to, or into the single editable node inside it.
     *
     * The descendant search is why this is not a one-liner. A selector written against a field's *label* or
     * its container - which is what a hint text or a `contentDescription` usually belongs to - resolves to
     * a wrapper, and the old code rejected it outright with "target is not a text field". That reads as the
     * tool being broken when the selector was merely one node off, and it is the commonest way typing
     * fails.
     *
     * Only an **unambiguous** descendant is accepted. Two editable fields inside one container means the
     * selector genuinely did not say which, and typing into the first would be a guess with the user's data.
     */
    override suspend fun typeText(
        selector: Selector,
        text: String,
    ): ToolResult<Unit> {
        val resolved = resolveWithTree(selector)
        val (tree, element) = resolved.valueOrNull ?: return ToolResult.Failure(resolved.errorOrNull!!)

        val performer =
            actionPerformerProvider()
                ?: return ToolResult.failure(AutomationError.AccessibilityUnavailable)

        val targetPath =
            if (element.editable) {
                element.structuralPath
            } else {
                editableDescendantPath(tree, element.structuralPath)
                    ?: return ToolResult.failure(
                        AutomationError.InvalidArgument(
                            "target is not a text field and contains no single editable field " +
                                "(${element.className ?: "unknown class"})",
                        ),
                    )
            }

        // Focus first: some fields ignore set-text until they hold focus.
        performer.performFocus(targetPath)

        return if (performer.setText(targetPath, text)) {
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

    // --- messaging and calls ----------------------------------------------

    override suspend fun sendSms(
        phoneNumber: String,
        body: String,
    ): ToolResult<Unit> =
        guardingPermissions("sendSms") {
            if (!smsTool.sendSms(phoneNumber, body)) {
                error("the message could not be sent; there may be no SIM or no telephony on this device")
            }
        }

    override suspend fun readSms(
        limit: Int,
        fromNumber: String?,
    ): ToolResult<List<SmsMessage>> = guardingPermissions("readSms") { smsTool.readRecentSms(limit, fromNumber) }

    /**
     * Places a call, degrading to the dialer rather than failing.
     *
     * The fallback is the substance here. Without the call permission the agent could report the task
     * impossible - but opening the dialer with the number filled in gets the user one tap from done, which
     * is a far better outcome than a refusal. [CallOutcome] is what keeps that honest: the agent must be
     * able to tell the user "the dialer is open" rather than "I called them".
     */
    override suspend fun placeCall(phoneNumber: String): ToolResult<CallOutcome> {
        val placed =
            guardingPermissions("placeCall") {
                if (!phoneTool.placeCall(phoneNumber)) error("nothing on this device can place a call")
            }

        if (placed is ToolResult.Success) return ToolResult.success(CallOutcome.CALLING)

        val error = (placed as ToolResult.Failure).error

        // Only a missing permission degrades. A device with no dialer at all, or a malformed number, is a
        // real failure and pretending otherwise would hide it.
        if (error !is AutomationError.PermissionDenied) return ToolResult.Failure(error)

        return if (phoneTool.openDialer(phoneNumber)) {
            ToolResult.success(CallOutcome.DIALER_OPENED)
        } else {
            ToolResult.Failure(error)
        }
    }

    override suspend fun endCall(): ToolResult<Unit> =
        guardingPermissions("endCall") {
            if (!phoneTool.endCall()) {
                error("the call could not be ended; this needs Android 9 or later")
            }
        }

    // --- device configuration ---------------------------------------------

    override suspend fun setSystemSetting(
        key: String,
        value: String,
    ): ToolResult<Unit> {
        if (key.isBlank()) {
            return ToolResult.failure(AutomationError.InvalidArgument("setting key cannot be blank"))
        }

        return guardingPermissions("setSystemSetting") {
            if (!systemSettingsWriter.putSystemSetting(key, value)) {
                error("the system rejected the write of $key")
            }
        }
    }

    override suspend fun setRingerMode(mode: RingerMode): ToolResult<Unit> =
        guardingPermissions("setRingerMode") {
            if (!ringerTool.setRingerMode(mode)) {
                error("the audio service rejected the ringer change")
            }
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

    private fun nodeAt(
        root: UiNode,
        path: String,
    ): UiNode? = StructuralPath.nodeAt(root, path)

    /**
     * The path of the one editable node inside [path], or null when there is none or several.
     *
     * Null for "several" rather than a first match: a container with two fields means the selector did not
     * identify one, and typing into whichever came first would put the user's text somewhere they did not
     * ask for.
     */
    private fun editableDescendantPath(
        tree: UiTree,
        path: String,
    ): String? {
        val node = nodeAt(tree.root, path) ?: return null

        val found = mutableListOf<String>()
        collectEditablePaths(node, path, found)

        return found.singleOrNull()
    }

    private fun collectEditablePaths(
        node: UiNode,
        path: String,
        into: MutableList<String>,
    ) {
        if (node.editable && node.enabled) into.add(path)

        // Paths built through [StructuralPath] so they address the same nodes the resolver's do.
        node.children.indices.forEach { position ->
            collectEditablePaths(
                node.children[position],
                StructuralPath.childPath(path, node, position),
                into,
            )
        }
    }

    private companion object {
        /**
         * Matches the gesture engine's settle delay: polling faster wastes work
         * re-walking a tree that has not changed.
         */
        const val POLL_INTERVAL_MS = 250L

        /**
         * How far up to look for a clickable ancestor.
         *
         * Three levels covers label-inside-row-inside-list, which is the shape this exists for. Further up
         * and the "ancestor" is a screen-sized container whose click action has nothing to do with what the
         * user pointed at.
         */
        const val MAX_CLICKABLE_ANCESTOR_DEPTH = 3
    }
}
