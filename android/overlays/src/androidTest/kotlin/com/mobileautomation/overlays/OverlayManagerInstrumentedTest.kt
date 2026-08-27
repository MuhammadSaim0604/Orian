package com.mobileautomation.overlays

import android.content.Context
import android.view.View
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumentation tests for the overlay manager against a real `WindowManager`.
 *
 * The security-relevant behaviour is what is verified: with the overlay permission
 * ungranted - which is the default, and cannot be granted from a test - the manager
 * must refuse to show a window rather than throwing or partially succeeding. An
 * overlay drawn without consent is a tapjacking vector, so failing closed matters
 * more than the happy path.
 */
@RunWith(AndroidJUnit4::class)
class OverlayManagerInstrumentedTest {
    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun manager(): WindowManagerOverlayManager =
        WindowManagerOverlayManager(
            context = context,
            geometry = OverlayGeometry(screenWidthPx = 1080, screenHeightPx = 2400),
            viewFactory = { View(context) },
        )

    @Test
    fun reportsOverlayPermissionAsNotGrantedByDefault() {
        assertFalse(manager().hasOverlayPermission())
    }

    @Test
    fun refusesToShowWithoutPermission() {
        val manager = manager()

        val shown = manager.show(nodeId = "node-1")

        assertFalse("must not draw over other apps without consent", shown)
        assertFalse(manager.isShowing)
        assertNull(manager.boundNodeId)
    }

    @Test
    fun layoutAndMoveAreNoOpsWhenNothingIsShowing() {
        val manager = manager()

        assertFalse(manager.setLayout(OverlayLayout.EXPANDED))
        assertFalse(manager.moveTo(100, 100))
    }

    @Test
    fun hideIsSafeWhenNothingIsShowing() {
        // Called on teardown paths that cannot know whether a window exists.
        manager().hide()
    }

    @Test
    fun geometryProducesAnOnScreenSpecForTheRealDisplay() {
        val metrics = context.resources.displayMetrics
        val geometry =
            OverlayGeometry(
                screenWidthPx = metrics.widthPixels,
                screenHeightPx = metrics.heightPixels,
            )

        for (layout in OverlayLayout.entries) {
            val spec = geometry.specFor(layout)
            assertTrue("$layout escaped the real display", geometry.isFullyOnScreen(spec))
            assertTrue("$layout covers too much of the screen", geometry.leavesAppVisible(spec))
        }
    }
}
