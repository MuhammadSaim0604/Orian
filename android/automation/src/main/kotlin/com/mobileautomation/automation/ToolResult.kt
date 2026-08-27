package com.mobileautomation.automation

/**
 * The result of a tool call: a value or a typed [AutomationError].
 *
 * Errors are returned rather than thrown because a failed tool call is an
 * ordinary event in this product, not an exception. The AI agent observes the
 * failure and replans; the workflow engine applies the node's error policy. Both
 * need the failure as data. Mirrors the `Result` type in
 * `@mobile-automation/shared-types`.
 */
sealed interface ToolResult<out T> {
    data class Success<out T>(val value: T) : ToolResult<T>

    data class Failure(val error: AutomationError) : ToolResult<Nothing>

    val isSuccess: Boolean get() = this is Success

    val valueOrNull: T? get() = (this as? Success)?.value

    val errorOrNull: AutomationError? get() = (this as? Failure)?.error

    /** Transforms a success value, leaving a failure untouched. */
    fun <R> map(transform: (T) -> R): ToolResult<R> =
        when (this) {
            is Success -> Success(transform(value))
            is Failure -> this
        }

    /** Chains another tool call that itself may fail. */
    fun <R> flatMap(transform: (T) -> ToolResult<R>): ToolResult<R> =
        when (this) {
            is Success -> transform(value)
            is Failure -> this
        }

    companion object {
        fun <T> success(value: T): ToolResult<T> = Success(value)

        fun failure(error: AutomationError): ToolResult<Nothing> = Failure(error)

        /**
         * Runs [block], converting a thrown exception into an
         * [AutomationError.Unexpected].
         *
         * The boundary where platform exceptions stop and typed errors begin. A
         * `SecurityException` from a revoked permission or an
         * `ActivityNotFoundException` from a missing app must not escape into the
         * agent loop as a raw throwable.
         */
        inline fun <T> catching(block: () -> T): ToolResult<T> =
            try {
                Success(block())
            } catch (error: Throwable) {
                Failure(
                    AutomationError.Unexpected(
                        error.message ?: error::class.java.simpleName,
                    ),
                )
            }
    }
}

/**
 * The value, or [fallback] when this is a failure.
 *
 * An extension rather than a member: `ToolResult` is covariant in `T`, so a member
 * taking a `T` parameter would need `@UnsafeVariance` and would then fail at
 * runtime with a `ClassCastException` on the failure branch. As an extension the
 * receiver's type argument is fixed, so this is sound.
 */
fun <T> ToolResult<T>.valueOrElse(fallback: T): T = valueOrNull ?: fallback
