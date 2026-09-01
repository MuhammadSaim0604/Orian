package com.mobileautomation.ocr

import android.graphics.Bitmap
import android.util.Log
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

/**
 * [TextRecogniser] backed by ML Kit's bundled on-device model.
 *
 * Bundled rather than the Play-services variant (ADR 0017): a downloaded model is absent exactly when it is
 * first needed — the moment the accessibility tree came back empty — and requires both Play services and a
 * network, which contradicts the reason on-device recognition was chosen in the first place.
 *
 * ## Lines, not blocks or elements
 *
 * ML Kit returns a three-level hierarchy: blocks (paragraphs), lines, and elements (words). This flattens to
 * **lines**, because a line is the unit a person points at. A block can be a whole paragraph, so its centre
 * lands in the middle of a body of text rather than on anything tappable; an element is a single word, so
 * "Continue to payment" becomes three separate targets and a search for the phrase matches none of them.
 */
class MlKitTextRecogniser(
    /**
     * Created lazily and held for the process.
     *
     * ML Kit's recogniser is expensive to construct — it loads the model — and creating one per call adds
     * hundreds of milliseconds to every OCR on a path that is already the slow fallback.
     */
    private val recogniserFactory: () -> TextRecognizer = {
        TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    },
) : TextRecogniser {
    private var recogniser: TextRecognizer? = null

    override val isAvailable: Boolean = true

    override suspend fun recognise(
        bitmap: Bitmap,
        scaleToWidthPx: Int?,
        scaleToHeightPx: Int?,
    ): OcrOutcome {
        if (bitmap.isRecycled) {
            return OcrOutcome.RecognitionFailed("the screenshot was already recycled")
        }

        val startedAt = System.currentTimeMillis()

        return runCatching {
            val client = recogniser ?: recogniserFactory().also { recogniser = it }

            // Rotation zero: the bitmap came from a screen capture, which is already upright. Passing the
            // display rotation here would rotate an image that needs no rotating.
            val image = InputImage.fromBitmap(bitmap, 0)

            val text = awaitRecognition(client, image)

            val lines =
                text.textBlocks
                    .asSequence()
                    .flatMap { block -> block.lines.asSequence() }
                    .mapNotNull { line ->
                        val box = line.boundingBox ?: return@mapNotNull null
                        if (line.text.isBlank()) return@mapNotNull null

                        OcrTextBlock(
                            text = line.text,
                            bounds =
                                OcrBounds(
                                    left = box.left,
                                    top = box.top,
                                    right = box.right,
                                    bottom = box.bottom,
                                ),
                            // ML Kit's line confidence is only populated by some recognisers. Left null rather
                            // than defaulted, so a caller is never told a score it was not given.
                            confidence = line.confidence?.toDouble()?.coerceIn(0.0, 1.0),
                            language = line.recognizedLanguage.takeIf { it.isNotBlank() },
                        )
                    }.filterNot { it.bounds.isEmpty }
                    .toList()

            val scaled =
                OcrScaling.scaleBlocks(
                    blocks = lines,
                    sourceWidthPx = bitmap.width,
                    sourceHeightPx = bitmap.height,
                    targetWidthPx = scaleToWidthPx ?: bitmap.width,
                    targetHeightPx = scaleToHeightPx ?: bitmap.height,
                )

            OcrOutcome.Success(
                OcrResult(
                    blocks = scaled,
                    screenWidthPx = scaleToWidthPx ?: bitmap.width,
                    screenHeightPx = scaleToHeightPx ?: bitmap.height,
                    durationMs = System.currentTimeMillis() - startedAt,
                ),
            )
        }.getOrElse { error ->
            Log.e(TAG, "Text recognition failed", error)
            OcrOutcome.RecognitionFailed(error.message ?: "text recognition failed")
        }
    }

    /**
     * Bridges ML Kit's `Task` to a coroutine.
     *
     * `suspendCoroutine` rather than `suspendCancellableCoroutine`: an ML Kit `Task` cannot be cancelled, so
     * offering cancellation would be a lie — the work continues and the continuation is simply abandoned.
     * Recognition takes a few hundred milliseconds, which is short enough that this is not worth pretending
     * about.
     */
    private suspend fun awaitRecognition(
        client: TextRecognizer,
        image: InputImage,
    ): com.google.mlkit.vision.text.Text =
        suspendCoroutine { continuation ->
            client
                .process(image)
                .addOnSuccessListener { result -> continuation.resume(result) }
                .addOnFailureListener { error -> continuation.resumeWith(Result.failure(error)) }
        }

    override fun close() {
        runCatching { recogniser?.close() }
        recogniser = null
    }

    private companion object {
        const val TAG = "MlKitTextRecogniser"
    }
}

/**
 * Stands in when OCR is not available in this build.
 *
 * Exists so the runtime always has a recogniser and the "OCR unavailable" path is a real, tested case rather
 * than a null check scattered through callers — the same reason `UnavailableVisionMatcher` exists.
 */
object UnavailableTextRecogniser : TextRecogniser {
    override val isAvailable: Boolean = false

    override suspend fun recognise(
        bitmap: Bitmap,
        scaleToWidthPx: Int?,
        scaleToHeightPx: Int?,
    ): OcrOutcome = OcrOutcome.RecognitionFailed("text recognition is not available in this build")

    override fun close() = Unit
}
