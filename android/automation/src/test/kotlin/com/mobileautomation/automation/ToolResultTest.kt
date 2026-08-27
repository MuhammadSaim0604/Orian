package com.mobileautomation.automation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AutomationErrorTest {
    @Test
    fun `every error code is unique so the bridge can map them`() {
        val codes =
            listOf(
                AutomationError.AccessibilityUnavailable,
                AutomationError.PermissionDenied("p", false),
                AutomationError.ElementNotFound(emptyList(), "d"),
                AutomationError.GestureFailed("d"),
                AutomationError.SecureScreen,
                AutomationError.CaptureConsentRequired,
                AutomationError.Timeout("op", 1L),
                AutomationError.InvalidArgument("d"),
                AutomationError.ToolFailed("t", "d"),
                AutomationError.Unexpected("d"),
            ).map { it.code }

        assertEquals(codes.size, codes.toSet().size)
    }

    @Test
    fun `element not found is retryable because the screen may still be loading`() {
        assertTrue(AutomationError.ElementNotFound(listOf("resourceId"), "missing").isRetryable)
    }

    @Test
    fun `a timeout is retryable`() {
        assertTrue(AutomationError.Timeout("waitForElement", 5_000L).isRetryable)
    }

    @Test
    fun `an invalid argument is never retryable`() {
        assertFalse(AutomationError.InvalidArgument("blank name").isRetryable)
    }

    @Test
    fun `a secure screen is neither retryable nor fixable by the user`() {
        // A banking app will never be capturable, so the agent must stop asking.
        assertFalse(AutomationError.SecureScreen.isRetryable)
        assertFalse(AutomationError.SecureScreen.needsUserAction)
    }

    @Test
    fun `missing consent asks the user rather than retrying blindly`() {
        assertTrue(AutomationError.CaptureConsentRequired.needsUserAction)
        assertFalse(AutomationError.CaptureConsentRequired.isRetryable)
    }

    @Test
    fun `a disabled accessibility service needs user action`() {
        assertTrue(AutomationError.AccessibilityUnavailable.needsUserAction)
        assertFalse(AutomationError.AccessibilityUnavailable.isRetryable)
    }

    @Test
    fun `permission denied names the permission and whether settings are needed`() {
        val error =
            AutomationError.PermissionDenied(
                permission = "android.permission.READ_CONTACTS",
                requiresSettingsScreen = false,
            )

        assertTrue(error.message.contains("android.permission.READ_CONTACTS"))
        assertTrue(error.needsUserAction)
    }

    @Test
    fun `element not found carries the strategies tried for diagnosis`() {
        val error =
            AutomationError.ElementNotFound(
                attemptedStrategies = listOf("resourceId", "text"),
                detail = "no node matched",
            )

        assertEquals(listOf("resourceId", "text"), error.attemptedStrategies)
    }

    @Test
    fun `a cancelled gesture is retryable but a rejected one is not`() {
        assertTrue(AutomationError.GestureFailed("cancelled", isRetryable = true).isRetryable)
        assertFalse(AutomationError.GestureFailed("malformed path", isRetryable = false).isRetryable)
    }
}

class ToolResultTest {
    @Test
    fun `success carries its value`() {
        val result = ToolResult.success(42)
        assertTrue(result.isSuccess)
        assertEquals(42, result.valueOrNull)
        assertNull(result.errorOrNull)
    }

    @Test
    fun `failure carries its error and no value`() {
        val result = ToolResult.failure(AutomationError.SecureScreen)
        assertFalse(result.isSuccess)
        assertNull(result.valueOrNull)
        assertEquals(AutomationError.SecureScreen, result.errorOrNull)
    }

    @Test
    fun `map transforms a success`() {
        assertEquals(10, ToolResult.success(5).map { it * 2 }.valueOrNull)
    }

    @Test
    fun `map leaves a failure untouched`() {
        val failure: ToolResult<Int> = ToolResult.failure(AutomationError.SecureScreen)

        val mapped = failure.map { it * 2 }

        assertEquals(AutomationError.SecureScreen, mapped.errorOrNull)
    }

    @Test
    fun `flatMap chains successful calls`() {
        val chained = ToolResult.success(5).flatMap { ToolResult.success(it + 1) }
        assertEquals(6, chained.valueOrNull)
    }

    @Test
    fun `flatMap short-circuits on the first failure`() {
        val chained =
            ToolResult
                .success(5)
                .flatMap<Int> { ToolResult.failure(AutomationError.InvalidArgument("bad")) }
                .flatMap { ToolResult.success(it + 100) }

        assertFalse(chained.isSuccess)
        assertEquals("invalid_argument", chained.errorOrNull?.code)
    }

    @Test
    fun `valueOrElse supplies a fallback for a failure`() {
        val failure: ToolResult<Int> = ToolResult.failure(AutomationError.SecureScreen)
        assertEquals(-1, failure.valueOrElse(-1))
        assertEquals(5, ToolResult.success(5).valueOrElse(-1))
    }

    @Test
    fun `catching converts a thrown exception into a typed error`() {
        val result = ToolResult.catching<Int> { throw IllegalStateException("boom") }

        assertFalse(result.isSuccess)
        assertEquals("unexpected", result.errorOrNull?.code)
        assertTrue(result.errorOrNull!!.message.contains("boom"))
    }

    @Test
    fun `catching names the exception type when there is no message`() {
        val result = ToolResult.catching<Int> { throw IllegalStateException() }
        assertTrue(result.errorOrNull!!.message.contains("IllegalStateException"))
    }

    @Test
    fun `catching returns the value when nothing throws`() {
        assertEquals(7, ToolResult.catching { 7 }.valueOrNull)
    }
}
