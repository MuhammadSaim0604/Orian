package com.mobileautomation.gestures

import android.accessibilityservice.GestureDescription
import android.graphics.Path
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumentation tests for turning a [GestureSpec] into the platform's
 * [GestureDescription].
 *
 * `Path` and `GestureDescription` are framework classes with native backing, so a
 * JVM test cannot prove a path is well-formed. What matters here is that the
 * platform *accepts* the descriptions the builder produces - the platform rejects
 * a malformed stroke by returning false from `dispatchGesture` with no diagnostic,
 * which is exactly the kind of silent failure worth catching in CI.
 *
 * Dispatching itself needs a live accessibility service and is verified manually
 * against the phase's definition of done.
 */
@RunWith(AndroidJUnit4::class)
class GestureDescriptionInstrumentedTest {
    private val builder = GestureBuilder(screenWidthPx = 1080, screenHeightPx = 2400)

    private fun describe(spec: GestureSpec): GestureDescription {
        val path =
            Path().apply {
                val first = spec.path.first()
                moveTo(first.x.toFloat(), first.y.toFloat())
                for (point in spec.path.drop(1)) {
                    lineTo(point.x.toFloat(), point.y.toFloat())
                }
            }

        val stroke = GestureDescription.StrokeDescription(path, 0L, spec.durationMs, false)
        return GestureDescription.Builder().addStroke(stroke).build()
    }

    @Test
    fun platformAcceptsATapDescription() {
        val description = describe(builder.tap(Point(500, 1000)))

        assertNotNull(description)
        assertEquals(1, description.strokeCount)
    }

    @Test
    fun platformAcceptsALongPressDuration() {
        val spec = builder.longPress(Point(500, 1000), durationMs = 800L)

        val stroke = describe(spec).getStroke(0)

        assertEquals(800L, stroke.duration)
    }

    @Test
    fun platformAcceptsAMultiPointSwipePath() {
        // A swipe is an interpolated path rather than two points, because apps
        // often ignore a two-point "teleport" instead of treating it as a drag.
        val spec = builder.swipeAcrossScreen(SwipeDirection.UP)

        val description = describe(spec)

        assertEquals(1, description.strokeCount)
        assertTrue("a swipe needs intermediate points", spec.path.size > 2)
    }

    @Test
    fun everyBuiltGestureIsAcceptedByThePlatform() {
        val specs =
            buildList {
                add(builder.tap(Point(100, 100)))
                add(builder.tapCenterOf(Rect(900, 1800, 1050, 1950)))
                add(builder.longPress(Point(200, 400)))
                for (direction in SwipeDirection.entries) {
                    add(builder.swipeAcrossScreen(direction))
                    add(builder.scroll(direction))
                }
                add(builder.swipeWithin(Rect(0, 600, 1080, 1600), SwipeDirection.UP))
            }

        for (spec in specs) {
            // Throws if the platform considers the stroke invalid, e.g. a path
            // leaving the display or a non-positive duration.
            assertNotNull("platform rejected $spec", describe(spec))
        }
    }

    @Test
    fun clampedGestureStaysWithinTheDisplay() {
        // The platform rejects a stroke whose path leaves the screen, so clamping is
        // what keeps an off-target request dispatchable.
        val spec = builder.tap(Point(99_999, 99_999))

        assertNotNull(describe(spec))
        assertTrue(builder.isOnScreen(spec.point))
    }
}
