package com.mobileautomation.bridge

import com.mobileautomation.accessibility.model.UiTree
import com.mobileautomation.automation.AutomationRuntime
import com.mobileautomation.automation.CallOutcome
import com.mobileautomation.automation.ToolResult
import com.mobileautomation.tools.model.Contact
import com.mobileautomation.tools.model.InstalledApp
import com.mobileautomation.tools.model.SmsMessage

/**
 * The runtime, wrapped so every result is JSON and every failure is a [BridgeErrors.Rejection].
 *
 * This is the whole conversion layer, and it is deliberately separate from the
 * React Native module itself. The RN module needs `ReactApplicationContext` and
 * `Promise`, neither of which exists in a JVM unit test; this class needs only an
 * `AutomationRuntime`, so the argument parsing, result serialization, and error
 * mapping - where the real bugs live - are all testable off-device.
 *
 * The RN module becomes a thin adapter: call a method here, resolve or reject.
 */
class AutomationBridge(
    private val runtime: AutomationRuntime,
    private val canCaptureScreen: () -> Boolean = { false },
    private val canDrawOverlay: () -> Boolean = { false },
) {
    /** A call's outcome: JSON to resolve with, or a rejection to raise. */
    sealed interface Outcome {
        /** Resolve with this JSON string, or with undefined when null. */
        data class Success(val json: String?) : Outcome

        data class Failure(val rejection: BridgeErrors.Rejection) : Outcome
    }

    // --- status -----------------------------------------------------------

    /**
     * Synchronous, because the UI checks it during render to decide whether to
     * offer a run button; a promise would flash the wrong state first.
     */
    fun getStatusJson(): String =
        BridgeResults.statusToJson(
            isReady = runtime.isReady,
            canCaptureScreen = canCaptureScreen(),
            canDrawOverlay = canDrawOverlay(),
        )

    // --- screen reading ---------------------------------------------------

    suspend fun getUiTree(compact: Boolean): Outcome =
        runtime.getUiTree().toOutcome { tree: UiTree -> BridgeResults.uiTreeToJson(tree, compact) }

    suspend fun getCurrentScreen(): Outcome =
        runtime.getCurrentScreen().toOutcome { BridgeResults.currentScreenToJson(it) }

    suspend fun findElement(selectorJson: String): Outcome =
        guarding {
            runtime
                .findElement(BridgeArguments.parseSelector(selectorJson))
                .toOutcome { BridgeResults.resolvedElementToJson(it) }
        }

    suspend fun waitForElement(
        selectorJson: String,
        timeoutMs: Long,
    ): Outcome =
        guarding {
            runtime
                .waitForElement(BridgeArguments.parseSelector(selectorJson), timeoutMs)
                .toOutcome { BridgeResults.resolvedElementToJson(it) }
        }

    // --- acting on the screen ---------------------------------------------

    suspend fun click(selectorJson: String): Outcome =
        guarding { runtime.click(BridgeArguments.parseSelector(selectorJson)).toUnitOutcome() }

    suspend fun clickAt(
        x: Int,
        y: Int,
    ): Outcome = runtime.clickAt(x, y).toUnitOutcome()

    suspend fun longPress(
        selectorJson: String,
        durationMs: Long,
    ): Outcome =
        guarding {
            runtime
                .longPress(
                    BridgeArguments.parseSelector(selectorJson),
                    // Zero means "use the platform default", since the codegen spec
                    // cannot express an optional number.
                    durationMs.takeIf { it > 0 },
                ).toUnitOutcome()
        }

    suspend fun swipe(
        direction: String,
        distanceFraction: Double,
    ): Outcome =
        guarding {
            runtime
                .swipe(BridgeArguments.parseSwipeDirection(direction), distanceFraction)
                .toUnitOutcome()
        }

    suspend fun swipeBetween(
        fromX: Int,
        fromY: Int,
        toX: Int,
        toY: Int,
        durationMs: Long,
    ): Outcome = runtime.swipeBetween(fromX, fromY, toX, toY, durationMs.takeIf { it > 0 }).toUnitOutcome()

    suspend fun typeText(
        selectorJson: String,
        text: String,
    ): Outcome =
        guarding {
            runtime.typeText(BridgeArguments.parseSelector(selectorJson), text).toUnitOutcome()
        }

    suspend fun pressBack(): Outcome = runtime.pressBack().toUnitOutcome()

    suspend fun pressHome(): Outcome = runtime.pressHome().toUnitOutcome()

    // --- screen capture ---------------------------------------------------

    suspend fun takeScreenshot(): Outcome = runtime.takeScreenshot().toOutcome { BridgeResults.screenshotToJson(it) }

    // --- apps -------------------------------------------------------------

    suspend fun openApp(packageName: String): Outcome = runtime.openApp(packageName).toUnitOutcome()

    suspend fun openAppByName(name: String): Outcome =
        runtime.openAppByName(name).toOutcome { app: InstalledApp ->
            BridgeResults.installedAppToJson(app)
        }

    suspend fun listApps(includeSystem: Boolean): Outcome =
        runtime.listApps(includeSystem).toOutcome { apps: List<InstalledApp> ->
            BridgeResults.installedAppsToJson(apps)
        }

    // --- device tools -----------------------------------------------------

    suspend fun getContacts(limit: Int): Outcome =
        runtime.getContacts(limit).toOutcome { contacts: List<Contact> ->
            BridgeResults.contactsToJson(contacts)
        }

    suspend fun findContacts(query: String): Outcome =
        runtime.findContacts(query).toOutcome { contacts: List<Contact> ->
            BridgeResults.contactsToJson(contacts)
        }

    suspend fun createAlarm(requestJson: String): Outcome =
        guarding {
            runtime.createAlarm(BridgeArguments.parseAlarmRequest(requestJson)).toUnitOutcome()
        }

    /**
     * Reads the clipboard.
     *
     * The value is resolved as a plain string, not JSON: the spec declares
     * `Promise<string | null>` because clipboard text is not structured. A null
     * result resolves successfully with null, since from Android 10 the clipboard
     * is readable only while the app holds focus - empty is expected, not a failure.
     */
    suspend fun readClipboard(): Outcome =
        when (val result = runtime.readClipboard()) {
            is ToolResult.Success -> Outcome.Success(result.value)
            is ToolResult.Failure -> Outcome.Failure(BridgeErrors.toRejection(result.error))
        }

    suspend fun writeClipboard(text: String): Outcome = runtime.writeClipboard(text).toUnitOutcome()

    suspend fun sendNotification(
        title: String,
        body: String,
    ): Outcome = runtime.sendNotification(title, body).toUnitOutcome()

    suspend fun launchIntent(requestJson: String): Outcome =
        guarding {
            runtime.launchIntent(BridgeArguments.parseIntentRequest(requestJson)).toUnitOutcome()
        }

    suspend fun getSystemSetting(key: String): Outcome =
        when (val result = runtime.getSystemSetting(key)) {
            // Also a plain string rather than JSON; see readClipboard.
            is ToolResult.Success -> Outcome.Success(result.value)
            is ToolResult.Failure -> Outcome.Failure(BridgeErrors.toRejection(result.error))
        }

    // --- media ------------------------------------------------------------

    suspend fun controlMedia(command: String): Outcome =
        guarding { runtime.controlMedia(BridgeArguments.parseMediaCommand(command)).toUnitOutcome() }

    suspend fun adjustVolume(direction: String): Outcome =
        guarding {
            runtime.adjustVolume(BridgeArguments.parseVolumeDirection(direction)).toUnitOutcome()
        }

    // --- messaging and calls ----------------------------------------------

    suspend fun sendSms(
        phoneNumber: String,
        body: String,
    ): Outcome = runtime.sendSms(phoneNumber, body).toUnitOutcome()

    suspend fun readSms(
        limit: Int,
        fromNumber: String,
    ): Outcome =
        runtime
            .readSms(
                limit = limit,
                // Empty means "any number": the codegen spec cannot express an optional string, so the
                // absence has to be encoded as a value.
                fromNumber = fromNumber.takeIf { it.isNotBlank() },
            ).toOutcome { messages: List<SmsMessage> -> BridgeResults.smsMessagesToJson(messages) }

    suspend fun placeCall(phoneNumber: String): Outcome =
        runtime.placeCall(phoneNumber).toOutcome { outcome: CallOutcome ->
            BridgeResults.callOutcomeToJson(outcome)
        }

    suspend fun endCall(): Outcome = runtime.endCall().toUnitOutcome()

    // --- device configuration ---------------------------------------------

    suspend fun setSystemSetting(
        key: String,
        value: String,
    ): Outcome = runtime.setSystemSetting(key, value).toUnitOutcome()

    suspend fun setRingerMode(mode: String): Outcome =
        guarding { runtime.setRingerMode(BridgeArguments.parseRingerMode(mode)).toUnitOutcome() }

    // --- helpers ----------------------------------------------------------

    private inline fun <T> ToolResult<T>.toOutcome(serialize: (T) -> String): Outcome =
        when (this) {
            is ToolResult.Success -> Outcome.Success(serialize(value))
            is ToolResult.Failure -> Outcome.Failure(BridgeErrors.toRejection(error))
        }

    private fun ToolResult<Unit>.toUnitOutcome(): Outcome =
        when (this) {
            is ToolResult.Success -> Outcome.Success(null)
            is ToolResult.Failure -> Outcome.Failure(BridgeErrors.toRejection(error))
        }

    /**
     * Runs a call whose arguments are parsed from JSON.
     *
     * Argument parsing throws, unlike the runtime which returns failures, so this
     * converts a malformed argument into the same rejection shape - the TypeScript
     * side should not care which layer objected.
     */
    private inline fun guarding(block: () -> Outcome): Outcome =
        try {
            block()
        } catch (error: Throwable) {
            Outcome.Failure(BridgeErrors.toRejection(error))
        }
}
