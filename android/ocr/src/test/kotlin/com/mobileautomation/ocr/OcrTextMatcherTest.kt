package com.mobileautomation.ocr

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Matching a query against recognised text.
 *
 * These are the rules most likely to be wrong in a way that only shows up on a real screen, which is why they
 * live in a pure object and are tested here rather than being discovered on a device.
 *
 * The two tests that matter most are the ones about **refusing** a match: `Save` must not match `Share`, and a
 * two-letter word must not fuzzy-match at all. A failed lookup is visible and recoverable — the agent scrolls,
 * looks again, or reports that it could not find the button. A wrong tap in someone else's app is neither.
 */
class OcrTextMatcherTest {
    // --- the rungs, in order ----------------------------------------------

    @Test
    fun `identical text matches exactly`() {
        val match = OcrTextMatcher.match(block("Send"), "Send")

        assertEquals(OcrMatchKind.EXACT, match?.kind)
        assertEquals(1.0, match!!.similarity, 0.0001)
    }

    @Test
    fun `surrounding whitespace does not prevent an exact match`() {
        // A recogniser routinely returns a line with trailing space. Treating that as inexact would push a
        // perfectly good match down two rungs.
        assertEquals(OcrMatchKind.EXACT, OcrTextMatcher.match(block("  Send  "), "Send")?.kind)
    }

    @Test
    fun `case differences are their own rung`() {
        // Reported as case-insensitive rather than exact, because the caller may care: a button labelled "SEND"
        // and one labelled "Send" are the same control, but knowing which was read is useful in a trace.
        val match = OcrTextMatcher.match(block("SEND"), "Send")

        assertEquals(OcrMatchKind.CASE_INSENSITIVE, match?.kind)
        assertEquals(1.0, match!!.similarity, 0.0001)
    }

    @Test
    fun `internal whitespace is collapsed before comparing`() {
        assertEquals(
            OcrMatchKind.CASE_INSENSITIVE,
            OcrTextMatcher.match(block("Send   Message"), "send message")?.kind,
        )
    }

    @Test
    fun `a query inside a longer line is a containment match`() {
        // Very common: the recognised line is the whole button label, and the caller knows only part of it.
        val match = OcrTextMatcher.match(block("Continue to payment"), "Continue")

        assertEquals(OcrMatchKind.CONTAINS, match?.kind)
    }

    @Test
    fun `containment similarity reflects how much extra text there was`() {
        // Without this every containment match scored identically and the sort could not tell a precise hit from
        // a line that merely mentions the word.
        val precise = OcrTextMatcher.match(block("Continue"), "Continu")!!
        val loose = OcrTextMatcher.match(block("Continue to payment now please"), "Continue")!!

        assertTrue(precise.similarity > loose.similarity)
    }

    @Test
    fun `a misread character still matches`() {
        // The reason fuzzy matching is mandatory rather than a nicety: OCR reads `l` as `1` and `O` as `0`, so an
        // exact comparison fails on text a person reads without noticing anything wrong.
        val match = OcrTextMatcher.match(block("Cont1nue"), "Continue")

        assertEquals(OcrMatchKind.FUZZY, match?.kind)
        assertTrue(match!!.similarity >= OcrTextMatcher.FUZZY_THRESHOLD)
    }

    @Test
    fun `zero for O is tolerated`() {
        assertNotNull(OcrTextMatcher.match(block("Passw0rd"), "Password"))
    }

    // --- what it refuses --------------------------------------------------

    @Test
    fun `Save does not match Share`() {
        // The decisive test. At a permissive threshold these match, and the agent taps the wrong button in
        // someone's app - which is worse than not finding it, because a failure is visible and recoverable.
        assertNull(OcrTextMatcher.match(block("Share"), "Save"))
    }

    @Test
    fun `a short word is never fuzzy-matched`() {
        // "No" and "Go" differ by one character out of two, which is indistinguishable from a misread. Below four
        // characters the risk of tapping the wrong thing outweighs the benefit - and in practice the 0.8 threshold
        // pushes the real floor to about five, since one error in a four-letter word scores 0.75.
        assertNull(OcrTextMatcher.match(block("Go"), "No"))
        assertNull(OcrTextMatcher.match(block("Off"), "On"))
        assertNull(OcrTextMatcher.match(block("Sertd"), "Send"))
    }

    @Test
    fun `a short word still matches exactly and case-insensitively`() {
        // The length guard applies only to fuzzy matching. Refusing "OK" entirely would make the matcher useless
        // for the commonest button on Android.
        assertEquals(OcrMatchKind.EXACT, OcrTextMatcher.match(block("OK"), "OK")?.kind)
        assertEquals(OcrMatchKind.CASE_INSENSITIVE, OcrTextMatcher.match(block("ok"), "OK")?.kind)
    }

    @Test
    fun `unrelated text does not match`() {
        assertNull(OcrTextMatcher.match(block("Settings"), "Send a message"))
    }

    @Test
    fun `an empty query matches nothing`() {
        // Otherwise containment would match every line on screen, since every string contains the empty string.
        assertNull(OcrTextMatcher.match(block("Send"), ""))
        assertNull(OcrTextMatcher.match(block("Send"), "   "))
        assertTrue(OcrTextMatcher.findAll(listOf(block("Send")), "").isEmpty())
    }

    @Test
    fun `exact mode refuses everything below the second rung`() {
        // For a caller that would rather fail than act on a guess.
        assertNull(OcrTextMatcher.match(block("Cont1nue"), "Continue", exact = true))
        assertNull(OcrTextMatcher.match(block("Continue to payment"), "Continue", exact = true))
        assertNotNull(OcrTextMatcher.match(block("CONTINUE"), "Continue", exact = true))
    }

    // --- choosing between candidates --------------------------------------

    @Test
    fun `a stronger rung wins over a higher similarity`() {
        val blocks =
            listOf(
                block("Continue to payment"),
                block("Continue"),
            )

        assertEquals("Continue", OcrTextMatcher.findBest(blocks, "Continue")?.block?.text)
    }

    @Test
    fun `the smaller box wins when two match equally`() {
        // When a query matches both a heading and a button, the smaller box is the more specific target - so the
        // agent taps the button rather than the title above it.
        val heading = OcrTextBlock(text = "Send", bounds = OcrBounds(0, 0, 1000, 200))
        val button = OcrTextBlock(text = "Send", bounds = OcrBounds(400, 900, 600, 980))

        val best = OcrTextMatcher.findBest(listOf(heading, button), "Send")

        assertEquals(button.bounds, best?.block?.bounds)
    }

    @Test
    fun `findAll orders every match strongest first`() {
        // "Contlnue" rather than a misread four-letter word, and that is worth noting: at a 0.8 threshold a single
        // wrong character in a four-letter word scores 0.75 and is refused. The length guard and the threshold
        // reinforce each other, so in practice fuzzy matching starts at about five characters.
        val blocks =
            listOf(
                block("Contlnue"),
                block("Continue to payment"),
                block("Continue"),
            )

        val kinds = OcrTextMatcher.findAll(blocks, "Continue").map { it.kind }

        assertEquals(listOf(OcrMatchKind.EXACT, OcrMatchKind.CONTAINS, OcrMatchKind.FUZZY), kinds)
    }

    @Test
    fun `a match reports a tappable point`() {
        val block = OcrTextBlock(text = "Send", bounds = OcrBounds(400, 900, 600, 980))

        val match = OcrTextMatcher.findBest(listOf(block), "Send")!!

        assertEquals(500, match.centerX)
        assertEquals(940, match.centerY)
    }

    @Test
    fun `only the top two rungs count as strong`() {
        // What the recorder uses to judge durability. A containment or fuzzy match tapped the right thing this
        // time and may not next time.
        assertTrue(OcrTextMatcher.match(block("Send"), "Send")!!.isStrong)
        assertTrue(OcrTextMatcher.match(block("SEND"), "Send")!!.isStrong)
        assertFalse(OcrTextMatcher.match(block("Send now"), "Send")!!.isStrong)
        assertFalse(OcrTextMatcher.match(block("Contlnue"), "Continue")!!.isStrong)
    }

    // --- the distance function -------------------------------------------

    @Test
    fun `edit distance counts single-character edits`() {
        assertEquals(0, OcrTextMatcher.editDistance("send", "send"))
        assertEquals(1, OcrTextMatcher.editDistance("send", "sent"))
        assertEquals(1, OcrTextMatcher.editDistance("send", "sen"))
        assertEquals(1, OcrTextMatcher.editDistance("sen", "send"))
        // The textbook case, included because it exercises substitution and insertion together - which is where a
        // two-row implementation goes wrong if the rows are swapped in the wrong order.
        assertEquals(3, OcrTextMatcher.editDistance("kitten", "sitting"))
    }

    @Test
    fun `edit distance handles an empty side`() {
        assertEquals(4, OcrTextMatcher.editDistance("", "send"))
        assertEquals(4, OcrTextMatcher.editDistance("send", ""))
        assertEquals(0, OcrTextMatcher.editDistance("", ""))
    }

    @Test
    fun `similarity is one for identical strings and zero against nothing`() {
        assertEquals(1.0, OcrTextMatcher.similarity("send", "send"), 0.0001)
        assertEquals(0.0, OcrTextMatcher.similarity("send", ""), 0.0001)
    }

    @Test
    fun `similarity falls as strings diverge`() {
        val close = OcrTextMatcher.similarity("continue", "cont1nue")
        val distant = OcrTextMatcher.similarity("continue", "settings")

        assertTrue(close > distant)
        assertTrue(close > OcrTextMatcher.FUZZY_THRESHOLD)
        assertTrue(distant < OcrTextMatcher.FUZZY_THRESHOLD)
    }

    @Test
    fun `the threshold is strict rather than permissive`() {
        // Recorded as a test because the number is a judgement, not an implementation detail: at 0.6 "Save"
        // matches "Share". Anyone lowering it should have to change this line and think about why.
        assertTrue(OcrTextMatcher.FUZZY_THRESHOLD >= 0.8)
        assertTrue(OcrTextMatcher.MIN_FUZZY_LENGTH >= 4)
    }
}

class OcrMatchKindTest {
    @Test
    fun `wire names are stable, since they cross the bridge`() {
        assertEquals(listOf("exact", "caseInsensitive", "contains", "fuzzy"), OcrMatchKind.wireNames)
    }

    @Test
    fun `rank orders the rungs strongest first`() {
        assertTrue(OcrMatchKind.EXACT.rank < OcrMatchKind.CASE_INSENSITIVE.rank)
        assertTrue(OcrMatchKind.CASE_INSENSITIVE.rank < OcrMatchKind.CONTAINS.rank)
        assertTrue(OcrMatchKind.CONTAINS.rank < OcrMatchKind.FUZZY.rank)
    }

    @Test
    fun `a kind resolves from its wire name`() {
        assertEquals(OcrMatchKind.FUZZY, OcrMatchKind.fromWireName("fuzzy"))
        assertEquals(OcrMatchKind.EXACT, OcrMatchKind.fromWireName("EXACT"))
        assertNull(OcrMatchKind.fromWireName("telepathy"))
    }
}

private fun block(text: String): OcrTextBlock =
    OcrTextBlock(text = text, bounds = OcrBounds(left = 0, top = 0, right = 100, bottom = 40))
