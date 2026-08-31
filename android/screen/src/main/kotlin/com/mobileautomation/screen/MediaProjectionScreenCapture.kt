package com.mobileautomation.screen

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.os.Handler
import android.os.Looper
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import java.io.FileOutputStream

/**
 * Captures the screen with MediaProjection.
 *
 * Consent is per session and never persisted (`conventions/Permission_Model.md`):
 * the user grants a projection, and when it stops - because they revoked it, the
 * process died, or automation finished - a fresh grant is required. The app does
 * not try to work around that.
 *
 * The pipeline is `MediaProjection → VirtualDisplay → ImageReader → Bitmap → PNG`,
 * and every stage holds a native resource, so release ordering matters: an
 * un-released VirtualDisplay keeps the projection alive and the system shows the
 * screen-recording indicator indefinitely.
 *
 * Device-dependent, so it is covered by instrumentation tests rather than JVM
 * unit tests; [ScreenshotStore] and [CapturePolicy] hold the testable logic.
 */
class MediaProjectionScreenCapture(
    private val context: Context,
    private val store: ScreenshotStore,
    private val screenWidthPx: Int,
    private val screenHeightPx: Int,
    private val densityDpi: Int,
    private val currentPackageName: () -> String? = { null },
) : ScreenCapture {
    private var projection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private val handler = Handler(Looper.getMainLooper())

    @Volatile
    private var stoppedByUser: Boolean = false

    override val isReady: Boolean
        get() = projection != null && !stoppedByUser

    /**
     * Adopts a projection the user just consented to.
     *
     * The callback matters: the user can stop the recording from the system
     * notification at any time, and continuing to hold the pipeline afterwards
     * would silently produce black frames.
     */
    fun attachProjection(mediaProjection: MediaProjection) {
        releasePipeline()
        stoppedByUser = false
        projection = mediaProjection

        mediaProjection.registerCallback(
            object : MediaProjection.Callback() {
                override fun onStop() {
                    Log.i(TAG, "MediaProjection stopped")
                    stoppedByUser = true
                    releasePipeline()
                    projection = null
                }
            },
            handler,
        )
    }

    override suspend fun capture(): CaptureResult {
        val activeProjection = projection ?: return CaptureResult.ConsentRequired
        if (stoppedByUser) return CaptureResult.ConsentRequired

        return withContext(Dispatchers.IO) {
            runCatching { captureFrame(activeProjection) }
                .getOrElse { error ->
                    Log.e(TAG, "Capture failed", error)
                    CaptureResult.Failed(error.message ?: error::class.java.simpleName)
                }
        }
    }

    override fun release() {
        releasePipeline()
        projection?.stop()
        projection = null
    }

    private suspend fun captureFrame(activeProjection: MediaProjection): CaptureResult {
        val reader = ensureReader()
        val displayWasFresh = virtualDisplay == null

        ensureVirtualDisplay(activeProjection, reader)

        // A freshly created VirtualDisplay produces one or more blank frames while the mirror initialises,
        // and a genuinely secure window produces black frames forever. Those are indistinguishable from a
        // single sample, so the only honest way to tell them apart is to look again.
        //
        // This was a real defect: the first capture of a session reported `SecureWindow`, the agent was told
        // "this app blocks screenshots", and it relayed that to the user as fact about an app that blocks
        // nothing. Retrying costs a few hundred milliseconds on a path that is already slow, and only on the
        // frames that look black.
        val attempts = if (displayWasFresh) BLACK_FRAME_ATTEMPTS else BLACK_FRAME_ATTEMPTS_WARM

        var sawBlackFrame = false

        repeat(attempts) { attempt ->
            if (attempt > 0) delay(BLACK_FRAME_RETRY_DELAY_MS)

            val image =
                withTimeoutOrNull(FRAME_TIMEOUT_MS) { awaitImage(reader) }
                    ?: return CaptureResult.Failed("No frame arrived within ${FRAME_TIMEOUT_MS}ms")

            val outcome =
                try {
                    val bitmap = image.toBitmap()

                    if (bitmap.isEntirelyBlack()) {
                        bitmap.recycle()
                        sawBlackFrame = true
                        null
                    } else {
                        CaptureResult.Success(writeToStore(bitmap))
                    }
                } finally {
                    image.close()
                }

            if (outcome != null) return outcome
        }

        return if (sawBlackFrame) {
            // Still black after several attempts, so a secure window is the likeliest explanation - but it is
            // an inference, not something the platform told us, and the message says so. The agent used to
            // repeat it as certainty.
            CaptureResult.SecureWindow
        } else {
            CaptureResult.Failed("No usable frame was produced")
        }
    }

    private fun ensureReader(): ImageReader =
        imageReader ?: ImageReader
            .newInstance(screenWidthPx, screenHeightPx, PIXEL_FORMAT, MAX_BUFFERED_IMAGES)
            .also { imageReader = it }

    @SuppressLint("MissingPermission")
    private fun ensureVirtualDisplay(
        activeProjection: MediaProjection,
        reader: ImageReader,
    ) {
        if (virtualDisplay != null) return
        virtualDisplay =
            activeProjection.createVirtualDisplay(
                VIRTUAL_DISPLAY_NAME,
                screenWidthPx,
                screenHeightPx,
                densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                reader.surface,
                null,
                handler,
            )
    }

    private suspend fun awaitImage(reader: ImageReader): Image? =
        withContext(Dispatchers.IO) {
            // Drain whatever is already queued: the first frame after the display
            // is created is often blank while the mirror initialises.
            var latest: Image? = null
            repeat(MAX_DRAIN_ATTEMPTS) {
                val next = reader.acquireLatestImage()
                if (next != null) {
                    latest?.close()
                    latest = next
                } else if (latest != null) {
                    return@withContext latest
                } else {
                    Thread.sleep(FRAME_POLL_INTERVAL_MS)
                }
            }
            latest
        }

    private fun Image.toBitmap(): Bitmap {
        val plane = planes[0]
        val pixelStride = plane.pixelStride
        val rowStride = plane.rowStride
        // Rows are padded to a stride, so the bitmap is created wider and then
        // cropped; ignoring the padding produces a skewed image.
        val rowPadding = rowStride - (pixelStride * width)
        val paddedWidth = width + (rowPadding / pixelStride)

        val bitmap = Bitmap.createBitmap(paddedWidth, height, Bitmap.Config.ARGB_8888)
        bitmap.copyPixelsFromBuffer(plane.buffer)

        return if (paddedWidth == width) {
            bitmap
        } else {
            Bitmap.createBitmap(bitmap, 0, 0, width, height).also { bitmap.recycle() }
        }
    }

    /**
     * Samples a grid of pixels to detect a fully black frame.
     *
     * Sampling rather than scanning every pixel: a full 1080x2400 scan is 2.6M
     * reads on the capture path, and a secure window is uniformly black so a
     * sparse grid is conclusive enough.
     */
    private fun Bitmap.isEntirelyBlack(): Boolean {
        val stepX = (width / BLACK_SAMPLE_GRID).coerceAtLeast(1)
        val stepY = (height / BLACK_SAMPLE_GRID).coerceAtLeast(1)

        var x = 0
        while (x < width) {
            var y = 0
            while (y < height) {
                val pixel = getPixel(x, y)
                // Ignore alpha: the mirror surface is opaque.
                if ((pixel and 0x00FFFFFF) != 0) return false
                y += stepY
            }
            x += stepX
        }
        return true
    }

    private fun writeToStore(bitmap: Bitmap): Screenshot {
        val file: File = store.allocate()
        FileOutputStream(file).use { out ->
            bitmap.compress(Bitmap.CompressFormat.PNG, PNG_QUALITY, out)
        }

        val screenshot =
            Screenshot(
                filePath = file.absolutePath,
                widthPx = bitmap.width,
                heightPx = bitmap.height,
                capturedAtEpochMs = System.currentTimeMillis(),
                sizeBytes = file.length(),
                packageName = currentPackageName(),
            )

        bitmap.recycle()
        store.prune()
        return screenshot
    }

    private fun releasePipeline() {
        virtualDisplay?.release()
        virtualDisplay = null
        imageReader?.close()
        imageReader = null
    }

    private companion object {
        const val TAG = "MediaProjectionCapture"
        const val VIRTUAL_DISPLAY_NAME = "MobileAutomationCapture"

        /** PixelFormat.RGBA_8888; matches Bitmap.Config.ARGB_8888. */
        const val PIXEL_FORMAT = 1

        /** Two buffers: one being read while the next is produced. */
        const val MAX_BUFFERED_IMAGES = 2

        /** PNG is lossless, so the quality argument is ignored. */
        const val PNG_QUALITY = 100

        const val FRAME_TIMEOUT_MS = 3_000L
        const val FRAME_POLL_INTERVAL_MS = 16L
        const val MAX_DRAIN_ATTEMPTS = 30

        /**
         * How many black frames to see before concluding the window is secure.
         *
         * Applies to the first capture after the VirtualDisplay is created, which is when the mirror is
         * still initialising and a blank frame is expected rather than meaningful.
         */
        const val BLACK_FRAME_ATTEMPTS = 4

        /**
         * The same, for a display that has already produced frames.
         *
         * Lower because the initialisation excuse no longer applies - but not one, because a screen mid
         * transition can genuinely be black for a frame.
         */
        const val BLACK_FRAME_ATTEMPTS_WARM = 2

        /** Long enough for the mirror to produce a real frame; short enough not to stall a run. */
        const val BLACK_FRAME_RETRY_DELAY_MS = 120L

        /** Sample a 16x16 grid when checking for a black (secure) frame. */
        const val BLACK_SAMPLE_GRID = 16
    }
}
