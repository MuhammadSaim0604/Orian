package com.mobileautomation.gestures

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GestureEngineTest {
    private val builder = GestureBuilder(screenWidthPx = 1080, screenHeightPx = 2400)

    private fun engine(
        dispatcher: GestureDispatcher,
        retries: Int = GestureEngine.DEFAULT_RETRY_COUNT,
    ) = GestureEngine(dispatcher, builder, retryCancelled = retries, settleDelayMs = 0L)

    @Test
    fun `dispatches a tap at the requested point`() =
        runTest {
            val dispatcher = RecordingGestureDispatcher()

            val outcome = engine(dispatcher).tap(500, 1000)

            assertTrue(outcome.isSuccess)
            assertEquals(1, dispatcher.attemptCount)
            assertEquals(Point(500, 1000), (dispatcher.dispatched.first() as GestureSpec.Tap).point)
        }

    @Test
    fun `taps the centre of an element`() =
        runTest {
            val dispatcher = RecordingGestureDispatcher()

            engine(dispatcher).tapCenterOf(Rect(900, 1800, 1050, 1950))

            assertEquals(Point(975, 1875), (dispatcher.dispatched.first() as GestureSpec.Tap).point)
        }

    @Test
    fun `dispatches a long press with the requested duration`() =
        runTest {
            val dispatcher = RecordingGestureDispatcher()

            engine(dispatcher).longPress(100, 100, durationMs = 800L)

            assertEquals(800L, dispatcher.dispatched.first().durationMs)
            assertEquals(GestureKind.LONG_PRESS, dispatcher.dispatched.first().kind)
        }

    @Test
    fun `retries a cancelled gesture once by default`() =
        runTest {
            val dispatcher =
                RecordingGestureDispatcher(
                    outcomes = listOf(GestureOutcome.Cancelled, GestureOutcome.Completed),
                )

            val outcome = engine(dispatcher).tap(10, 10)

            assertTrue(outcome.isSuccess)
            assertEquals(2, dispatcher.attemptCount)
        }

    @Test
    fun `gives up after exhausting retries`() =
        runTest {
            val dispatcher = RecordingGestureDispatcher(outcomes = listOf(GestureOutcome.Cancelled))

            val outcome = engine(dispatcher, retries = 2).tap(10, 10)

            assertFalse(outcome.isSuccess)
            assertEquals(3, dispatcher.attemptCount)
        }

    @Test
    fun `does not retry when the service is unavailable`() =
        runTest {
            val dispatcher =
                RecordingGestureDispatcher(outcomes = listOf(GestureOutcome.Unavailable))

            val outcome = engine(dispatcher, retries = 3).tap(10, 10)

            assertEquals(GestureOutcome.Unavailable, outcome)
            assertEquals(1, dispatcher.attemptCount)
        }

    @Test
    fun `does not retry an outright failure`() =
        runTest {
            val dispatcher =
                RecordingGestureDispatcher(
                    outcomes = listOf(GestureOutcome.Failed("malformed path")),
                )

            val outcome = engine(dispatcher, retries = 3).tap(10, 10)

            assertFalse(outcome.isSuccess)
            assertEquals(1, dispatcher.attemptCount)
        }

    @Test
    fun `scrolling down drags the finger up`() =
        runTest {
            val dispatcher = RecordingGestureDispatcher()

            engine(dispatcher).scroll(SwipeDirection.DOWN)

            val swipe = dispatcher.dispatched.first() as GestureSpec.Swipe
            assertTrue(swipe.to.y < swipe.from.y)
        }

    @Test
    fun `scrolls within a region without leaving it`() =
        runTest {
            val dispatcher = RecordingGestureDispatcher()
            val list = Rect(0, 600, 1080, 1600)

            engine(dispatcher).scrollWithin(list, SwipeDirection.DOWN)

            val swipe = dispatcher.dispatched.first() as GestureSpec.Swipe
            assertTrue(swipe.path.all { list.contains(it) })
            assertTrue(swipe.to.y < swipe.from.y)
        }

    @Test
    fun `reports availability from the dispatcher`() {
        assertTrue(engine(RecordingGestureDispatcher(isAvailable = true)).isAvailable)
        assertFalse(engine(RecordingGestureDispatcher(isAvailable = false)).isAvailable)
    }

    @Test
    fun `rejects a negative retry count`() {
        assertTrue(
            runCatching { GestureEngine(RecordingGestureDispatcher(), builder, retryCancelled = -1) }
                .exceptionOrNull() is IllegalArgumentException,
        )
    }

    @Test
    fun `rejects a negative settle delay`() {
        assertTrue(
            runCatching { GestureEngine(RecordingGestureDispatcher(), builder, settleDelayMs = -1L) }
                .exceptionOrNull() is IllegalArgumentException,
        )
    }

    @Test
    fun `waits for the ui to settle after a successful gesture`() =
        runTest {
            val settling =
                GestureEngine(
                    RecordingGestureDispatcher(),
                    builder,
                    settleDelayMs = 250L,
                )

            val before = testScheduler.currentTime
            settling.tap(10, 10)

            // runTest uses virtual time, so this asserts the delay happened
            // without actually waiting for it.
            assertEquals(250L, testScheduler.currentTime - before)
        }

    @Test
    fun `does not settle after a failed gesture`() =
        runTest {
            val settling =
                GestureEngine(
                    RecordingGestureDispatcher(outcomes = listOf(GestureOutcome.Unavailable)),
                    builder,
                    settleDelayMs = 250L,
                )

            val before = testScheduler.currentTime
            settling.tap(10, 10)

            assertEquals(0L, testScheduler.currentTime - before)
        }
}
