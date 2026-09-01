package com.mobileautomation.bridge

import com.mobileautomation.accessibility.model.Bounds
import com.mobileautomation.accessibility.model.UiNode
import com.mobileautomation.accessibility.model.UiTree
import com.mobileautomation.accessibility.selector.Selector
import com.mobileautomation.accessibility.selector.SelectorStrategy
import com.mobileautomation.automation.AutomationError
import com.mobileautomation.automation.AutomationRuntime
import com.mobileautomation.automation.CallOutcome
import com.mobileautomation.automation.ResolvedElement
import com.mobileautomation.automation.ToolResult
import com.mobileautomation.gestures.SwipeDirection
import com.mobileautomation.ocr.OcrBounds
import com.mobileautomation.ocr.OcrMatch
import com.mobileautomation.ocr.OcrMatchKind
import com.mobileautomation.ocr.OcrResult
import com.mobileautomation.ocr.OcrTextBlock
import com.mobileautomation.screen.Screenshot
import com.mobileautomation.tools.IntentRequest
import com.mobileautomation.tools.MediaCommand
import com.mobileautomation.tools.RingerMode
import com.mobileautomation.tools.VolumeDirection
import com.mobileautomation.tools.model.AlarmRequest
import com.mobileautomation.tools.model.Contact
import com.mobileautomation.tools.model.CurrentScreen
import com.mobileautomation.tools.model.InstalledApp
import com.mobileautomation.tools.model.SmsMessage
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tests for the conversion layer between the runtime and React Native.
 *
 * The bridge takes an `AutomationRuntime` and nothing else, which is what makes
 * this possible off-device: the RN module adds only promise plumbing, so every
 * decision worth testing - argument parsing, result serialization, error mapping -
 * is exercised here rather than on an emulator.
 */
class AutomationBridgeTest {
    /** A runtime returning scripted results and recording what it was asked. */
    private class FakeRuntime(
        override val isReady: Boolean = true,
    ) : AutomationRuntime {
        var elementResult: ToolResult<ResolvedElement> = ToolResult.success(sampleElement)
        var treeResult: ToolResult<UiTree> = ToolResult.success(sampleTree)
        var unitResult: ToolResult<Unit> = ToolResult.success(Unit)
        var screenshotResult: ToolResult<Screenshot> = ToolResult.success(sampleScreenshot)
        var clipboardResult: ToolResult<String?> = ToolResult.success("copied")
        var settingResult: ToolResult<String?> = ToolResult.success("128")

        val calls = mutableListOf<String>()
        var lastSelector: Selector? = null
        var lastTimeoutMs: Long? = null
        var lastLongPressDuration: Long? = null
        var lastSwipeDirection: SwipeDirection? = null
        var lastAlarm: AlarmRequest? = null
        var lastIntent: IntentRequest? = null
        var lastMediaCommand: MediaCommand? = null
        var lastVolumeDirection: VolumeDirection? = null

        override suspend fun getUiTree(): ToolResult<UiTree> = treeResult.also { calls.add("getUiTree") }

        override suspend fun getCurrentScreen(): ToolResult<CurrentScreen> =
            ToolResult.success(CurrentScreen("com.whatsapp", "com.whatsapp.Conversation"))

        override suspend fun findElement(selector: Selector): ToolResult<ResolvedElement> {
            calls.add("findElement")
            lastSelector = selector
            return elementResult
        }

        override suspend fun waitForElement(
            selector: Selector,
            timeoutMs: Long,
        ): ToolResult<ResolvedElement> {
            calls.add("waitForElement")
            lastSelector = selector
            lastTimeoutMs = timeoutMs
            return elementResult
        }

        override suspend fun click(selector: Selector): ToolResult<Unit> {
            calls.add("click")
            lastSelector = selector
            return unitResult
        }

        override suspend fun clickAt(
            x: Int,
            y: Int,
        ): ToolResult<Unit> = unitResult.also { calls.add("clickAt($x,$y)") }

        override suspend fun longPress(
            selector: Selector,
            durationMs: Long?,
        ): ToolResult<Unit> {
            calls.add("longPress")
            lastSelector = selector
            lastLongPressDuration = durationMs
            return unitResult
        }

        override suspend fun swipe(
            direction: SwipeDirection,
            distanceFraction: Double,
        ): ToolResult<Unit> {
            calls.add("swipe")
            lastSwipeDirection = direction
            return unitResult
        }

        override suspend fun swipeBetween(
            fromX: Int,
            fromY: Int,
            toX: Int,
            toY: Int,
            durationMs: Long?,
        ): ToolResult<Unit> = unitResult.also { calls.add("swipeBetween") }

        override suspend fun typeText(
            selector: Selector,
            text: String,
        ): ToolResult<Unit> {
            calls.add("typeText($text)")
            lastSelector = selector
            return unitResult
        }

        override suspend fun pressBack(): ToolResult<Unit> = unitResult.also { calls.add("pressBack") }

        override suspend fun pressHome(): ToolResult<Unit> = unitResult.also { calls.add("pressHome") }

        override suspend fun takeScreenshot(): ToolResult<Screenshot> =
            screenshotResult.also { calls.add("takeScreenshot") }

        override suspend fun openApp(packageName: String): ToolResult<Unit> =
            unitResult.also { calls.add("openApp($packageName)") }

        override suspend fun openAppByName(name: String): ToolResult<InstalledApp> =
            ToolResult.success(InstalledApp("com.whatsapp", "WhatsApp"))

        override suspend fun listApps(includeSystem: Boolean): ToolResult<List<InstalledApp>> =
            ToolResult.success(
                listOf(
                    InstalledApp("com.whatsapp", "WhatsApp"),
                    InstalledApp("com.telegram", "Telegram", versionName = "10.1"),
                ),
            )

        override suspend fun getContacts(limit: Int): ToolResult<List<Contact>> =
            ToolResult.success(listOf(Contact("1", "Robert Smith", listOf("+447700900123"))))

        override suspend fun findContacts(query: String): ToolResult<List<Contact>> =
            ToolResult.success(listOf(Contact("1", "Robert Smith", listOf("+447700900123"))))

        override suspend fun createAlarm(request: AlarmRequest): ToolResult<Unit> {
            lastAlarm = request
            return unitResult
        }

        override suspend fun readClipboard(): ToolResult<String?> = clipboardResult

        override suspend fun writeClipboard(text: String): ToolResult<Unit> =
            unitResult.also { calls.add("writeClipboard($text)") }

        override suspend fun sendNotification(
            title: String,
            body: String,
        ): ToolResult<Unit> = unitResult

        override suspend fun launchIntent(request: IntentRequest): ToolResult<Unit> {
            lastIntent = request
            return unitResult
        }

        override suspend fun getSystemSetting(key: String): ToolResult<String?> = settingResult

        override suspend fun controlMedia(command: MediaCommand): ToolResult<Unit> {
            lastMediaCommand = command
            return unitResult
        }

        override suspend fun adjustVolume(direction: VolumeDirection): ToolResult<Unit> {
            lastVolumeDirection = direction
            return unitResult
        }

        // --- reading a screen the tree does not describe -------------------

        var ocrResult: ToolResult<OcrResult> =
            ToolResult.success(OcrResult(blocks = emptyList(), screenWidthPx = 1080, screenHeightPx = 2400))

        var ocrMatch: ToolResult<OcrMatch> =
            ToolResult.success(
                OcrMatch(
                    block = OcrTextBlock(text = "Continue", bounds = OcrBounds(400, 1200, 700, 1300)),
                    kind = OcrMatchKind.EXACT,
                    similarity = 1.0,
                ),
            )

        var lastOcrQuery: Pair<String, Boolean>? = null

        override suspend fun runOcr(): ToolResult<OcrResult> = ocrResult

        override suspend fun findTextOnScreen(
            query: String,
            exact: Boolean,
        ): ToolResult<OcrMatch> {
            lastOcrQuery = query to exact
            return ocrMatch
        }

        // --- messaging and calls ------------------------------------------

        var lastSms: Pair<String, String>? = null
        var lastSmsRead: Pair<Int, String?>? = null
        var lastCalledNumber: String? = null
        var callOutcome: CallOutcome = CallOutcome.CALLING
        var endedCalls: Int = 0
        var messages: List<SmsMessage> = emptyList()

        override suspend fun sendSms(
            phoneNumber: String,
            body: String,
        ): ToolResult<Unit> {
            lastSms = phoneNumber to body
            return unitResult
        }

        override suspend fun readSms(
            limit: Int,
            fromNumber: String?,
        ): ToolResult<List<SmsMessage>> {
            lastSmsRead = limit to fromNumber
            return ToolResult.success(messages)
        }

        override suspend fun placeCall(phoneNumber: String): ToolResult<CallOutcome> {
            lastCalledNumber = phoneNumber
            return ToolResult.success(callOutcome)
        }

        override suspend fun endCall(): ToolResult<Unit> {
            endedCalls++
            return unitResult
        }

        // --- device configuration -----------------------------------------

        var lastSettingWrite: Pair<String, String>? = null
        var lastRingerMode: RingerMode? = null

        override suspend fun setSystemSetting(
            key: String,
            value: String,
        ): ToolResult<Unit> {
            lastSettingWrite = key to value
            return unitResult
        }

        override suspend fun setRingerMode(mode: RingerMode): ToolResult<Unit> {
            lastRingerMode = mode
            return unitResult
        }
    }

    private fun bridge(
        runtime: FakeRuntime = FakeRuntime(),
        canCapture: Boolean = false,
        canOverlay: Boolean = false,
    ) = AutomationBridge(runtime, { canCapture }, { canOverlay })

    private fun successJson(outcome: AutomationBridge.Outcome): String? {
        assertTrue("expected success but got $outcome", outcome is AutomationBridge.Outcome.Success)
        return (outcome as AutomationBridge.Outcome.Success).json
    }

    private fun rejection(outcome: AutomationBridge.Outcome): BridgeErrors.Rejection {
        assertTrue("expected failure but got $outcome", outcome is AutomationBridge.Outcome.Failure)
        return (outcome as AutomationBridge.Outcome.Failure).rejection
    }

    // --- status -----------------------------------------------------------

    @Test
    fun `reports status as json`() {
        val json = bridge(canCapture = true, canOverlay = true).getStatusJson()

        assertTrue(json.contains("\"isReady\":true"))
        assertTrue(json.contains("\"canCaptureScreen\":true"))
        assertTrue(json.contains("\"canDrawOverlay\":true"))
    }

    @Test
    fun `reports not ready when the runtime is not`() {
        val json = bridge(runtime = FakeRuntime(isReady = false)).getStatusJson()
        assertTrue(json.contains("\"isReady\":false"))
    }

    // --- selectors in ------------------------------------------------------

    @Test
    fun `parses a selector and passes it to the runtime`() =
        runTest {
            val runtime = FakeRuntime()

            bridge(runtime).click("""{"resourceId":"send_button","packageName":"com.whatsapp"}""")

            assertEquals("send_button", runtime.lastSelector?.resourceId)
            assertEquals("com.whatsapp", runtime.lastSelector?.packageName)
        }

    @Test
    fun `rejects a malformed selector without calling the runtime`() =
        runTest {
            val runtime = FakeRuntime()

            val outcome = bridge(runtime).click("{}")

            assertEquals("invalid_argument", rejection(outcome).code)
            assertTrue("the runtime must not be called", runtime.calls.isEmpty())
        }

    @Test
    fun `treats a zero long-press duration as the platform default`() =
        runTest {
            // The codegen spec cannot express an optional number, so 0 is the
            // sentinel for "use the platform default".
            val runtime = FakeRuntime()

            bridge(runtime).longPress("""{"text":"Send"}""", 0L)

            assertNull(runtime.lastLongPressDuration)
        }

    @Test
    fun `passes an explicit long-press duration through`() =
        runTest {
            val runtime = FakeRuntime()

            bridge(runtime).longPress("""{"text":"Send"}""", 800L)

            assertEquals(800L, runtime.lastLongPressDuration)
        }

    @Test
    fun `parses a swipe direction`() =
        runTest {
            val runtime = FakeRuntime()

            bridge(runtime).swipe("down", 0.8)

            assertEquals(SwipeDirection.DOWN, runtime.lastSwipeDirection)
        }

    @Test
    fun `rejects an unknown swipe direction`() =
        runTest {
            assertEquals("invalid_argument", rejection(bridge().swipe("sideways", 0.8)).code)
        }

    // --- results out -------------------------------------------------------

    @Test
    fun `serializes a resolved element with the strategy wire name`() =
        runTest {
            val json = successJson(bridge().findElement("""{"resourceId":"send_button"}"""))!!

            assertTrue(json.contains("\"text\":\"Send\""))
            assertTrue(json.contains("\"centerX\":975"))
            assertTrue(json.contains("\"centerY\":1875"))
            // The wire name, so TS can compare against SELECTOR_STRATEGIES rather
            // than a Kotlin enum name.
            assertTrue(json.contains("\"strategy\":\"resourceId\""))
            assertTrue(json.contains("\"structuralPath\":\"0.2\""))
        }

    @Test
    fun `serializes element bounds as an object`() =
        runTest {
            val json = successJson(bridge().findElement("""{"text":"Send"}"""))!!

            assertTrue(
                json.contains("\"bounds\":{\"left\":900,\"top\":1800,\"right\":1050,\"bottom\":1950}"),
            )
        }

    @Test
    fun `serializes a screenshot by path rather than bytes`() =
        runTest {
            val json = successJson(bridge().takeScreenshot())!!

            assertTrue(json.contains("\"filePath\":\"/data/captures/1.png\""))
            assertTrue(json.contains("\"widthPx\":1080"))
            // Bytes crossing the bridge would block the JS thread.
            assertFalseContains(json, "base64")
        }

    // --- ocr --------------------------------------------------------------

    @Test
    fun `serializes ocr results with a tappable point per line`() =
        runTest {
            val runtime = FakeRuntime()
            runtime.ocrResult =
                ToolResult.success(
                    OcrResult(
                        blocks =
                            listOf(
                                OcrTextBlock(
                                    text = "Continue",
                                    bounds = OcrBounds(400, 1200, 700, 1300),
                                    confidence = 0.94,
                                ),
                            ),
                        screenWidthPx = 1080,
                        screenHeightPx = 2400,
                        durationMs = 180L,
                    ),
                )

            val json = successJson(bridge(runtime).runOcr())!!

            assertTrue(json.contains("\"text\":\"Continue\""))
            assertTrue(json.contains("\"blockCount\":1"))
            // The centre crosses the bridge rather than being recomputed on the TS side: two implementations of a
            // centre point is exactly how a tap ends up one row off.
            assertTrue(json.contains("\"centerX\":550"))
            assertTrue(json.contains("\"centerY\":1250"))
            assertTrue(json.contains("\"screenWidthPx\":1080"))
        }

    @Test
    fun `omits confidence when the recogniser reported none`() =
        runTest {
            // Absent rather than defaulted, so the TS side can tell "not measured" from "measured as certain".
            val runtime = FakeRuntime()
            runtime.ocrResult =
                ToolResult.success(
                    OcrResult(
                        blocks = listOf(OcrTextBlock(text = "Continue", bounds = OcrBounds(0, 0, 100, 40))),
                        screenWidthPx = 1080,
                        screenHeightPx = 2400,
                    ),
                )

            val json = successJson(bridge(runtime).runOcr())!!

            assertFalseContains(json, "confidence")
        }

    @Test
    fun `serializes an empty ocr result as an empty array rather than null`() =
        runTest {
            // A screen with no text is a successful read. `null` would make the TS side treat it as a failure.
            val json = successJson(bridge().runOcr())!!

            assertTrue(json.contains("\"blocks\":[]"))
            assertTrue(json.contains("\"blockCount\":0"))
        }

    @Test
    fun `serializes an ocr match with its rung and similarity`() =
        runTest {
            val runtime = FakeRuntime()
            runtime.ocrMatch =
                ToolResult.success(
                    OcrMatch(
                        block = OcrTextBlock(text = "Contlnue", bounds = OcrBounds(400, 1200, 700, 1300)),
                        kind = OcrMatchKind.FUZZY,
                        similarity = 0.875,
                    ),
                )

            val json = successJson(bridge(runtime).findTextOnScreen("Continue", exact = false))!!

            // Both fields matter to the agent: acting on a fuzzy match without checking the text is how it taps
            // "Share" when it meant "Save".
            assertTrue(json.contains("\"matchKind\":\"fuzzy\""))
            assertTrue(json.contains("\"text\":\"Contlnue\""))
            assertTrue(json.contains("\"isStrong\":false"))
            assertTrue(json.contains("\"similarity\":0.875"))
        }

    @Test
    fun `a fractional value crosses as a plain json number`() =
        runTest {
            // Deliberately not locale-formatted: a German device would emit 0,875 and produce JSON the TS side
            // cannot parse - a bug that only appears for some users.
            val runtime = FakeRuntime()
            runtime.ocrMatch =
                ToolResult.success(
                    OcrMatch(
                        block = OcrTextBlock(text = "Continue", bounds = OcrBounds(0, 0, 100, 40)),
                        kind = OcrMatchKind.EXACT,
                        similarity = 1.0,
                    ),
                )

            val json = successJson(bridge(runtime).findTextOnScreen("Continue", exact = true))!!

            assertFalseContains(json, ",0")
            assertTrue(json.contains("\"similarity\":1.0"))
        }

    @Test
    fun `passes the query and the exact flag through to the runtime`() =
        runTest {
            val runtime = FakeRuntime()

            bridge(runtime).findTextOnScreen("Continue", exact = true)

            assertEquals("Continue" to true, runtime.lastOcrQuery)
        }

    @Test
    fun `reports absent text as element not found rather than a tool failure`() =
        runTest {
            // The distinction that tells the agent to scroll rather than to stop.
            val runtime = FakeRuntime()
            runtime.ocrMatch =
                ToolResult.failure(
                    AutomationError.ElementNotFound(
                        attemptedStrategies = listOf("ocrText"),
                        detail = "\"Continue\" was not among the 12 lines recognised",
                    ),
                )

            assertEquals(
                "element_not_found",
                rejection(bridge(runtime).findTextOnScreen("Continue", exact = false)).code,
            )
        }

    @Test
    fun `delegates ui tree serialization to the versioned serializer`() =
        runTest {
            val json = successJson(bridge().getUiTree(compact = false))!!

            // Same format the TS side already validates, rather than a second one
            // that could drift from it.
            assertTrue(json.contains("\"schemaVersion\":2"))
            assertTrue(json.contains("\"packageName\":\"com.whatsapp\""))
            assertTrue(json.contains("\"root\":"))
        }

    @Test
    fun `compact ui tree is smaller than the full one`() =
        runTest {
            val full = successJson(bridge().getUiTree(compact = false))!!
            val compact = successJson(bridge().getUiTree(compact = true))!!

            assertTrue(compact.length < full.length)
        }

    @Test
    fun `serializes an app list as a json array`() =
        runTest {
            val json = successJson(bridge().listApps(includeSystem = false))!!

            assertTrue(json.startsWith("["))
            assertTrue(json.contains("\"label\":\"WhatsApp\""))
            assertTrue(json.contains("\"versionName\":null"))
            assertTrue(json.contains("\"versionName\":\"10.1\""))
        }

    @Test
    fun `serializes contacts with their numbers`() =
        runTest {
            val json = successJson(bridge().getContacts(10))!!

            assertTrue(json.contains("\"displayName\":\"Robert Smith\""))
            assertTrue(json.contains("\"phoneNumbers\":[\"+447700900123\"]"))
        }

    @Test
    fun `returns clipboard text as a plain string not json`() =
        runTest {
            // The spec declares Promise<string | null>; clipboard text is not
            // structured, so quoting it would give the caller a quoted string.
            assertEquals("copied", successJson(bridge().readClipboard()))
        }

    @Test
    fun `resolves null for an empty clipboard`() =
        runTest {
            val runtime = FakeRuntime()
            runtime.clipboardResult = ToolResult.success(null)

            assertNull(successJson(bridge(runtime).readClipboard()))
        }

    @Test
    fun `resolves null for an unknown system setting`() =
        runTest {
            val runtime = FakeRuntime()
            runtime.settingResult = ToolResult.success(null)

            assertNull(successJson(bridge(runtime).getSystemSetting("nope")))
        }

    @Test
    fun `resolves with no value for a void action`() =
        runTest {
            assertNull(successJson(bridge().pressBack()))
        }

    // --- error mapping -----------------------------------------------------

    @Test
    fun `maps element not found to its code and carries the strategies tried`() =
        runTest {
            val runtime = FakeRuntime()
            runtime.elementResult =
                ToolResult.failure(
                    AutomationError.ElementNotFound(listOf("resourceId", "text"), "no node matched"),
                )

            val rejection = rejection(bridge(runtime).findElement("""{"text":"Send"}"""))

            assertEquals("element_not_found", rejection.code)
            assertTrue(rejection.message.contains("no node matched"))
            assertTrue(rejection.detailJson.contains("resourceId"))
            assertTrue(rejection.detailJson.contains("text"))
        }

    @Test
    fun `maps a permission denial with the permission name`() =
        runTest {
            val runtime = FakeRuntime()
            runtime.elementResult =
                ToolResult.failure(
                    AutomationError.PermissionDenied("android.permission.READ_CONTACTS", false),
                )

            val rejection = rejection(bridge(runtime).findElement("""{"text":"x"}"""))

            assertEquals("permission_denied", rejection.code)
            assertTrue(rejection.detailJson.contains("android.permission.READ_CONTACTS"))
            assertTrue(rejection.detailJson.contains("\"requiresSettingsScreen\":false"))
        }

    @Test
    fun `maps a secure screen so the caller stops retrying`() =
        runTest {
            val runtime = FakeRuntime()
            runtime.screenshotResult = ToolResult.failure(AutomationError.SecureScreen)

            assertEquals("secure_screen", rejection(bridge(runtime).takeScreenshot()).code)
        }

    @Test
    fun `maps missing capture consent so the caller can ask`() =
        runTest {
            val runtime = FakeRuntime()
            runtime.screenshotResult = ToolResult.failure(AutomationError.CaptureConsentRequired)

            assertEquals("capture_consent_required", rejection(bridge(runtime).takeScreenshot()).code)
        }

    @Test
    fun `maps a timeout with the operation and budget`() =
        runTest {
            val runtime = FakeRuntime()
            runtime.elementResult = ToolResult.failure(AutomationError.Timeout("waitForElement", 5_000L))

            val rejection = rejection(bridge(runtime).waitForElement("""{"text":"Send"}""", 5_000L))

            assertEquals("timeout", rejection.code)
            assertTrue(rejection.detailJson.contains("waitForElement"))
            assertTrue(rejection.detailJson.contains("5000"))
        }

    @Test
    fun `maps accessibility unavailable`() =
        runTest {
            val runtime = FakeRuntime()
            runtime.treeResult = ToolResult.failure(AutomationError.AccessibilityUnavailable)

            assertEquals("accessibility_unavailable", rejection(bridge(runtime).getUiTree(false)).code)
        }

    @Test
    fun `every rejection carries valid json detail`() =
        runTest {
            val errors =
                listOf(
                    AutomationError.AccessibilityUnavailable,
                    AutomationError.PermissionDenied("p", true),
                    AutomationError.ElementNotFound(listOf("text"), "d"),
                    AutomationError.GestureFailed("d"),
                    AutomationError.SecureScreen,
                    AutomationError.CaptureConsentRequired,
                    AutomationError.Timeout("op", 1L),
                    AutomationError.InvalidArgument("d"),
                    AutomationError.ToolFailed("t", "d"),
                    AutomationError.Unexpected("d"),
                )

            for (error in errors) {
                val detail = BridgeErrors.toRejection(error).detailJson
                assertTrue("${error.code} detail is not an object: $detail", detail.startsWith("{"))
                assertTrue("${error.code} detail is not an object: $detail", detail.endsWith("}"))
            }
        }

    @Test
    fun `maps a malformed argument exception to invalid_argument`() {
        val rejection =
            BridgeErrors.toRejection(BridgeArguments.MalformedArgument("selector is empty"))

        assertEquals("invalid_argument", rejection.code)
        assertTrue(rejection.message.contains("selector is empty"))
    }

    @Test
    fun `maps an unexpected throwable rather than letting it escape`() {
        // Reaching JS as a raw Java exception would give the TS side nothing to
        // classify, so the outermost boundary always produces a typed code.
        val rejection = BridgeErrors.toRejection(IllegalStateException("boom"))

        assertEquals("unexpected", rejection.code)
        assertTrue(rejection.message.contains("boom"))
        assertTrue(rejection.detailJson.contains("IllegalStateException"))
    }

    @Test
    fun `names the exception type when there is no message`() {
        val rejection = BridgeErrors.toRejection(IllegalStateException())
        assertTrue(rejection.message.contains("IllegalStateException"))
    }

    // --- structured arguments ---------------------------------------------

    @Test
    fun `parses an alarm request and passes it through`() =
        runTest {
            val runtime = FakeRuntime()

            bridge(runtime).createAlarm("""{"hour":7,"minute":30,"label":"Standup"}""")

            assertEquals(7, runtime.lastAlarm?.hour)
            assertEquals("Standup", runtime.lastAlarm?.label)
        }

    @Test
    fun `rejects an out-of-range alarm before the runtime sees it`() =
        runTest {
            val runtime = FakeRuntime()

            val outcome = bridge(runtime).createAlarm("""{"hour":99,"minute":0}""")

            assertEquals("invalid_argument", rejection(outcome).code)
            assertNull(runtime.lastAlarm)
        }

    @Test
    fun `parses an intent request`() =
        runTest {
            val runtime = FakeRuntime()

            bridge(runtime).launchIntent(
                """{"action":"android.intent.action.VIEW","dataUri":"https://example.com"}""",
            )

            assertEquals("android.intent.action.VIEW", runtime.lastIntent?.action)
            assertEquals("https://example.com", runtime.lastIntent?.dataUri)
        }

    @Test
    fun `parses a media command`() =
        runTest {
            val runtime = FakeRuntime()

            bridge(runtime).controlMedia("play_pause")

            assertEquals(MediaCommand.PLAY_PAUSE, runtime.lastMediaCommand)
        }

    @Test
    fun `rejects an unknown media command`() =
        runTest {
            assertEquals("invalid_argument", rejection(bridge().controlMedia("moonwalk")).code)
        }

    @Test
    fun `parses a volume direction`() =
        runTest {
            val runtime = FakeRuntime()

            bridge(runtime).adjustVolume("down")

            assertEquals(VolumeDirection.DOWN, runtime.lastVolumeDirection)
        }

    private fun assertFalseContains(
        haystack: String,
        needle: String,
    ) {
        assertTrue("expected not to contain \"$needle\"", !haystack.contains(needle))
    }

    private companion object {
        val sampleElement =
            ResolvedElement(
                text = "Send",
                resourceId = "com.whatsapp:id/send_button",
                className = "android.widget.ImageButton",
                contentDescription = "Send message",
                centerX = 975,
                centerY = 1875,
                left = 900,
                top = 1800,
                right = 1050,
                bottom = 1950,
                clickable = true,
                editable = false,
                enabled = true,
                strategy = SelectorStrategy.RESOURCE_ID,
                structuralPath = "0.2",
                alternativeCount = 0,
            )

        val sampleTree =
            UiTree(
                root =
                    UiNode(
                        className = "android.widget.FrameLayout",
                        packageName = "com.whatsapp",
                        bounds = Bounds(0, 0, 1080, 2400),
                        children =
                            listOf(
                                UiNode(
                                    text = "Send",
                                    resourceId = "com.whatsapp:id/send_button",
                                    bounds = Bounds(900, 1800, 1050, 1950),
                                    clickable = true,
                                ),
                            ),
                    ),
                packageName = "com.whatsapp",
                activityName = "com.whatsapp.Conversation",
                screenWidthPx = 1080,
                screenHeightPx = 2400,
            )

        val sampleScreenshot =
            Screenshot(
                filePath = "/data/captures/1.png",
                widthPx = 1080,
                heightPx = 2400,
                capturedAtEpochMs = 1_700_000_000_000L,
                sizeBytes = 1_234_567L,
                packageName = "com.whatsapp",
            )
    }
}
