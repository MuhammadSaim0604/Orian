package com.mobileautomation.accessibility.service

import com.mobileautomation.accessibility.model.UiTree

/**
 * Reads the current screen.
 *
 * An interface rather than a concrete service so that the gesture engine, the
 * tool layer, and the automation runtime depend on a capability instead of on
 * `AccessibilityService`. That keeps those layers unit-testable with a fake
 * reader, and it is the only way to test them at all off-device.
 */
interface ScreenReader {
    /** True when the accessibility service is connected and able to read. */
    val isAvailable: Boolean

    /**
     * Captures the current hierarchy, or null when the service is not connected
     * or the window has no readable root (which happens transiently during
     * activity transitions and on secure screens).
     */
    fun captureUiTree(): UiTree?

    /** Package of the foreground app, or null when unknown. */
    fun currentPackageName(): String?

    /** Activity of the foreground window, or null when unknown. */
    fun currentActivityName(): String?
}
