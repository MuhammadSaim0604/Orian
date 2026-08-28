package com.mobileautomation.storage

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The document reader, tested off-device.
 *
 * Hand-rolled parsing exists precisely so these run on the JVM: `org.json` is stubbed in unit
 * tests and returns defaults instead of failing, so a parser built on it would appear to work
 * here and silently report every workflow as empty on a real device.
 */
class WorkflowDocumentReaderTest {
    private val document =
        """
        {
          "id": "wf_1",
          "metadata": {
            "name": "Message Robert",
            "description": "Tell Robert I'll be late",
            "createdAt": "2026-01-01T00:00:00.000Z",
            "updatedAt": "2026-01-01T00:00:00.000Z"
          },
          "variables": [],
          "nodes": [
            { "id": "a", "type": "trigger", "config": {}, "metadata": { "label": "Start" } },
            { "id": "b", "type": "openApp", "config": { "packageName": "com.whatsapp" } },
            { "id": "c", "type": "click", "config": { "selector": { "text": "Send" } } }
          ],
          "edges": [{ "id": "e1", "source": "a", "target": "b" }]
        }
        """.trimIndent()

    @Test
    fun `reads the workflow name`() {
        assertEquals("Message Robert", WorkflowDocumentReader.readName(document))
    }

    @Test
    fun `reads the description`() {
        assertEquals("Tell Robert I'll be late", WorkflowDocumentReader.readDescription(document))
    }

    @Test
    fun `counts nodes`() {
        assertEquals(3, WorkflowDocumentReader.readNodeCount(document))
    }

    @Test
    fun `counts nested config objects as part of their node, not as extra nodes`() {
        // The click node's selector is a nested object; counting every brace would report four.
        assertEquals(3, WorkflowDocumentReader.readNodeCount(document))
    }

    @Test
    fun `falls back to a name rather than leaving a list row blank`() {
        assertEquals("Untitled workflow", WorkflowDocumentReader.readName("{}"))
    }

    @Test
    fun `reports no description when there is none`() {
        assertNull(WorkflowDocumentReader.readDescription("""{"metadata":{"name":"x"}}"""))
    }

    @Test
    fun `counts zero for an empty workflow`() {
        assertEquals(0, WorkflowDocumentReader.readNodeCount("""{"nodes":[]}"""))
    }

    @Test
    fun `counts zero when there is no nodes array at all`() {
        assertEquals(0, WorkflowDocumentReader.readNodeCount("{}"))
    }

    @Test
    fun `is not confused by the word nodes inside a string value`() {
        val tricky = """{"metadata":{"name":"count the nodes"},"nodes":[{"id":"a"}]}"""

        assertEquals(1, WorkflowDocumentReader.readNodeCount(tricky))
    }

    @Test
    fun `unescapes a quote in a name rather than truncating`() {
        val escaped = """{"metadata":{"name":"Robert\"s workflow"}}"""

        assertEquals("Robert\"s workflow", WorkflowDocumentReader.readName(escaped))
    }

    @Test
    fun `handles a name containing a brace`() {
        val braced = """{"metadata":{"name":"Set {{ count }}"},"nodes":[{"id":"a"}]}"""

        assertEquals("Set {{ count }}", WorkflowDocumentReader.readName(braced))
        assertEquals(1, WorkflowDocumentReader.readNodeCount(braced))
    }

    @Test
    fun `handles minified JSON`() {
        val minified =
            """{"id":"w","metadata":{"name":"Tiny"},"nodes":[{"id":"a"},{"id":"b"}],"edges":[]}"""

        assertEquals("Tiny", WorkflowDocumentReader.readName(minified))
        assertEquals(2, WorkflowDocumentReader.readNodeCount(minified))
    }

    @Test
    fun `tolerates a truncated document rather than throwing`() {
        // A partial write should show a degraded list row, not crash the list screen.
        assertEquals("Untitled workflow", WorkflowDocumentReader.readName("""{"metadata":{"na"""))
    }
}
