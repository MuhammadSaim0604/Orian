package com.mobileautomation.automation

import com.mobileautomation.accessibility.model.Bounds
import com.mobileautomation.accessibility.model.UiNode
import com.mobileautomation.accessibility.model.UiTree
import com.mobileautomation.accessibility.selector.Selector
import com.mobileautomation.accessibility.selector.SelectorStrategy
import com.mobileautomation.accessibility.service.GlobalAction
import com.mobileautomation.gestures.GestureBuilder
import com.mobileautomation.gestures.GestureDispatcher
import com.mobileautomation.gestures.GestureEngine
import com.mobileautomation.gestures.GestureOutcome
import com.mobileautomation.gestures.GestureSpec
import com.mobileautomation.gestures.SwipeDirection
import com.mobileautomation.screen.CaptureResult
import com.mobileautomation.screen.Screenshot
import com.mobileautomation.tools.IntentRequest
import com.mobileautomation.tools.MediaCommand
import com.mobileautomation.tools.SensitiveCapability
import com.mobileautomation.tools.VolumeDirection
import com.mobileautomation.tools.model.AlarmRequest
import com.mobileautomation.tools.model.Contact
import com.mobileautomation.tools.model.InstalledApp
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tests for the runtime that both engines call.
 *
 * The scenario is the plan's driving example - sending a WhatsApp message - because
 * it exercises the whole chain: resolve a selector, type into a field, tap a
 * button.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class DefaultAutomationRuntimeTest {
    /** Records dispatched gestures and returns a scripted outcome. */
    private class FakeGestureDispatcher(
        override var isAvailable: Boolean = true,
        var outcome: GestureOutcome = GestureOutcome.Completed,
    ) : GestureDispatcher {
        val dispatched = mutableListOf<GestureSpec>()

        override suspend fun dispatch(spec: GestureSpec): GestureOutcome {
            dispatched.add(spec)
            return outcome
        }
    }

    private val sendButton =
        UiNode(
            text = "Send",
            resourceId = "com.whatsapp:id/send_button",
            className = "android.widget.ImageButton",
            packageName = "com.whatsapp",
            bounds = Bounds(900, 1800, 1050, 1950),
            clickable = true,
        )

    private val messageField =
        UiNode(
            resourceId = "com.whatsapp:id/entry",
            contentDescription = "Type a message",
            className = "android.widget.EditText",
            packageName = "com.whatsapp",
            bounds = Bounds(60, 1800, 880, 1950),
            clickable = true,
            editable = true,
        )

    private val staticLabel =
        UiNode(
            text = "Robert",
            className = "android.widget.TextView",
            packageName = "com.whatsapp",
            bounds = Bounds(60, 200, 500, 280),
        )

    private val conversationTree =
        UiTree(
            root =
                UiNode(
                    className = "android.widget.FrameLayout",
                    packageName = "com.whatsapp",
                    bounds = Bounds(0, 0, 1080, 2400),
                    children = listOf(staticLabel, messageField, sendButton),
                ),
            packageName = "com.whatsapp",
            activityName = "com.whatsapp.Conversation",
            screenWidthPx = 1080,
            screenHeightPx = 2400,
        )

    private val whatsapp = InstalledApp(packageName = "com.whatsapp", label = "WhatsApp")
    private val robert = Contact(id = "1", displayName = "Robert Smith", phoneNumbers = listOf("+447700900123"))

    // --- harness ----------------------------------------------------------

    private class Harness(
        val reader: FakeScreenReader,
        val performer: FakeNodeActionPerformer,
        val dispatcher: FakeGestureDispatcher,
        val capture: FakeScreenCapture,
        val apps: FakeAppManager,
        val contacts: FakeContactsReader,
        val clipboard: FakeClipboardTool,
        val alarms: FakeAlarmTool,
        val notifications: FakeNotificationTool,
        val intents: FakeIntentTool,
        val settings: FakeSystemSettingsReader,
        val media: FakeMediaTool,
        val globalActions: RecordingGlobalActionPerformer,
        val runtime: DefaultAutomationRuntime,
    )

    private fun harness(
        tree: UiTree? = null,
        serviceAvailable: Boolean = true,
        captureResult: CaptureResult = CaptureResult.ConsentRequired,
        apps: List<InstalledApp> = listOf(),
        contacts: List<Contact> = listOf(),
        missingContactsPermission: SensitiveCapability? = null,
        settings: Map<String, String> = emptyMap(),
        globalActionsSucceed: Boolean = true,
    ): Harness {
        val reader = FakeScreenReader(isAvailable = serviceAvailable, tree = tree)
        val performer = FakeNodeActionPerformer()
        val dispatcher = FakeGestureDispatcher(isAvailable = serviceAvailable)
        val capture = FakeScreenCapture(result = captureResult)
        val appManager = FakeAppManager(apps = apps)
        val contactsReader = FakeContactsReader(contacts, missingContactsPermission)
        val clipboard = FakeClipboardTool()
        val alarms = FakeAlarmTool()
        val notifications = FakeNotificationTool()
        val intents = FakeIntentTool()
        val settingsReader = FakeSystemSettingsReader(settings)
        val media = FakeMediaTool()
        val globalActions = RecordingGlobalActionPerformer(globalActionsSucceed)

        val runtime =
            DefaultAutomationRuntime(
                screenReaderProvider = { reader.takeIf { it.isAvailable } },
                actionPerformerProvider = { performer.takeIf { serviceAvailable } },
                gestureEngine =
                    GestureEngine(
                        dispatcher = dispatcher,
                        builder = GestureBuilder(screenWidthPx = 1080, screenHeightPx = 2400),
                        settleDelayMs = 0L,
                    ),
                screenCapture = capture,
                appManager = appManager,
                contactsReader = contactsReader,
                clipboardTool = clipboard,
                alarmTool = alarms,
                notificationTool = notifications,
                intentTool = intents,
                systemSettingsReader = settingsReader,
                mediaTool = media,
                globalActionPerformer = globalActions,
            )

        return Harness(
            reader, performer, dispatcher, capture, appManager, contactsReader, clipboard,
            alarms, notifications, intents, settingsReader, media, globalActions, runtime,
        )
    }

    // --- readiness --------------------------------------------------------

    @Test
    fun `is ready only when the accessibility service is connected`() {
        assertTrue(harness(tree = conversationTree).runtime.isReady)
        assertFalse(harness(serviceAvailable = false).runtime.isReady)
    }

    @Test
    fun `reading the tree without the service reports it must be enabled`() =
        runTest {
            val result = harness(serviceAvailable = false).runtime.getUiTree()

            assertEquals(AutomationError.AccessibilityUnavailable, result.errorOrNull)
            assertTrue(result.errorOrNull!!.needsUserAction)
        }

    @Test
    fun `reading a secure or transitioning screen reports no readable window`() =
        runTest {
            // A connected service with no root window: a secure screen or an
            // activity transition, both of which are normal.
            val result = harness(tree = null).runtime.getUiTree()

            assertFalse(result.isSuccess)
            assertEquals("tool_failed", result.errorOrNull?.code)
        }

    @Test
    fun `returns the captured tree`() =
        runTest {
            val result = harness(tree = conversationTree).runtime.getUiTree()

            assertEquals("com.whatsapp", result.valueOrNull?.packageName)
            assertEquals(4, result.valueOrNull?.nodeCount)
        }

    // --- findElement ------------------------------------------------------

    @Test
    fun `finds an element and reports the strategy that matched`() =
        runTest {
            val result =
                harness(tree = conversationTree)
                    .runtime
                    .findElement(Selector.byResourceId("send_button"))

            val element = result.valueOrNull!!
            assertEquals("Send", element.text)
            assertEquals(SelectorStrategy.RESOURCE_ID, element.strategy)
            assertFalse(element.isFragileMatch)
        }

    @Test
    fun `reports the element centre for gesture targeting`() =
        runTest {
            val element =
                harness(tree = conversationTree)
                    .runtime
                    .findElement(Selector.byResourceId("send_button"))
                    .valueOrNull!!

            assertEquals(975, element.centerX)
            assertEquals(1875, element.centerY)
        }

    @Test
    fun `a missing element reports every strategy that was tried`() =
        runTest {
            val result =
                harness(tree = conversationTree)
                    .runtime
                    .findElement(Selector(resourceId = "gone", text = "also gone"))

            val error = result.errorOrNull as AutomationError.ElementNotFound
            assertEquals(listOf("resourceId", "text"), error.attemptedStrategies)
            assertTrue(error.isRetryable)
        }

    @Test
    fun `flags a coordinate match as fragile`() =
        runTest {
            val element =
                harness(tree = conversationTree)
                    .runtime
                    .findElement(Selector.byCoordinates(975, 1875))
                    .valueOrNull!!

            assertEquals(SelectorStrategy.COORDINATES, element.strategy)
            assertTrue(element.isFragileMatch)
        }

    // --- waitForElement ---------------------------------------------------

    @Test
    fun `waitForElement returns immediately when the element is already present`() =
        runTest {
            val harness = harness(tree = conversationTree)

            val before = testScheduler.currentTime
            val result = harness.runtime.waitForElement(Selector.byResourceId("send_button"))

            assertTrue(result.isSuccess)
            assertEquals(0L, testScheduler.currentTime - before)
        }

    @Test
    fun `waitForElement polls repeatedly rather than failing on the first miss`() =
        runTest {
            // Empty screen: the element never appears, so this times out - but it
            // must have re-read the tree several times on the way.
            val harness = harness(tree = UiTree(root = UiNode(bounds = Bounds(0, 0, 1080, 2400))))

            val result =
                harness.runtime.waitForElement(Selector.byResourceId("send_button"), timeoutMs = 1_000L)

            assertFalse(result.isSuccess)
            assertTrue("should have polled more than once", harness.reader.captureCount > 1)
        }

    @Test
    fun `waitForElement times out with the last failure`() =
        runTest {
            val result =
                harness(tree = conversationTree)
                    .runtime
                    .waitForElement(Selector.byText("Nonexistent"), timeoutMs = 500L)

            assertFalse(result.isSuccess)
            assertTrue(result.errorOrNull!!.isRetryable)
        }

    @Test
    fun `waitForElement gives up at once when the service is disabled`() =
        runTest {
            val harness = harness(serviceAvailable = false)

            val before = testScheduler.currentTime
            val result = harness.runtime.waitForElement(Selector.byText("Send"), timeoutMs = 10_000L)

            // Waiting cannot fix a disabled service, so it must not burn the
            // whole timeout.
            assertEquals(AutomationError.AccessibilityUnavailable, result.errorOrNull)
            assertEquals(0L, testScheduler.currentTime - before)
        }

    @Test
    fun `waitForElement rejects a non-positive timeout`() =
        runTest {
            val result =
                harness(tree = conversationTree)
                    .runtime
                    .waitForElement(Selector.byText("Send"), timeoutMs = 0L)

            assertEquals("invalid_argument", result.errorOrNull?.code)
        }

    // --- click ------------------------------------------------------------

    @Test
    fun `click prefers the node's own accessibility action`() =
        runTest {
            val harness = harness(tree = conversationTree)

            val result = harness.runtime.click(Selector.byResourceId("send_button"))

            assertTrue(result.isSuccess)
            assertEquals(listOf("0.2"), harness.performer.clickCalls)
            assertTrue("should not need a coordinate tap", harness.dispatcher.dispatched.isEmpty())
        }

    @Test
    fun `click falls back to a coordinate tap when the node action fails`() =
        runTest {
            val harness = harness(tree = conversationTree)
            harness.performer.clickSucceeds = false

            val result = harness.runtime.click(Selector.byResourceId("send_button"))

            assertTrue(result.isSuccess)
            assertEquals(1, harness.dispatcher.dispatched.size)
            val tap = harness.dispatcher.dispatched.first() as GestureSpec.Tap
            assertEquals(975, tap.point.x)
            assertEquals(1875, tap.point.y)
        }

    @Test
    fun `click taps the centre of a non-clickable node with no clickable ancestor`() =
        runTest {
            val harness = harness(tree = conversationTree)

            val result = harness.runtime.click(Selector.byText("Robert"))

            // The label is not clickable and its only ancestor is the root frame, which is not clickable
            // either. With no node action available the gesture is the only option.
            assertTrue(result.isSuccess)
            assertTrue(harness.performer.clickCalls.isEmpty())
            assertEquals(1, harness.dispatcher.dispatched.size)
        }

    @Test
    fun `click uses the clickable ancestor of a text label`() =
        runTest {
            // The commonest real layout by a wide margin: a selector by visible text matches a TextView, and
            // the TextView is not clickable - its parent row is. The old code went straight to a coordinate
            // tap, which works often enough to look correct and fails exactly where it matters: a zero-area
            // label, a node covered by another view, or the service being off so nothing can be dispatched.
            val label =
                UiNode(
                    text = "Robert Smith",
                    className = "android.widget.TextView",
                    packageName = "com.whatsapp",
                    bounds = Bounds(60, 300, 700, 380),
                    index = 0,
                )

            val row =
                UiNode(
                    className = "android.widget.LinearLayout",
                    packageName = "com.whatsapp",
                    bounds = Bounds(0, 280, 1080, 400),
                    clickable = true,
                    index = 3,
                    children = listOf(label),
                )

            val listTree =
                UiTree(
                    root =
                        UiNode(
                            className = "android.widget.FrameLayout",
                            packageName = "com.whatsapp",
                            bounds = Bounds(0, 0, 1080, 2400),
                            children = listOf(row),
                        ),
                    packageName = "com.whatsapp",
                    screenWidthPx = 1080,
                    screenHeightPx = 2400,
                )

            val harness = harness(tree = listTree)

            val result = harness.runtime.click(Selector.byText("Robert Smith"))

            assertTrue(result.isSuccess)
            // The row's path, not the label's - and no coordinate tap.
            assertEquals(listOf("0.3"), harness.performer.clickCalls)
            assertTrue(harness.dispatcher.dispatched.isEmpty())
        }

    @Test
    fun `click does not reach past a few levels for an ancestor`() =
        runTest {
            // Beyond a level or two the "ancestor" is no longer the row the label sits in - it is the screen,
            // whose click action has nothing to do with what the user pointed at.
            var node =
                UiNode(
                    text = "Deep",
                    className = "android.widget.TextView",
                    packageName = "com.whatsapp",
                    bounds = Bounds(60, 300, 700, 380),
                    index = 0,
                )

            repeat(5) {
                node =
                    UiNode(
                        className = "android.widget.FrameLayout",
                        packageName = "com.whatsapp",
                        bounds = Bounds(0, 0, 1080, 2400),
                        index = 0,
                        children = listOf(node),
                    )
            }

            val clickableRoot =
                UiNode(
                    className = "android.widget.FrameLayout",
                    packageName = "com.whatsapp",
                    bounds = Bounds(0, 0, 1080, 2400),
                    clickable = true,
                    children = listOf(node),
                )

            val harness =
                harness(
                    tree =
                        UiTree(
                            root = clickableRoot,
                            packageName = "com.whatsapp",
                            screenWidthPx = 1080,
                            screenHeightPx = 2400,
                        ),
                )

            val result = harness.runtime.click(Selector.byText("Deep"))

            assertTrue(result.isSuccess)
            assertTrue("must not click a distant container", harness.performer.clickCalls.isEmpty())
            assertEquals(1, harness.dispatcher.dispatched.size)
        }

    @Test
    fun `click reports element not found without dispatching anything`() =
        runTest {
            val harness = harness(tree = conversationTree)

            val result = harness.runtime.click(Selector.byText("Nonexistent"))

            assertEquals("element_not_found", result.errorOrNull?.code)
            assertTrue(harness.dispatcher.dispatched.isEmpty())
        }

    @Test
    fun `clickAt dispatches a raw coordinate tap`() =
        runTest {
            val harness = harness(tree = conversationTree)

            val result = harness.runtime.clickAt(500, 1000)

            assertTrue(result.isSuccess)
            assertEquals(1, harness.dispatcher.dispatched.size)
        }

    @Test
    fun `clickAt refuses when the service is not connected`() =
        runTest {
            val result = harness(serviceAvailable = false).runtime.clickAt(500, 1000)
            assertEquals(AutomationError.AccessibilityUnavailable, result.errorOrNull)
        }

    @Test
    fun `a cancelled gesture is reported as retryable`() =
        runTest {
            val harness = harness(tree = conversationTree)
            harness.dispatcher.outcome = GestureOutcome.Cancelled

            val result = harness.runtime.clickAt(500, 1000)

            assertTrue(result.errorOrNull!!.isRetryable)
            assertEquals("gesture_failed", result.errorOrNull?.code)
        }

    @Test
    fun `a rejected gesture is reported as not retryable`() =
        runTest {
            val harness = harness(tree = conversationTree)
            harness.dispatcher.outcome = GestureOutcome.Failed("malformed path")

            val result = harness.runtime.clickAt(500, 1000)

            assertFalse(result.errorOrNull!!.isRetryable)
        }

    // --- typeText ---------------------------------------------------------

    @Test
    fun `typeText focuses then sets text on an editable field`() =
        runTest {
            val harness = harness(tree = conversationTree)

            val result = harness.runtime.typeText(Selector.byResourceId("entry"), "Hello Robert")

            assertTrue(result.isSuccess)
            assertEquals(listOf("0.1"), harness.performer.focusCalls)
            assertEquals(listOf("0.1" to "Hello Robert"), harness.performer.setTextCalls)
        }

    @Test
    fun `typeText refuses a target that is not a text field`() =
        runTest {
            val harness = harness(tree = conversationTree)

            val result = harness.runtime.typeText(Selector.byResourceId("send_button"), "text")

            assertEquals("invalid_argument", result.errorOrNull?.code)
            assertTrue(harness.performer.setTextCalls.isEmpty())
        }

    @Test
    fun `typeText finds the field inside a wrapper it was pointed at`() =
        runTest {
            // A selector written against a field's *label* or its container resolves to a wrapper, and this
            // used to be refused outright with "target is not a text field" - which reads as the tool being
            // broken when the selector was one node off. A hint or a contentDescription usually belongs to
            // exactly such a wrapper, so this is the commonest way typing fails.
            val field =
                UiNode(
                    className = "android.widget.EditText",
                    packageName = "com.whatsapp",
                    bounds = Bounds(70, 1810, 870, 1940),
                    editable = true,
                    index = 0,
                )

            val wrapper =
                UiNode(
                    contentDescription = "Type a message",
                    className = "android.widget.FrameLayout",
                    packageName = "com.whatsapp",
                    bounds = Bounds(60, 1800, 880, 1950),
                    index = 1,
                    children = listOf(field),
                )

            val harness =
                harness(
                    tree =
                        UiTree(
                            root =
                                UiNode(
                                    className = "android.widget.FrameLayout",
                                    packageName = "com.whatsapp",
                                    bounds = Bounds(0, 0, 1080, 2400),
                                    children = listOf(wrapper),
                                ),
                            packageName = "com.whatsapp",
                        ),
                )

            val result = harness.runtime.typeText(Selector.byContentDescription("Type a message"), "Hi")

            assertTrue(result.isSuccess)
            // The field's path, one level below the wrapper the selector matched.
            assertEquals(listOf("0.1.0" to "Hi"), harness.performer.setTextCalls)
        }

    @Test
    fun `typeText refuses a wrapper holding two fields`() =
        runTest {
            // Two editable descendants means the selector genuinely did not say which. Typing into the first
            // would be a guess with the user's data, which is worse than saying the selector was ambiguous.
            val wrapper =
                UiNode(
                    contentDescription = "Sign in",
                    className = "android.widget.LinearLayout",
                    packageName = "com.example",
                    bounds = Bounds(0, 400, 1080, 700),
                    index = 0,
                    children =
                        listOf(
                            UiNode(
                                className = "android.widget.EditText",
                                packageName = "com.example",
                                bounds = Bounds(60, 420, 1020, 500),
                                editable = true,
                                index = 0,
                            ),
                            UiNode(
                                className = "android.widget.EditText",
                                packageName = "com.example",
                                bounds = Bounds(60, 540, 1020, 620),
                                editable = true,
                                index = 1,
                            ),
                        ),
                )

            val harness =
                harness(
                    tree =
                        UiTree(
                            root =
                                UiNode(
                                    className = "android.widget.FrameLayout",
                                    packageName = "com.example",
                                    bounds = Bounds(0, 0, 1080, 2400),
                                    children = listOf(wrapper),
                                ),
                            packageName = "com.example",
                        ),
                )

            val result = harness.runtime.typeText(Selector.byContentDescription("Sign in"), "secret")

            assertEquals("invalid_argument", result.errorOrNull?.code)
            assertTrue(harness.performer.setTextCalls.isEmpty())
        }

    @Test
    fun `typeText reports when the field rejects the set-text action`() =
        runTest {
            val harness = harness(tree = conversationTree)
            harness.performer.setTextSucceeds = false

            val result = harness.runtime.typeText(Selector.byResourceId("entry"), "Hello")

            assertEquals("tool_failed", result.errorOrNull?.code)
        }

    @Test
    fun `typeText accepts an empty string to clear a field`() =
        runTest {
            val harness = harness(tree = conversationTree)

            val result = harness.runtime.typeText(Selector.byResourceId("entry"), "")

            assertTrue(result.isSuccess)
            assertEquals(listOf("0.1" to ""), harness.performer.setTextCalls)
        }

    // --- swipe and global actions -----------------------------------------

    @Test
    fun `swipe scrolls in the requested content direction`() =
        runTest {
            val harness = harness(tree = conversationTree)

            val result = harness.runtime.swipe(SwipeDirection.DOWN)

            assertTrue(result.isSuccess)
            val swipe = harness.dispatcher.dispatched.first() as GestureSpec.Swipe
            // Scrolling content down drags the finger up.
            assertTrue(swipe.to.y < swipe.from.y)
        }

    @Test
    fun `swipe rejects a distance fraction outside the valid range`() =
        runTest {
            val harness = harness(tree = conversationTree)

            assertEquals(
                "invalid_argument",
                harness.runtime.swipe(SwipeDirection.UP, distanceFraction = 0.0).errorOrNull?.code,
            )
            assertEquals(
                "invalid_argument",
                harness.runtime.swipe(SwipeDirection.UP, distanceFraction = 2.0).errorOrNull?.code,
            )
        }

    @Test
    fun `swipeBetween refuses a gesture that does not move`() =
        runTest {
            val result = harness(tree = conversationTree).runtime.swipeBetween(10, 10, 10, 10)
            assertEquals("invalid_argument", result.errorOrNull?.code)
        }

    @Test
    fun `pressBack and pressHome perform global actions`() =
        runTest {
            val harness = harness(tree = conversationTree)

            assertTrue(harness.runtime.pressBack().isSuccess)
            assertTrue(harness.runtime.pressHome().isSuccess)
            assertEquals(listOf(GlobalAction.BACK, GlobalAction.HOME), harness.globalActions.performed)
        }

    @Test
    fun `a rejected global action is reported as a tool failure`() =
        runTest {
            val harness = harness(tree = conversationTree, globalActionsSucceed = false)

            val result = harness.runtime.pressBack()

            assertEquals("tool_failed", result.errorOrNull?.code)
        }

    // --- screenshots ------------------------------------------------------

    @Test
    fun `takeScreenshot returns the capture on success`() =
        runTest {
            val screenshot =
                Screenshot(
                    filePath = "/data/captures/1.png",
                    widthPx = 1080,
                    heightPx = 2400,
                    capturedAtEpochMs = 1L,
                )
            val harness = harness(captureResult = CaptureResult.Success(screenshot))

            assertEquals(screenshot, harness.runtime.takeScreenshot().valueOrNull)
        }

    @Test
    fun `takeScreenshot distinguishes missing consent from a secure screen`() =
        runTest {
            val needsConsent = harness(captureResult = CaptureResult.ConsentRequired)
            val secure = harness(captureResult = CaptureResult.SecureWindow)

            val consentError = needsConsent.runtime.takeScreenshot().errorOrNull!!
            val secureError = secure.runtime.takeScreenshot().errorOrNull!!

            assertTrue(consentError.needsUserAction)
            assertFalse("a banking app will never be capturable", secureError.needsUserAction)
            assertEquals("secure_screen", secureError.code)
        }

    @Test
    fun `takeScreenshot reports a pipeline failure`() =
        runTest {
            val harness = harness(captureResult = CaptureResult.Failed("no frame arrived"))

            assertEquals("tool_failed", harness.runtime.takeScreenshot().errorOrNull?.code)
        }

    // --- apps -------------------------------------------------------------

    @Test
    fun `openApp launches an installed package`() =
        runTest {
            val harness = harness(apps = listOf(whatsapp))

            assertTrue(harness.runtime.openApp("com.whatsapp").isSuccess)
            assertEquals(listOf("com.whatsapp"), harness.apps.opened)
        }

    @Test
    fun `openApp reports a package that is not installed`() =
        runTest {
            val result = harness(apps = listOf(whatsapp)).runtime.openApp("com.telegram")
            assertEquals("tool_failed", result.errorOrNull?.code)
        }

    @Test
    fun `openApp rejects a blank package name`() =
        runTest {
            assertEquals("invalid_argument", harness().runtime.openApp("  ").errorOrNull?.code)
        }

    @Test
    fun `openAppByName resolves the app the way a person names it`() =
        runTest {
            val harness = harness(apps = listOf(whatsapp))

            val result = harness.runtime.openAppByName("whatsapp")

            assertEquals(whatsapp, result.valueOrNull)
        }

    @Test
    fun `openAppByName reports when nothing matches`() =
        runTest {
            val result = harness(apps = listOf(whatsapp)).runtime.openAppByName("signal")
            assertEquals("tool_failed", result.errorOrNull?.code)
        }

    @Test
    fun `listApps excludes system packages by default`() =
        runTest {
            val system = InstalledApp("com.android.settings", "Settings", isSystemApp = true)
            val harness = harness(apps = listOf(whatsapp, system))

            assertEquals(1, harness.runtime.listApps().valueOrNull?.size)
            assertEquals(2, harness.runtime.listApps(includeSystem = true).valueOrNull?.size)
        }

    // --- device tools -----------------------------------------------------

    @Test
    fun `getContacts returns contacts`() =
        runTest {
            val result = harness(contacts = listOf(robert)).runtime.getContacts()
            assertEquals(listOf(robert), result.valueOrNull)
        }

    @Test
    fun `a revoked contacts permission becomes a typed permission error`() =
        runTest {
            val harness = harness(missingContactsPermission = SensitiveCapability.CONTACTS)

            val error = harness.runtime.getContacts().errorOrNull as AutomationError.PermissionDenied

            assertEquals("android.permission.READ_CONTACTS", error.permission)
            assertFalse(error.requiresSettingsScreen)
            assertTrue(error.needsUserAction)
        }

    @Test
    fun `findContacts resolves a person by name`() =
        runTest {
            val result = harness(contacts = listOf(robert)).runtime.findContacts("Robert")
            assertEquals(1, result.valueOrNull?.size)
        }

    @Test
    fun `createAlarm passes the request through`() =
        runTest {
            val harness = harness()
            val request = AlarmRequest(hour = 7, minute = 30, label = "Standup")

            assertTrue(harness.runtime.createAlarm(request).isSuccess)
            assertEquals(listOf(request), harness.alarms.created)
        }

    @Test
    fun `createAlarm reports when no clock app handled it`() =
        runTest {
            val harness = harness()
            harness.alarms.succeeds = false

            val result = harness.runtime.createAlarm(AlarmRequest(7, 30))

            assertEquals("tool_failed", result.errorOrNull?.code)
        }

    @Test
    fun `clipboard round-trips text`() =
        runTest {
            val harness = harness()

            assertTrue(harness.runtime.writeClipboard("copied").isSuccess)
            assertEquals("copied", harness.runtime.readClipboard().valueOrNull)
        }

    @Test
    fun `reading an empty or inaccessible clipboard succeeds with null`() =
        runTest {
            // From Android 10 a background app cannot read the clipboard; that is
            // an expected null, not a failure.
            val result = harness().runtime.readClipboard()

            assertTrue(result.isSuccess)
            assertNull(result.valueOrNull)
        }

    @Test
    fun `sendNotification posts a notification`() =
        runTest {
            val harness = harness()

            assertTrue(harness.runtime.sendNotification("Done", "Message sent").isSuccess)
            assertEquals(listOf("Done" to "Message sent"), harness.notifications.posted)
        }

    @Test
    fun `sendNotification rejects a blank title`() =
        runTest {
            assertEquals(
                "invalid_argument",
                harness().runtime.sendNotification("", "body").errorOrNull?.code,
            )
        }

    @Test
    fun `a dropped notification is reported as a permission problem`() =
        runTest {
            // From API 33 posting without permission silently does nothing, so the
            // runtime must not report success.
            val harness = harness()
            harness.notifications.succeeds = false

            val result = harness.runtime.sendNotification("Done", "body")

            assertEquals("permission_denied", result.errorOrNull?.code)
        }

    @Test
    fun `launchIntent passes the request through`() =
        runTest {
            val harness = harness()
            val request = IntentRequest("android.intent.action.VIEW", dataUri = "https://example.com")

            assertTrue(harness.runtime.launchIntent(request).isSuccess)
            assertEquals(listOf(request), harness.intents.launched)
        }

    @Test
    fun `launchIntent reports when nothing handles the action`() =
        runTest {
            val harness = harness()
            harness.intents.succeeds = false

            val result = harness.runtime.launchIntent(IntentRequest("com.example.NOTHING"))

            assertEquals("tool_failed", result.errorOrNull?.code)
        }

    @Test
    fun `getSystemSetting reads a value`() =
        runTest {
            val harness = harness(settings = mapOf("screen_brightness" to "128"))

            assertEquals("128", harness.runtime.getSystemSetting("screen_brightness").valueOrNull)
        }

    @Test
    fun `getSystemSetting rejects a blank key`() =
        runTest {
            assertEquals("invalid_argument", harness().runtime.getSystemSetting("").errorOrNull?.code)
        }

    @Test
    fun `getSystemSetting succeeds with null for an unknown key`() =
        runTest {
            val result = harness().runtime.getSystemSetting("nonexistent_setting")

            assertTrue(result.isSuccess)
            assertNull(result.valueOrNull)
        }

    // --- media ------------------------------------------------------------

    @Test
    fun `controlMedia sends the command to whatever holds the session`() =
        runTest {
            val harness = harness()

            val result = harness.runtime.controlMedia(MediaCommand.PLAY_PAUSE)

            assertTrue(result.isSuccess)
            assertEquals(listOf(MediaCommand.PLAY_PAUSE), harness.media.commands)
        }

    @Test
    fun `controlMedia reports when nothing is playing`() =
        runTest {
            // A play/pause with no media session silently does nothing, so reporting
            // success would tell a workflow it had paused music it never touched.
            val harness = harness()
            harness.media.controlSucceeds = false

            val result = harness.runtime.controlMedia(MediaCommand.PAUSE)

            assertEquals("tool_failed", result.errorOrNull?.code)
        }

    @Test
    fun `adjustVolume nudges in the requested direction`() =
        runTest {
            val harness = harness()

            assertTrue(harness.runtime.adjustVolume(VolumeDirection.DOWN).isSuccess)
            assertEquals(listOf(VolumeDirection.DOWN), harness.media.volumeChanges)
        }

    @Test
    fun `adjustVolume reports a rejected change`() =
        runTest {
            val harness = harness()
            harness.media.volumeSucceeds = false

            assertEquals(
                "tool_failed",
                harness.runtime.adjustVolume(VolumeDirection.UP).errorOrNull?.code,
            )
        }

    // --- the full driving scenario ----------------------------------------
    @Test
    fun `sends a message end to end - open app, type, tap send`() =
        runTest {
            val harness = harness(tree = conversationTree, apps = listOf(whatsapp))

            val opened = harness.runtime.openAppByName("WhatsApp")
            val typed = harness.runtime.typeText(Selector.byResourceId("entry"), "On my way")
            val sent = harness.runtime.click(Selector.byResourceId("send_button"))

            assertTrue(opened.isSuccess)
            assertTrue(typed.isSuccess)
            assertTrue(sent.isSuccess)
            assertEquals(listOf("0.1" to "On my way"), harness.performer.setTextCalls)
            assertEquals(listOf("0.2"), harness.performer.clickCalls)
        }
}
