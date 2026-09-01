package com.mobileautomation.ocr

import android.graphics.BitmapFactory
import android.util.Log
import com.mobileautomation.screen.CaptureResult
import com.mobileautomation.screen.ScreenCapture

/**
 * Reads the screen with OCR.
 *
 * Declared as an interface so everything above it is testable without a device. That is not a formality: the JVM
 * unit-test environment stubs `BitmapFactory`, so a test exercising the concrete reader would always take the
 * "the screenshot could not be read" path and the success cases — the ones that matter — would be untestable.
 */
interface ScreenTextSource {
    /** True when a capture session and a recogniser are both available. */
    val isAvailable: Boolean

    /** Captures the screen and recognises its text. */
    suspend fun read(): OcrOutcome

    /**
     * Finds [query] on screen and returns the best match.
     *
     * @param exact refuses a fuzzy match, for a caller that would rather fail than tap a guess.
     */
    suspend fun findText(
        query: String,
        exact: Boolean = false,
    ): OcrTextSearch
}

/**
 * Reads the screen with OCR.
 *
 * The seam between capture and recognition, and the only implementation anyone needs: it captures, decodes,
 * recognises, and scales into the coordinate space taps happen in.
 *
 * ## Why it holds a ScreenCapture rather than taking a bitmap
 *
 * OCR always operates on "the screen right now". A caller passing its own bitmap would be passing a screenshot
 * it captured earlier, and acting on a stale screen is the failure the whole perception ordering exists to
 * prevent. Taking the capture as a dependency means the freshness is not a caller's responsibility.
 *
 * ## Coordinate space
 *
 * The bitmap and the accessibility tree can disagree about size. `displayWidthPx`/`displayHeightPx` are the
 * space taps happen in, and every box is scaled into it — see `OcrScaling`. An unscaled box lands *slightly*
 * wrong, which reports success and presses the wrong thing.
 */
class ScreenTextReader(
    private val screenCapture: ScreenCapture,
    private val recogniser: TextRecogniser,
    /**
     * The coordinate space to report boxes in.
     *
     * A lambda rather than two integers, because the display can rotate mid-run and a value captured at
     * construction would be wrong for the rest of the session.
     */
    private val displayMetrics: () -> Pair<Int, Int>,
) : ScreenTextSource {
    /** True when a capture session and a recogniser are both available. */
    override val isAvailable: Boolean get() = screenCapture.isReady && recogniser.isAvailable

    /**
     * Captures the screen and recognises its text.
     *
     * Capture failures are reported verbatim rather than paraphrased: "you have not granted screen recording"
     * and "this app blocks capture" need different responses from the agent, and OCR has no business flattening
     * them into "OCR failed".
     */
    override suspend fun read(): OcrOutcome {
        if (!recogniser.isAvailable) {
            return OcrOutcome.RecognitionFailed("text recognition is not available")
        }

        val capture = screenCapture.capture()

        val screenshot =
            when (capture) {
                is CaptureResult.Success -> capture.screenshot

                is CaptureResult.ConsentRequired ->
                    return OcrOutcome.CaptureFailed(
                        "screen capture needs the user's permission for this session",
                    )

                is CaptureResult.SecureWindow ->
                    return OcrOutcome.CaptureFailed(
                        "this app blocks screen capture, so its text cannot be read",
                    )

                is CaptureResult.Failed -> return OcrOutcome.CaptureFailed(capture.reason)
            }

        val bitmap =
            runCatching { BitmapFactory.decodeFile(screenshot.filePath) }.getOrNull()
                ?: return OcrOutcome.CaptureFailed(
                    "the screenshot at ${screenshot.filePath} could not be read",
                )

        val (displayWidth, displayHeight) = displayMetrics()

        return try {
            recogniser.recognise(
                bitmap = bitmap,
                scaleToWidthPx = displayWidth.takeIf { it > 0 },
                scaleToHeightPx = displayHeight.takeIf { it > 0 },
            )
        } finally {
            // Recycled here rather than left to the collector. A full-screen bitmap is several megabytes and
            // OCR may run on every step of a run; waiting for GC is how a long run ends in an OOM.
            runCatching { bitmap.recycle() }.onFailure { Log.w(TAG, "Could not recycle the screenshot", it) }
        }
    }

    /**
     * Finds [query] on screen and returns the best match.
     *
     * The convenience the agent actually reaches for: one string in, a tappable point out. Distinct from [read]
     * because a caller looking for a button does not want the whole screen's text and should not have to do the
     * matching itself — and because matching in one place means the fuzzy rules are the same for the agent, the
     * workflow node, and the selector resolver.
     *
     * @param exact refuses a fuzzy match, for a caller that would rather fail than tap a guess.
     */
    override suspend fun findText(
        query: String,
        exact: Boolean,
    ): OcrTextSearch {
        val outcome = read()

        val result =
            outcome.resultOrNull
                ?: return OcrTextSearch.Failed(
                    when (outcome) {
                        is OcrOutcome.CaptureFailed -> outcome.reason
                        is OcrOutcome.RecognitionFailed -> outcome.reason
                        // Unreachable: resultOrNull is non-null exactly for Success.
                        is OcrOutcome.Success -> "unknown"
                    },
                )

        val match =
            OcrTextMatcher.findBest(result.blocks, query, exact)
                ?: return OcrTextSearch.NotFound(
                    blocksSearched = result.blockCount,
                    // The recognised text is deliberately *not* included in this message. It is the user's
                    // screen content, and an error string ends up in logs and traces.
                    reason =
                        if (result.isEmpty) {
                            "no text was recognised on this screen"
                        } else {
                            "\"$query\" was not among the ${result.blockCount} lines recognised"
                        },
                )

        return OcrTextSearch.Found(match = match, blocksSearched = result.blockCount)
    }

    private companion object {
        const val TAG = "ScreenTextReader"
    }
}

/**
 * Outcome of looking for a specific string.
 *
 * Three cases rather than a nullable match, because they need different responses: found is actionable, not
 * found means look elsewhere or scroll, and failed means OCR could not run and asking again will fail the same
 * way.
 */
sealed interface OcrTextSearch {
    data class Found(
        val match: OcrMatch,
        val blocksSearched: Int,
    ) : OcrTextSearch

    data class NotFound(
        val blocksSearched: Int,
        val reason: String,
    ) : OcrTextSearch

    data class Failed(val reason: String) : OcrTextSearch

    val matchOrNull: OcrMatch? get() = (this as? Found)?.match

    val isFound: Boolean get() = this is Found
}
