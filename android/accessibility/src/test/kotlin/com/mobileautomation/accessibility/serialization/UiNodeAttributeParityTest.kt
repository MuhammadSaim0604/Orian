package com.mobileautomation.accessibility.serialization

import com.mobileautomation.accessibility.UiNodeAttribute
import com.mobileautomation.accessibility.UiTreeAttribute
import com.mobileautomation.accessibility.model.Bounds
import com.mobileautomation.accessibility.model.UiNode
import com.mobileautomation.accessibility.model.UiTree
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Guards the contract between the Kotlin serializer and the TypeScript layer.
 *
 * `UiNodeAttribute` is documented as the shared, versioned description of what
 * the parser emits, and `@mobile-automation/screen-inspector` mirrors it. If the
 * two drift, the TypeScript side reads fields that are never present - or misses
 * fields the AI is being shown - and nothing fails loudly. These tests make that
 * drift a build failure instead.
 */
class UiNodeAttributeParityTest {
    private val fullyPopulatedNode =
        UiNode(
            text = "Send",
            resourceId = "com.whatsapp:id/send_button",
            className = "android.widget.ImageButton",
            contentDescription = "Send message",
            packageName = "com.whatsapp",
            bounds = Bounds(900, 1800, 1050, 1950),
            clickable = true,
            longClickable = true,
            scrollable = true,
            editable = true,
            checkable = true,
            checked = true,
            selected = true,
            focused = true,
            enabled = true,
            visible = true,
            index = 2,
            children = listOf(UiNode(text = "child")),
        )

    private val tree =
        UiTree(
            root = fullyPopulatedNode,
            packageName = "com.whatsapp",
            activityName = "com.whatsapp.Conversation",
            capturedAtEpochMs = 1_700_000_000_000L,
            screenWidthPx = 1080,
            screenHeightPx = 2400,
        )

    @Test
    fun `every declared node attribute is actually emitted`() {
        val json = UiTreeSerializer.nodeToJson(fullyPopulatedNode)

        val missing = UiNodeAttribute.keys.filterNot { json.contains("\"$it\":") }

        assertTrue(
            "declared but never serialized: $missing - the TypeScript side would read absent fields",
            missing.isEmpty(),
        )
    }

    @Test
    fun `every emitted node key is declared`() {
        val json = UiTreeSerializer.nodeToJson(fullyPopulatedNode)

        val undeclared = emittedKeysOf(json).filterNot { it in UiNodeAttribute.keys }

        assertTrue(
            "serialized but undeclared: $undeclared - add it to UiNodeAttribute and bump the schema version",
            undeclared.isEmpty(),
        )
    }

    @Test
    fun `declared attribute order matches emission order`() {
        // Order is part of the contract: the serializer promises deterministic
        // output so two captures of one screen are byte-identical.
        val emitted = emittedKeysOf(UiTreeSerializer.nodeToJson(fullyPopulatedNode))

        assertEquals(UiNodeAttribute.keys, emitted)
    }

    @Test
    fun `every declared tree envelope key is emitted`() {
        val json = UiTreeSerializer.toJson(tree)

        val missing = UiTreeAttribute.keys.filterNot { json.contains("\"$it\":") }

        assertTrue("declared but never serialized: $missing", missing.isEmpty())
    }

    @Test
    fun `attribute keys are unique`() {
        assertEquals(UiNodeAttribute.keys.size, UiNodeAttribute.keys.toSet().size)
        assertEquals(UiTreeAttribute.keys.size, UiTreeAttribute.keys.toSet().size)
    }

    @Test
    fun `an attribute can be looked up by its wire key`() {
        assertEquals(UiNodeAttribute.RESOURCE_ID, UiNodeAttribute.fromKey("resourceId"))
        assertEquals(null, UiNodeAttribute.fromKey("notAKey"))
    }

    /**
     * Top-level keys of a serialized node, in emission order.
     *
     * Nested objects are skipped by depth tracking rather than parsed, so this
     * needs no JSON library - which matters because `org.json` is stubbed out in
     * Android JVM unit tests.
     */
    private fun emittedKeysOf(json: String): List<String> {
        val keys = mutableListOf<String>()
        var depth = 0
        var index = 0
        var inString = false
        var escaped = false
        val currentToken = StringBuilder()
        var tokenIsKey = false

        while (index < json.length) {
            val char = json[index]

            when {
                escaped -> escaped = false
                char == '\\' && inString -> escaped = true
                char == '"' -> {
                    if (inString) {
                        // Closing quote: a key is followed by a colon.
                        tokenIsKey = json.getOrNull(index + 1) == ':'
                        if (tokenIsKey && depth == 1) keys.add(currentToken.toString())
                        currentToken.setLength(0)
                    }
                    inString = !inString
                }
                inString -> currentToken.append(char)
                char == '{' || char == '[' -> depth++
                char == '}' || char == ']' -> depth--
            }

            index++
        }

        return keys
    }
}
