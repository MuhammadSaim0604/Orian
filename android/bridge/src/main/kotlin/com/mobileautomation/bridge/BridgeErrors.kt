package com.mobileautomation.bridge

import com.mobileautomation.automation.AutomationError
import com.mobileautomation.automation.ToolResult

/**
 * Turns a failed [ToolResult] into the shape a React Native promise rejection
 * carries.
 *
 * The Kotlin layer returns errors as data; a JS promise can only reject with an
 * error. This is where the two models meet, and the mapping has to preserve the
 * two flags callers branch on - `isRetryable` and `needsUserAction` - because
 * losing them would force the TypeScript side to re-derive retry policy from a
 * message string.
 *
 * `code` is the stable wire value listed in
 * `packages/native-automation/src/errors.ts`. Adding an error variant means adding
 * it there too; a parity test on the TS side pins the list.
 */
object BridgeErrors {
    /** How a rejection is delivered: a code, a message, and structured detail. */
    data class Rejection(
        val code: String,
        val message: String,
        /**
         * Extra context for the caller, e.g. which selector strategies were tried.
         * Serialized as JSON so it survives the bridge as one field.
         */
        val detailJson: String,
    )

    fun toRejection(error: AutomationError): Rejection =
        Rejection(
            code = error.code,
            message = error.message,
            detailJson = detailJson(error),
        )

    /**
     * Wraps an unexpected throwable.
     *
     * Used at the module's outermost boundary so a programming error surfaces as a
     * typed `unexpected` rejection rather than crashing the JS thread with a raw
     * Java exception the TypeScript side cannot classify.
     */
    fun toRejection(throwable: Throwable): Rejection =
        when (throwable) {
            is BridgeArguments.MalformedArgument ->
                Rejection(
                    code = "invalid_argument",
                    message = throwable.message ?: "invalid argument",
                    detailJson = "{}",
                )

            else ->
                Rejection(
                    code = "unexpected",
                    message = throwable.message ?: throwable::class.java.simpleName,
                    detailJson = """{"exception":${quote(throwable::class.java.simpleName)}}""",
                )
        }

    /**
     * Detail worth sending across for each error kind.
     *
     * Only fields the caller can act on. A failure that just says "element not
     * found" cannot be diagnosed; one that says which strategies were tried can.
     */
    private fun detailJson(error: AutomationError): String =
        when (error) {
            is AutomationError.ElementNotFound ->
                buildString {
                    append("""{"attemptedStrategies":[""")
                    append(error.attemptedStrategies.joinToString(",") { quote(it) })
                    append("""],"retryable":true}""")
                }

            is AutomationError.PermissionDenied ->
                """{"permission":${quote(error.permission)},""" +
                    """"requiresSettingsScreen":${error.requiresSettingsScreen}}"""

            is AutomationError.Timeout ->
                """{"operation":${quote(error.operation)},"timeoutMs":${error.timeoutMs}}"""

            is AutomationError.ToolFailed -> """{"tool":${quote(error.tool)}}"""

            is AutomationError.GestureFailed -> """{"retryable":${error.isRetryable}}"""

            else -> "{}"
        }

    private fun quote(value: String): String = "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""
}
