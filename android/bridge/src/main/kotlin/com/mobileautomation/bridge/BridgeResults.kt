package com.mobileautomation.bridge

import com.mobileautomation.accessibility.model.Bounds
import com.mobileautomation.accessibility.model.UiTree
import com.mobileautomation.accessibility.serialization.UiTreeSerializer
import com.mobileautomation.automation.ResolvedElement
import com.mobileautomation.screen.Screenshot
import com.mobileautomation.tools.model.Contact
import com.mobileautomation.tools.model.CurrentScreen
import com.mobileautomation.tools.model.InstalledApp

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
