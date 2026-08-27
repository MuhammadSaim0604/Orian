package com.mobileautomation.gestures

/**
 * A rectangle on screen, in device pixels.
 *
 * Duplicated from the accessibility module rather than shared, because the
 * gesture engine must not depend on the accessibility layer: gestures are
 * dispatched by coordinate and are meaningful without any UI tree. The
 * automation module is what joins the two.
 */
data class Rect(
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int,
) {
    val width: Int get() = right - left

    val height: Int get() = bottom - top

    val centerX: Int get() = left + (width / 2)

    val centerY: Int get() = top + (height / 2)

    val center: Point get() = Point(centerX, centerY)

    fun contains(point: Point): Boolean = point.x >= left && point.x < right && point.y >= top && point.y < bottom
}
