package com.mobileautomation.bridge

import com.mobileautomation.accessibility.model.Bounds
import com.mobileautomation.accessibility.model.UiTree
import com.mobileautomation.accessibility.serialization.UiTreeSerializer
import com.mobileautomation.automation.CallOutcome
import com.mobileautomation.automation.ResolvedElement
import com.mobileautomation.ocr.OcrBounds
import com.mobileautomation.ocr.OcrMatch
import com.mobileautomation.ocr.OcrResult
import com.mobileautomation.ocr.OcrTextBlock
import com.mobileautomation.screen.Screenshot
import com.mobileautomation.tools.model.Contact
import com.mobileautomation.tools.model.CurrentScreen
import com.mobileautomation.tools.model.InstalledApp
import com.mobileautomation.tools.model.SmsMessage

/**
 * Serializes runtime results into the JSON the TypeScript wrapper parses.
 *
 * The counterpart to [BridgeArguments]. Field names must match the types in
 * `packages/native-automation/src/types.ts` exactly - the wrapper casts rather
 * than validating, because the producer is this file and a mismatch is a bug to
 * fix here, not a runtime condition to handle there.
 *
 * The UI tree is not re-serialized: `UiTreeSerializer` already produces the
 * versioned contract shared with TypeScript, so this delegates to it rather than
 * inventing a second format that could drift.
 */
object BridgeResults {
    fun uiTreeToJson(
        tree: UiTree,
        compact: Boolean,
    ): String = UiTreeSerializer.toJson(tree, compact)

    fun resolvedElementToJson(element: ResolvedElement): String =
        buildJson {
            nullableString("text", element.text)
            nullableString("resourceId", element.resourceId)
            nullableString("className", element.className)
            nullableString("contentDescription", element.contentDescription)
            number("centerX", element.centerX)
            number("centerY", element.centerY)
            raw(
                "bounds",
                boundsToJson(
                    Bounds(element.left, element.top, element.right, element.bottom),
                ),
            )
            boolean("clickable", element.clickable)
            boolean("editable", element.editable)
            boolean("enabled", element.enabled)
            // The wire name of the strategy, so TS can compare against
            // SELECTOR_STRATEGIES rather than a Kotlin enum name.
            string("strategy", element.strategy.wireName)
            string("structuralPath", element.structuralPath)
            number("alternativeCount", element.alternativeCount)
        }

    fun screenshotToJson(screenshot: Screenshot): String =
        buildJson {
            // A path, never bytes: copying a multi-megabyte screen across the
            // bridge would block the JS thread on every capture.
            string("filePath", screenshot.filePath)
            number("widthPx", screenshot.widthPx)
            number("heightPx", screenshot.heightPx)
            number("capturedAtEpochMs", screenshot.capturedAtEpochMs)
            number("sizeBytes", screenshot.sizeBytes)
            nullableString("packageName", screenshot.packageName)
        }

    fun currentScreenToJson(screen: CurrentScreen): String =
        buildJson {
            nullableString("packageName", screen.packageName)
            nullableString("activityName", screen.activityName)
        }

    fun installedAppToJson(app: InstalledApp): String =
        buildJson {
            string("packageName", app.packageName)
            string("label", app.label)
            boolean("isSystemApp", app.isSystemApp)
            nullableString("versionName", app.versionName)
        }

    fun installedAppsToJson(apps: List<InstalledApp>): String =
        apps.joinToString(prefix = "[", postfix = "]") { installedAppToJson(it) }

    fun contactToJson(contact: Contact): String =
        buildJson {
            string("id", contact.id)
            string("displayName", contact.displayName)
            raw(
                "phoneNumbers",
                contact.phoneNumbers.joinToString(prefix = "[", postfix = "]") { quote(it) },
            )
        }

    fun contactsToJson(contacts: List<Contact>): String =
        contacts.joinToString(prefix = "[", postfix = "]") { contactToJson(it) }

    /**
     * One recognised line of text.
     *
     * `centerX`/`centerY` are included rather than left for the caller to compute from the bounds. It is trivial
     * arithmetic, but it is arithmetic that must agree with what the Kotlin side would tap — and two
     * implementations of a centre point is exactly how a tap ends up one row off.
     */
    fun ocrBlockToJson(block: OcrTextBlock): String =
        buildJson {
            string("text", block.text)
            raw("bounds", ocrBoundsToJson(block.bounds))
            number("centerX", block.centerX)
            number("centerY", block.centerY)
            // Omitted rather than defaulted when the recogniser reports none, so the caller can tell "not
            // measured" from "measured as low".
            block.confidence?.let { number("confidence", it) }
            block.language?.let { string("language", it) }
        }

    fun ocrBoundsToJson(bounds: OcrBounds): String =
        buildJson {
            number("left", bounds.left)
            number("top", bounds.top)
            number("right", bounds.right)
            number("bottom", bounds.bottom)
        }

    fun ocrResultToJson(result: OcrResult): String =
        buildJson {
            raw("blocks", result.blocks.joinToString(prefix = "[", postfix = "]") { ocrBlockToJson(it) })
            number("blockCount", result.blockCount)
            number("screenWidthPx", result.screenWidthPx)
            number("screenHeightPx", result.screenHeightPx)
            number("durationMs", result.durationMs)
        }

    /**
     * A matched piece of text.
     *
     * `matchKind` and `similarity` cross deliberately. The agent has to be able to tell an exact match from one
     * that tolerated a misread, because acting on a fuzzy match without checking the text is how it taps "Share"
     * when it meant "Save".
     */
    fun ocrMatchToJson(match: OcrMatch): String =
        buildJson {
            string("text", match.block.text)
            raw("bounds", ocrBoundsToJson(match.block.bounds))
            number("centerX", match.centerX)
            number("centerY", match.centerY)
            string("matchKind", match.kind.wireName)
            number("similarity", match.similarity)
            boolean("isStrong", match.isStrong)
            match.block.confidence?.let { number("confidence", it) }
        }

    fun smsMessageToJson(message: SmsMessage): String =
        buildJson {
            string("address", message.address)
            string("body", message.body)
            number("receivedAtEpochMs", message.receivedAtEpochMs)
            boolean("isOutgoing", message.isOutgoing)
        }

    fun smsMessagesToJson(messages: List<SmsMessage>): String =
        messages.joinToString(prefix = "[", postfix = "]") { smsMessageToJson(it) }

    /**
     * A call's outcome.
     *
     * An object rather than a bare string, so a field can be added later without changing the shape TS
     * parses - and `outcome` is named rather than positional because "calling" and "dialer_opened" mean
     * genuinely different things to the agent.
     */
    fun callOutcomeToJson(outcome: CallOutcome): String =
        buildJson {
            string("outcome", outcome.wireName)
        }

    fun statusToJson(
        isReady: Boolean,
        canCaptureScreen: Boolean,
        canDrawOverlay: Boolean,
    ): String =
        buildJson {
            boolean("isReady", isReady)
            boolean("canCaptureScreen", canCaptureScreen)
            boolean("canDrawOverlay", canDrawOverlay)
        }

    fun boundsToJson(bounds: Bounds): String =
        buildJson {
            number("left", bounds.left)
            number("top", bounds.top)
            number("right", bounds.right)
            number("bottom", bounds.bottom)
        }

    // --- a tiny writer ----------------------------------------------------

    private class JsonObjectBuilder {
        private val parts = mutableListOf<String>()

        fun string(
            name: String,
            value: String,
        ) {
            parts.add("${quote(name)}:${quote(value)}")
        }

        fun nullableString(
            name: String,
            value: String?,
        ) {
            parts.add("${quote(name)}:${if (value == null) "null" else quote(value)}")
        }

        fun number(
            name: String,
            value: Int,
        ) {
            parts.add("${quote(name)}:$value")
        }

        fun number(
            name: String,
            value: Long,
        ) {
            parts.add("${quote(name)}:$value")
        }

        /**
         * A fractional number, for confidences and similarities.
         *
         * Rendered with `toString()` rather than formatted, because a locale-aware format would emit `0,8` on a
         * German device and produce JSON the TS side cannot parse — a bug that only appears for some users.
         */
        fun number(
            name: String,
            value: Double,
        ) {
            // NaN and the infinities are not valid JSON numbers, and a recogniser handing one back should not
            // corrupt the whole payload.
            val safe = if (value.isFinite()) value else 0.0
            parts.add("${quote(name)}:$safe")
        }

        fun boolean(
            name: String,
            value: Boolean,
        ) {
            parts.add("${quote(name)}:$value")
        }

        /** Inserts already-serialized JSON, for nested objects and arrays. */
        fun raw(
            name: String,
            json: String,
        ) {
            parts.add("${quote(name)}:$json")
        }

        fun build(): String = parts.joinToString(separator = ",", prefix = "{", postfix = "}")
    }

    private fun buildJson(block: JsonObjectBuilder.() -> Unit): String = JsonObjectBuilder().apply(block).build()

    private fun quote(value: String): String {
        val escaped = StringBuilder(value.length + 2)
        escaped.append('"')
        for (char in value) {
            when (char) {
                '"' -> escaped.append("\\\"")
                '\\' -> escaped.append("\\\\")
                '\n' -> escaped.append("\\n")
                '\r' -> escaped.append("\\r")
                '\t' -> escaped.append("\\t")
                '\b' -> escaped.append("\\b")
                '\u000C' -> escaped.append("\\f")
                else ->
                    if (char < ' ') {
                        escaped.append("\\u").append("%04x".format(char.code))
                    } else {
                        escaped.append(char)
                    }
            }
        }
        escaped.append('"')
        return escaped.toString()
    }
}
