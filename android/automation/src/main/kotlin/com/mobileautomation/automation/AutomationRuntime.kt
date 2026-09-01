package com.mobileautomation.automation

import com.mobileautomation.accessibility.model.UiTree
import com.mobileautomation.accessibility.selector.Selector
import com.mobileautomation.accessibility.selector.SelectorStrategy
import com.mobileautomation.gestures.SwipeDirection
import com.mobileautomation.ocr.OcrMatch
import com.mobileautomation.ocr.OcrResult
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

/**
 * The single entry point to every device capability.
 *
 * Both engines call this identical surface - the AI agent and the workflow engine
 * (ADR 0008) - and the Phase 10 MCP server exposes the same set to external
 * clients. One runtime is what guarantees an agent-discovered action and a
 * workflow node do exactly the same thing on the device.
 *
 * Method names must match `DeviceTool.toolName` and the TypeScript
 * `@mobile-automation/tool-sdk` vocabulary exactly; a mismatch means a tool the
 * AI can name but not call.
 *
 * Every method returns [ToolResult] rather than throwing: a failed tool call is
 * an observation the agent reasons about, not an exception.
 */
interface AutomationRuntime {
    /** True when the accessibility service is connected and automation is possible. */
    val isReady: Boolean

    // --- screen reading ---------------------------------------------------

    /** Captures the current UI hierarchy. */
    suspend fun getUiTree(): ToolResult<UiTree>

    /** Foreground package and activity. */
    suspend fun getCurrentScreen(): ToolResult<CurrentScreen>

    /**
     * Resolves [selector] against the current screen.
     *
     * Reports which strategy matched, so the caller knows how durable the match
     * was and the recorder can store a stronger selector than the one it was given.
     */
    suspend fun findElement(selector: Selector): ToolResult<ResolvedElement>

    /**
     * Waits until [selector] resolves or [timeoutMs] elapses.
     *
     * Distinct from [findElement] because screens load asynchronously: the single
     * most common cause of a flaky automation is acting before the target exists.
     */
    suspend fun waitForElement(
        selector: Selector,
        timeoutMs: Long = DEFAULT_WAIT_TIMEOUT_MS,
    ): ToolResult<ResolvedElement>

    // --- acting on the screen ---------------------------------------------

    /** Taps the element [selector] resolves to. */
    suspend fun click(selector: Selector): ToolResult<Unit>

    /** Taps a raw coordinate. The last-resort path (ADR 0009). */
    suspend fun clickAt(
        x: Int,
        y: Int,
    ): ToolResult<Unit>

    suspend fun longPress(
        selector: Selector,
        durationMs: Long? = null,
    ): ToolResult<Unit>

    suspend fun swipe(
        direction: SwipeDirection,
        distanceFraction: Double = DEFAULT_SWIPE_FRACTION,
    ): ToolResult<Unit>

    suspend fun swipeBetween(
        fromX: Int,
        fromY: Int,
        toX: Int,
        toY: Int,
        durationMs: Long? = null,
    ): ToolResult<Unit>

    /**
     * Types [text] into the element [selector] resolves to.
     *
     * Uses the accessibility set-text action rather than synthesising key events:
     * key injection is unreliable across keyboards and loses non-ASCII characters.
     */
    suspend fun typeText(
        selector: Selector,
        text: String,
    ): ToolResult<Unit>

    suspend fun pressBack(): ToolResult<Unit>

    suspend fun pressHome(): ToolResult<Unit>

    // --- screen capture ---------------------------------------------------

    /** Captures a screenshot, returned by file path rather than inline bytes. */
    suspend fun takeScreenshot(): ToolResult<Screenshot>

    // --- apps -------------------------------------------------------------

    suspend fun openApp(packageName: String): ToolResult<Unit>

    /** Opens whichever installed app best matches [name], as a person would say it. */
    suspend fun openAppByName(name: String): ToolResult<InstalledApp>

    suspend fun listApps(includeSystem: Boolean = false): ToolResult<List<InstalledApp>>

    // --- device tools -----------------------------------------------------

    suspend fun getContacts(limit: Int = DEFAULT_CONTACT_LIMIT): ToolResult<List<Contact>>

    suspend fun findContacts(query: String): ToolResult<List<Contact>>

    suspend fun createAlarm(request: AlarmRequest): ToolResult<Unit>

    suspend fun readClipboard(): ToolResult<String?>

    suspend fun writeClipboard(text: String): ToolResult<Unit>

    suspend fun sendNotification(
        title: String,
        body: String,
    ): ToolResult<Unit>

    suspend fun launchIntent(request: IntentRequest): ToolResult<Unit>

    suspend fun getSystemSetting(key: String): ToolResult<String?>

    // --- media ------------------------------------------------------------

    /**
     * Controls whatever currently holds the media session.
     *
     * Playback control only: reading what is playing needs notification-listener
     * access, which the Phase 2 permission model does not authorise.
     */
    suspend fun controlMedia(command: MediaCommand): ToolResult<Unit>

    /** Nudges the music volume one step. */
    suspend fun adjustVolume(direction: VolumeDirection): ToolResult<Unit>

    // --- reading a screen the tree does not describe -----------------------

    /**
     * Recognises the text on screen, with a bounding box for each line.
     *
     * The second rung of the perception chain (ADR 0013). Slower than [getUiTree] and its results carry no
     * durable selectors, so it is a fallback rather than an alternative - some apps expose almost nothing
     * through accessibility, and on those screens this is the difference between working and being blind.
     */
    suspend fun runOcr(): ToolResult<OcrResult>

    /**
     * Finds [query] on screen and returns a tappable point.
     *
     * The convenience a caller actually wants: one string in, a point out. Separate from [runOcr] because a
     * caller looking for a button should not have to do the matching itself, and because matching in one place
     * means the fuzzy rules are identical for the agent, the workflow node, and the selector resolver.
     *
     * @param exact refuses a fuzzy match, for a caller that would rather fail than tap a guess.
     */
    suspend fun findTextOnScreen(
        query: String,
        exact: Boolean = false,
    ): ToolResult<OcrMatch>

    // --- messaging and calls ----------------------------------------------

    /**
     * Sends a text message.
     *
     * Sends it, rather than opening a compose screen: an agent that left an unsent draft would have failed
     * the task it reported success for.
     */
    suspend fun sendSms(
        phoneNumber: String,
        body: String,
    ): ToolResult<Unit>

    /** Recent messages, newest first, optionally filtered to one number. */
    suspend fun readSms(
        limit: Int = DEFAULT_SMS_LIMIT,
        fromNumber: String? = null,
    ): ToolResult<List<SmsMessage>>

    /**
     * Places a call.
     *
     * Dials immediately when the call permission is held. Without it, [placeCall] falls back to opening
     * the dialer pre-filled and says so in its result, rather than reporting the task impossible.
     */
    suspend fun placeCall(phoneNumber: String): ToolResult<CallOutcome>

    /** Ends the call in progress. Needs API 28+. */
    suspend fun endCall(): ToolResult<Unit>

    // --- device configuration ---------------------------------------------

    /**
     * Changes a system setting.
     *
     * Only the keys the writer allows; anything else is refused with the list, so a model can pick a real
     * key rather than retrying variations of a guess.
     */
    suspend fun setSystemSetting(
        key: String,
        value: String,
    ): ToolResult<Unit>

    /** Sets the ringer to normal, vibrate, or silent. */
    suspend fun setRingerMode(mode: RingerMode): ToolResult<Unit>

    companion object {
        /**
         * Long enough for a screen transition and a network-backed list to appear,
         * short enough that a genuinely missing element does not stall a workflow.
         */
        const val DEFAULT_WAIT_TIMEOUT_MS: Long = 5_000L

        const val DEFAULT_SWIPE_FRACTION: Double = 0.8

        const val DEFAULT_CONTACT_LIMIT: Int = 200

        /** Enough to find a code or the last thing someone said. */
        const val DEFAULT_SMS_LIMIT: Int = 10
    }
}

/**
 * What happened when a call was requested.
 *
 * A result rather than a boolean, because "the dialer is open with the number in it" and "the phone is
 * ringing them" are different enough that the agent must not confuse them - the first still needs the user
 * to press a button, and reporting it as a placed call would have the agent tell someone their call was
 * made when it was not.
 */
enum class CallOutcome {
    /** Dialling now. */
    CALLING,

    /** The dialer is open, pre-filled, waiting for the user. The call-permission fallback. */
    DIALER_OPENED,
    ;

    val wireName: String get() = name.lowercase()
}

/**
 * An element the resolver matched, with the evidence of how.
 *
 * [strategy] is part of the contract rather than a debugging aid: the recorder
 * stores it to judge how durable a generated workflow step is, and the UI warns
 * when automation has degraded to coordinates.
 */
data class ResolvedElement(
    val text: String?,
    val resourceId: String?,
    val className: String?,
    val contentDescription: String?,
    val centerX: Int,
    val centerY: Int,
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int,
    val clickable: Boolean,
    val editable: Boolean,
    val enabled: Boolean,
    val strategy: SelectorStrategy,
    val structuralPath: String,
    /** How many other nodes matched equally well; above zero means ambiguity. */
    val alternativeCount: Int = 0,
) {
    /** True when the match relied on coordinates or vision rather than semantics. */
    val isFragileMatch: Boolean
        get() = strategy == SelectorStrategy.COORDINATES || strategy == SelectorStrategy.VISION

    val isAmbiguous: Boolean get() = alternativeCount > 0
}
