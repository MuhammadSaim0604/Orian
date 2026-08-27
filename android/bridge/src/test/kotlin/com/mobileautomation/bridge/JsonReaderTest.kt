package com.mobileautomation.bridge

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tests for the hand-rolled JSON reader.
 *
 * Worth testing thoroughly despite its size: it parses every structured argument
 * crossing the bridge, and a subtle bug here would surface as a selector that
 * mysteriously matches the wrong element rather than as a parse failure.
 */
class JsonReaderTest {
    @Test
    fun `reads a flat object`() {
        val fields = JsonReader.readObject("""{"text":"Send","index":2,"clickable":true}""")!!

        assertEquals("Send", fields.string("text"))
        assertEquals(2, fields.int("index"))
        assertEquals(true, fields.boolean("clickable"))
    }

    @Test
    fun `reads an empty object`() {
        val fields = JsonReader.readObject("{}")!!
        assertTrue(fields.keys.isEmpty())
    }

    @Test
    fun `reads a nested object`() {
        val fields =
            JsonReader.readObject("""{"bounds":{"left":10,"top":20,"right":30,"bottom":40}}""")!!

        val bounds = fields.nested("bounds")!!
        assertEquals(10, bounds.int("left"))
        assertEquals(40, bounds.int("bottom"))
    }

    @Test
    fun `reads negative and large numbers`() {
        val fields = JsonReader.readObject("""{"x":-42,"t":1700000000000}""")!!

        assertEquals(-42, fields.int("x"))
        assertEquals(1_700_000_000_000L, fields.long("t"))
    }

    @Test
    fun `keeps integers as integers`() {
        // A coordinate read back as 421.0 would print that way in logs and traces.
        val fields = JsonReader.readObject("""{"x":421}""")!!
        assertEquals(421, fields.int("x"))
    }

    @Test
    fun `reads a fractional number`() {
        val fields = JsonReader.readObject("""{"fraction":0.8}""")!!
        assertEquals(0.8, fields.double("fraction")!!, 0.0001)
    }

    @Test
    fun `reads an array of numbers`() {
        val fields = JsonReader.readObject("""{"repeatDays":[1,2,3,4,5]}""")!!
        assertEquals(listOf(1, 2, 3, 4, 5), fields.intArray("repeatDays"))
    }

    @Test
    fun `reads an empty array`() {
        val fields = JsonReader.readObject("""{"repeatDays":[]}""")!!
        assertEquals(emptyList<Int>(), fields.intArray("repeatDays"))
    }

    @Test
    fun `reads a string map`() {
        val fields = JsonReader.readObject("""{"extras":{"a":"1","b":"2"}}""")!!
        assertEquals(mapOf("a" to "1", "b" to "2"), fields.stringMap("extras"))
    }

    @Test
    fun `unescapes quotes newlines and tabs`() {
        val fields = JsonReader.readObject("""{"text":"say \"hi\"\nnow\ttabbed"}""")!!
        assertEquals("say \"hi\"\nnow\ttabbed", fields.string("text"))
    }

    @Test
    fun `unescapes a backslash`() {
        val fields = JsonReader.readObject("""{"text":"C:\\path"}""")!!
        assertEquals("C:\\path", fields.string("text"))
    }

    @Test
    fun `unescapes a unicode sequence`() {
        val fields = JsonReader.readObject("""{"text":"\u0041"}""")!!
        assertEquals("A", fields.string("text"))
    }

    @Test
    fun `reads text containing emoji`() {
        val fields = JsonReader.readObject("""{"text":"Send 🚀"}""")!!
        assertEquals("Send 🚀", fields.string("text"))
    }

    @Test
    fun `treats a null value as absent`() {
        val fields = JsonReader.readObject("""{"text":null}""")!!
        assertNull(fields.string("text"))
    }

    @Test
    fun `treats a blank string as absent`() {
        // A blank text selector would match everything, so blank is not a value.
        val fields = JsonReader.readObject("""{"text":"   "}""")!!
        assertNull(fields.string("text"))
    }

    @Test
    fun `reports an absent field as null rather than throwing`() {
        val fields = JsonReader.readObject("""{"text":"Send"}""")!!

        assertNull(fields.int("missing"))
        assertNull(fields.boolean("missing"))
        assertNull(fields.nested("missing"))
        assertFalse(fields.has("missing"))
    }

    @Test
    fun `tolerates whitespace between tokens`() {
        val fields = JsonReader.readObject("{ \"text\" : \"Send\" , \"index\" : 1 }")!!

        assertEquals("Send", fields.string("text"))
        assertEquals(1, fields.int("index"))
    }

    @Test
    fun `returns null for text that is not an object`() {
        assertNull(JsonReader.readObject("[1,2,3]"))
        assertNull(JsonReader.readObject("\"just a string\""))
        assertNull(JsonReader.readObject("42"))
        assertNull(JsonReader.readObject(""))
    }

    @Test
    fun `returns null for malformed json`() {
        assertNull(JsonReader.readObject("""{"text":"unterminated"""))
        assertNull(JsonReader.readObject("""{"text" "missing colon"}"""))
        assertNull(JsonReader.readObject("not json at all"))
    }

    @Test
    fun `coerces a numeric string`() {
        // The TS side stringifies numbers in some paths; accepting both avoids a
        // failure that depends on which caller built the payload.
        val fields = JsonReader.readObject("""{"hour":"7"}""")!!
        assertEquals(7, fields.int("hour"))
    }

    @Test
    fun `coerces a boolean string`() {
        val fields = JsonReader.readObject("""{"skipUi":"true"}""")!!
        assertEquals(true, fields.boolean("skipUi"))
    }
}
