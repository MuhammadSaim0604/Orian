package com.mobileautomation.bridge

import com.mobileautomation.accessibility.model.Bounds
import com.mobileautomation.accessibility.selector.Point
import com.mobileautomation.gestures.SwipeDirection
import com.mobileautomation.tools.MediaCommand
import com.mobileautomation.tools.VolumeDirection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tests for parsing the JSON arguments the TypeScript wrapper sends.
 *
 * This is the boundary where untrusted input becomes typed Kotlin
 * (`conventions/Coding_Conventions.md`), so the interesting cases are the invalid
 * ones: a malformed argument must be named clearly here rather than surfacing as a
 * confusing failure deep inside the runtime.
 */
class BridgeArgumentsTest {
    // --- selectors --------------------------------------------------------

    @Test
    fun `parses a full selector`() {
        val json =
            """
            {
              "resourceId": "com.whatsapp:id/send_button",
              "contentDescription": "Send message",
              "text": "Send",
              "className": "android.widget.ImageButton",
              "structuralPath": "0.2.1",
              "bounds": { "left": 900, "top": 1800, "right": 1050, "bottom": 1950 },
              "coordinates": { "x": 975, "y": 1875 },
              "packageName": "com.whatsapp",
              "activityName": "com.whatsapp.Conversation",
              "requireActionable": true,
              "exactText": true
            }
            """.trimIndent()

        val selector = BridgeArguments.parseSelector(json)

        assertEquals("com.whatsapp:id/send_button", selector.resourceId)
        assertEquals("Send message", selector.contentDescription)
        assertEquals("Send", selector.text)
        assertEquals("android.widget.ImageButton", selector.className)
        assertEquals("0.2.1", selector.structuralPath)
        assertEquals(Bounds(900, 1800, 1050, 1950), selector.bounds)
        assertEquals(Point(975, 1875), selector.coordinates)
        assertEquals("com.whatsapp", selector.packageName)
        assertEquals("com.whatsapp.Conversation", selector.activityName)
        assertTrue(selector.requireActionable)
        assertTrue(selector.exactText)
    }

    @Test
    fun `parses a minimal selector`() {
        val selector = BridgeArguments.parseSelector("""{"text":"Send"}""")

        assertEquals("Send", selector.text)
        assertNull(selector.resourceId)
        assertFalse(selector.requireActionable)
        assertFalse(selector.exactText)
    }

    @Test
    fun `preserves the screen scope so a selector cannot fire on the wrong screen`() {
        val selector =
            BridgeArguments.parseSelector(
                """{"text":"Send","packageName":"com.whatsapp","activityName":"com.whatsapp.Conversation"}""",
            )

        assertEquals("com.whatsapp", selector.packageName)
        assertEquals("com.whatsapp.Conversation", selector.activityName)
    }

    @Test
    fun `rejects a selector with nothing to locate by`() {
        // Would otherwise resolve to nothing several layers down, reported as
        // element-not-found rather than as the caller error it is.
        val error =
            runCatching { BridgeArguments.parseSelector("""{"className":"android.widget.Button"}""") }
                .exceptionOrNull()

        assertTrue(error is BridgeArguments.MalformedArgument)
        assertTrue(error!!.message!!.contains("no locating information"))
    }

    @Test
    fun `rejects an empty selector object`() {
        assertTrue(
            runCatching { BridgeArguments.parseSelector("{}") }.exceptionOrNull()
                is BridgeArguments.MalformedArgument,
        )
    }

    @Test
    fun `rejects a selector that is not an object`() {
        assertTrue(
            runCatching { BridgeArguments.parseSelector("[]") }.exceptionOrNull()
                is BridgeArguments.MalformedArgument,
        )
        assertTrue(
            runCatching { BridgeArguments.parseSelector("garbage") }.exceptionOrNull()
                is BridgeArguments.MalformedArgument,
        )
    }

    @Test
    fun `rejects bounds missing an edge`() {
        val error =
            runCatching {
                BridgeArguments.parseSelector("""{"bounds":{"left":1,"top":2,"right":3}}""")
            }.exceptionOrNull()

        assertTrue(error is BridgeArguments.MalformedArgument)
        assertTrue(error!!.message!!.contains("bottom"))
    }

    @Test
    fun `parses coordinates alone as a valid last-resort selector`() {
        val selector = BridgeArguments.parseSelector("""{"coordinates":{"x":100,"y":200}}""")
        assertEquals(Point(100, 200), selector.coordinates)
    }

    // --- alarms -----------------------------------------------------------

    @Test
    fun `parses an alarm request`() {
        val request =
            BridgeArguments.parseAlarmRequest(
                """{"hour":7,"minute":30,"label":"Standup","repeatDays":[1,2,3,4,5],"skipUi":true}""",
            )

        assertEquals(7, request.hour)
        assertEquals(30, request.minute)
        assertEquals("Standup", request.label)
        assertEquals(setOf(1, 2, 3, 4, 5), request.repeatDays)
        assertTrue(request.skipUi)
        assertTrue(request.isRecurring)
    }

    @Test
    fun `defaults an alarm to a one-off with skipUi`() {
        val request = BridgeArguments.parseAlarmRequest("""{"hour":7,"minute":0}""")

        assertFalse(request.isRecurring)
        assertTrue(request.skipUi)
    }

    @Test
    fun `rejects an alarm with no hour`() {
        val error =
            runCatching { BridgeArguments.parseAlarmRequest("""{"minute":30}""") }.exceptionOrNull()

        assertTrue(error is BridgeArguments.MalformedArgument)
        assertTrue(error!!.message!!.contains("hour"))
    }

    @Test
    fun `translates an out-of-range alarm time into a bridge error`() {
        // AlarmRequest validates ranges itself; the bridge must present one
        // consistent failure type to the TS side rather than leaking Kotlin's.
        val error =
            runCatching { BridgeArguments.parseAlarmRequest("""{"hour":25,"minute":0}""") }
                .exceptionOrNull()

        assertTrue(error is BridgeArguments.MalformedArgument)
        assertTrue(error!!.message!!.contains("hour"))
    }

    @Test
    fun `translates an invalid repeat day into a bridge error`() {
        assertTrue(
            runCatching {
                BridgeArguments.parseAlarmRequest("""{"hour":7,"minute":0,"repeatDays":[9]}""")
            }.exceptionOrNull() is BridgeArguments.MalformedArgument,
        )
    }

    // --- intents ----------------------------------------------------------

    @Test
    fun `parses an intent request`() {
        val request =
            BridgeArguments.parseIntentRequest(
                """
                {
                  "action": "android.intent.action.VIEW",
                  "dataUri": "https://example.com",
                  "packageName": "com.android.chrome",
                  "extras": { "key": "value" },
                  "requireChooser": true
                }
                """.trimIndent(),
            )

        assertEquals("android.intent.action.VIEW", request.action)
        assertEquals("https://example.com", request.dataUri)
        assertEquals("com.android.chrome", request.packageName)
        assertEquals(mapOf("key" to "value"), request.extras)
        assertTrue(request.requireChooser)
    }

    @Test
    fun `rejects an intent with no action`() {
        val error =
            runCatching { BridgeArguments.parseIntentRequest("""{"dataUri":"https://x.com"}""") }
                .exceptionOrNull()

        assertTrue(error is BridgeArguments.MalformedArgument)
        assertTrue(error!!.message!!.contains("action"))
    }

    @Test
    fun `rejects an intent with a blank action`() {
        // A blank action resolves unpredictably, which is worse than not launching.
        assertTrue(
            runCatching { BridgeArguments.parseIntentRequest("""{"action":"   "}""") }
                .exceptionOrNull() is BridgeArguments.MalformedArgument,
        )
    }

    // --- enums ------------------------------------------------------------

    @Test
    fun `parses swipe directions case-insensitively`() {
        assertEquals(SwipeDirection.UP, BridgeArguments.parseSwipeDirection("up"))
        assertEquals(SwipeDirection.DOWN, BridgeArguments.parseSwipeDirection("DOWN"))
        assertEquals(SwipeDirection.LEFT, BridgeArguments.parseSwipeDirection("Left"))
    }

    @Test
    fun `rejects an unknown swipe direction and lists the valid ones`() {
        val error =
            runCatching { BridgeArguments.parseSwipeDirection("sideways") }.exceptionOrNull()

        assertTrue(error is BridgeArguments.MalformedArgument)
        assertTrue(error!!.message!!.contains("up"))
    }

    @Test
    fun `parses media commands`() {
        assertEquals(MediaCommand.PLAY_PAUSE, BridgeArguments.parseMediaCommand("play_pause"))
        assertEquals(MediaCommand.NEXT, BridgeArguments.parseMediaCommand("NEXT"))
    }

    @Test
    fun `rejects an unknown media command`() {
        assertTrue(
            runCatching { BridgeArguments.parseMediaCommand("moonwalk") }.exceptionOrNull()
                is BridgeArguments.MalformedArgument,
        )
    }

    @Test
    fun `parses volume directions`() {
        assertEquals(VolumeDirection.UP, BridgeArguments.parseVolumeDirection("up"))
        assertEquals(VolumeDirection.DOWN, BridgeArguments.parseVolumeDirection("DOWN"))
    }

    @Test
    fun `rejects an unknown volume direction`() {
        assertTrue(
            runCatching { BridgeArguments.parseVolumeDirection("louder") }.exceptionOrNull()
                is BridgeArguments.MalformedArgument,
        )
    }
}
