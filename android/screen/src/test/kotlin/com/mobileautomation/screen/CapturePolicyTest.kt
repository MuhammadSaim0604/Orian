package com.mobileautomation.screen

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CapturePolicyTest {
    @Test
    fun `screenshots cross the bridge by reference`() {
        assertTrue(CapturePolicy.PASS_BY_REFERENCE)
    }

    @Test
    fun `never persists a media projection token`() {
        assertFalse(CapturePolicy.PERSIST_PROJECTION_TOKEN)
    }

    @Test
    fun `leaves a small capture unscaled`() {
        assertEquals(1.0, CapturePolicy.scaleFactorFor(1080, 1280), 0.0001)
    }

    @Test
    fun `downscales a tall capture to the model limit`() {
        val factor = CapturePolicy.scaleFactorFor(1440, 3120)
        assertTrue(factor < 1.0)
        assertEquals(1280, Math.round(3120 * factor).toInt())
    }
}
