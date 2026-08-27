package com.mobileautomation.accessibility.service

/**
 * Global actions the accessibility service can perform.
 *
 * Wrapped in an enum rather than passing raw `AccessibilityService.GLOBAL_ACTION_*`
 * integers around, so a caller cannot pass an arbitrary int and silently do
 * nothing. [minApiLevel] guards the actions that do not exist on every supported
 * release - the app supports API 26 upward.
 */
enum class GlobalAction(
    val platformConstant: Int,
    val minApiLevel: Int = 26,
) {
    BACK(1),
    HOME(2),
    RECENTS(3),
    NOTIFICATIONS(4),
    QUICK_SETTINGS(5),
    POWER_DIALOG(6),
    LOCK_SCREEN(8, minApiLevel = 28),
    TAKE_SCREENSHOT(9, minApiLevel = 30),
    ;

    fun isSupportedOn(apiLevel: Int): Boolean = apiLevel >= minApiLevel
}
