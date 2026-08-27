package com.mobileautomation.gestures

/**
 * Records what was dispatched and returns scripted outcomes.
 *
 * Lets the engine's retry and settle behaviour be tested precisely: how many
 * attempts were made, with what path, and in what order.
 */
class RecordingGestureDispatcher(
    override var isAvailable: Boolean = true,
    /** Outcomes returned in order; the last one repeats once exhausted. */
    private val outcomes: List<GestureOutcome> = listOf(GestureOutcome.Completed),
) : GestureDispatcher {
    val dispatched = mutableListOf<GestureSpec>()

    val attemptCount: Int get() = dispatched.size

    override suspend fun dispatch(spec: GestureSpec): GestureOutcome {
        dispatched.add(spec)
        val index = (dispatched.size - 1).coerceAtMost(outcomes.lastIndex)
        return outcomes[index]
    }
}
