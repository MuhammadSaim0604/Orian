package com.mobileautomation.bridge

import com.mobileautomation.accessibility.model.Bounds
import com.mobileautomation.accessibility.selector.Selector
import com.mobileautomation.gestures.SwipeDirection
import com.mobileautomation.tools.IntentRequest
import com.mobileautomation.tools.MediaCommand
import com.mobileautomation.tools.VolumeDirection
import com.mobileautomation.tools.model.AlarmRequest

/**
 * Parses the JSON arguments the TypeScript wrapper sends.
 *
 * React Native's codegen understands only primitives, arrays of primitives, and
 * flat object types - no unions, no optional-rich structures. Rather than flatten
 * `Selector`'s ten fields into ten bridge parameters, structured arguments cross
 * as JSON and are parsed here.
 *
 * Everything is validated at this boundary. The JSON originates in TypeScript, so
 * it is well-formed in practice, but treating it as trusted would mean a bug in
 * the wrapper - or a third-party node passing something odd - surfacing as a
 * confusing failure deep inside the runtime rather than a clear rejection here
 * (`conventions/Coding_Conventions.md`: validate untrusted input at the boundary).
 *
 * Hand-rolled rather than using a serialization library: `org.json` is stubbed in
 * Android JVM unit tests, and adding kotlinx-serialization for one wire format
 * would be disproportionate. The parser is small and fully covered by tests.
 */
object BridgeArguments {
    /** Thrown when JSON cannot be turned into the requested type. */
    class MalformedArgument(
        message: String,
    ) : IllegalArgumentException(message)

    fun parseSelector(json: String): Selector {
        val fields = JsonReader.readObject(json) ?: throw MalformedArgument("selector is not an object: $json")

        val selector =
            Selector(
                resourceId = fields.string("resourceId"),
                contentDescription = fields.string("contentDescription"),
                text = fields.string("text"),
                className = fields.string("className"),
                structuralPath = fields.string("structuralPath"),
                bounds = fields.nested("bounds")?.let { parseBoundsFields(it) },
                coordinates = fields.nested("coordinates")?.let { parsePointFields(it) },
                packageName = fields.string("packageName"),
                activityName = fields.string("activityName"),
                requireActionable = fields.boolean("requireActionable") ?: false,
                exactText = fields.boolean("exactText") ?: false,
            )

        // An empty selector would resolve to nothing, which is a caller mistake
        // worth naming rather than an element-not-found several layers down.
        if (selector.isEmpty) {
            throw MalformedArgument(
                "selector carries no locating information; supply at least one of " +
                    "resourceId, text, contentDescription, structuralPath, bounds, or coordinates",
            )
        }

        return selector
    }

    fun parseAlarmRequest(json: String): AlarmRequest {
        val fields = JsonReader.readObject(json) ?: throw MalformedArgument("alarm request is not an object: $json")

        val hour = fields.int("hour") ?: throw MalformedArgument("alarm request needs an hour")
        val minute = fields.int("minute") ?: throw MalformedArgument("alarm request needs a minute")

        // AlarmRequest validates ranges itself; translate its complaint into the
        // bridge's error type so the TS side sees one consistent failure shape.
        return try {
            AlarmRequest(
                hour = hour,
                minute = minute,
                label = fields.string("label"),
                repeatDays = fields.intArray("repeatDays")?.toSet() ?: emptySet(),
                skipUi = fields.boolean("skipUi") ?: true,
            )
        } catch (error: IllegalArgumentException) {
            throw MalformedArgument(error.message ?: "invalid alarm request")
        }
    }

    fun parseIntentRequest(json: String): IntentRequest {
        val fields = JsonReader.readObject(json) ?: throw MalformedArgument("intent request is not an object: $json")

        val action = fields.string("action") ?: throw MalformedArgument("intent request needs an action")

        return try {
            IntentRequest(
                action = action,
                dataUri = fields.string("dataUri"),
                packageName = fields.string("packageName"),
                extras = fields.stringMap("extras") ?: emptyMap(),
                requireChooser = fields.boolean("requireChooser") ?: false,
            )
        } catch (error: IllegalArgumentException) {
            throw MalformedArgument(error.message ?: "invalid intent request")
        }
    }

    /**
     * Parses a swipe direction.
     *
     * The wire value is the direction *content* moves; `GestureEngine.scroll`
     * performs the finger inversion, so no translation happens here.
     */
    fun parseSwipeDirection(value: String): SwipeDirection =
        SwipeDirection.entries.firstOrNull { it.name.equals(value, ignoreCase = true) }
            ?: throw MalformedArgument(
                "unknown swipe direction \"$value\"; expected one of " +
                    SwipeDirection.entries.joinToString { it.name.lowercase() },
            )

    fun parseMediaCommand(value: String): MediaCommand =
        MediaCommand.fromName(value)
            ?: throw MalformedArgument(
                "unknown media command \"$value\"; expected one of ${MediaCommand.names.joinToString()}",
            )

    fun parseVolumeDirection(value: String): VolumeDirection =
        VolumeDirection.fromName(value)
            ?: throw MalformedArgument("unknown volume direction \"$value\"; expected up or down")

    private fun parseBoundsFields(fields: JsonReader.Fields): Bounds =
        Bounds(
            left = fields.int("left") ?: throw MalformedArgument("bounds needs left"),
            top = fields.int("top") ?: throw MalformedArgument("bounds needs top"),
            right = fields.int("right") ?: throw MalformedArgument("bounds needs right"),
            bottom = fields.int("bottom") ?: throw MalformedArgument("bounds needs bottom"),
        )

    private fun parsePointFields(fields: JsonReader.Fields): com.mobileautomation.accessibility.selector.Point =
        com.mobileautomation.accessibility.selector.Point(
            x = fields.int("x") ?: throw MalformedArgument("coordinates need x"),
            y = fields.int("y") ?: throw MalformedArgument("coordinates need y"),
        )
}
