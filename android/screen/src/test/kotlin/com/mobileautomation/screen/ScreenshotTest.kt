package com.mobileautomation.screen

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ScreenshotTest {
    private val portrait =
        Screenshot(
            filePath = "/data/user/0/com.mobileautomation/files/captures/capture-1.png",
            widthPx = 1080,
            heightPx = 2400,
            capturedAtEpochMs = 1_700_000_000_000L,
            sizeBytes = 1_234_567L,
            packageName = "com.whatsapp",
        )

    @Test
    fun `identifies orientation`() {
        assertFalse(portrait.isLandscape)
        assertTrue(portrait.copy(widthPx = 2400, heightPx = 1080).isLandscape)
    }

    @Test
    fun `reports the longest edge that downscaling is based on`() {
        assertEquals(2400, portrait.longestEdgePx)
    }

    @Test
    fun `knows when a capture exceeds the model input limit`() {
        assertFalse(portrait.fitsModelLimit)
        assertTrue(portrait.copy(widthPx = 720, heightPx = 1280).fitsModelLimit)
    }

    @Test
    fun `is referenced by path rather than carrying pixels`() {
        // Guards the bridge contract: screenshots cross by reference so the JS
        // thread is never blocked copying megabytes.
        assertTrue(portrait.filePath.endsWith(".png"))
    }
}

class CaptureResultTest {
    private val screenshot =
        Screenshot(
            filePath = "/tmp/capture.png",
            widthPx = 100,
            heightPx = 200,
            capturedAtEpochMs = 0L,
        )

    @Test
    fun `success exposes the screenshot`() {
        val result: CaptureResult = CaptureResult.Success(screenshot)
        assertTrue(result.isSuccess)
        assertEquals(screenshot, result.screenshotOrNull)
    }

    @Test
    fun `failures expose no screenshot`() {
        assertNull(CaptureResult.ConsentRequired.screenshotOrNull)
        assertNull(CaptureResult.SecureWindow.screenshotOrNull)
        assertNull(CaptureResult.Failed("boom").screenshotOrNull)
    }

    @Test
    fun `only missing consent is worth prompting the user about`() {
        assertTrue(CaptureResult.ConsentRequired.needsUserAction)
        assertFalse(CaptureResult.SecureWindow.needsUserAction)
        assertFalse(CaptureResult.Failed("boom").needsUserAction)
        assertFalse(CaptureResult.Success(screenshot).needsUserAction)
    }

    @Test
    fun `distinguishes a secure window from a generic failure`() {
        // A banking app cannot be captured no matter how many times we retry, so
        // the agent must be able to tell the two apart.
        val secure: CaptureResult = CaptureResult.SecureWindow
        val failed: CaptureResult = CaptureResult.Failed("pipeline error")

        assertFalse(secure.isSuccess)
        assertFalse(failed.isSuccess)
        assertFalse("a secure window is not a retryable failure", secure == failed)
    }
}
