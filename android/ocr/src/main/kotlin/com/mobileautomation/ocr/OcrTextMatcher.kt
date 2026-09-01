package com.mobileautomation.ocr

// Finding a piece of text among OCR results.
//
// ## Why matching is three strategies rather than a string comparison
//
// OCR misreads characters. `l` becomes `1`, `O` becomes `0`, `rn` becomes `m`, and a slightly compressed
// screenshot turns `Continue` into `Contlnue`. An exact comparison therefore fails on text a human reads
// without noticing anything wrong - and it fails INTERMITTENTLY, depending on the render, which is the worst
// kind of failure to diagnose from a bug report.
//
// So matching descends: exact, then case-insensitive, then fuzzy. Each rung is reported, so a caller (and the
// recorder) can tell how solid the match was. A fuzzy match that tapped the right thing is still worth knowing
// about, because it means the same workflow may tap the wrong thing next time.
//
// Pure and free of Android types, so every rule here is unit-testable off a device - which matters, because
// these are the rules most likely to be wrong in a way that only shows up on a real screen.

/** How a piece of text was matched. */
enum class OcrMatchKind(val wireName: String) {
    /** Identical after trimming. */
    EXACT("exact"),

    /** Identical ignoring case and collapsed whitespace. */
    CASE_INSENSITIVE("caseInsensitive"),

    /** The query appears inside the recognised text, or vice versa. */
    CONTAINS("contains"),

    /** Close enough by edit distance, which is what survives an OCR misread. */
    FUZZY("fuzzy"),
    ;

    /** Lower is a stronger match. */
    val rank: Int get() = ordinal

    companion object {
        val wireNames: List<String> = entries.map { it.wireName }

        fun fromWireName(name: String): OcrMatchKind? = entries.firstOrNull { it.wireName.equals(name, true) }
    }
}

/**
 * A matched piece of text and how it was found.
 *
 * [similarity] is carried even for an exact match, so a caller comparing two candidates does not have to
 * special-case the rungs.
 */
data class OcrMatch(
    val block: OcrTextBlock,
    val kind: OcrMatchKind,
    /** 0..1, where 1 is identical. */
    val similarity: Double,
) {
    val centerX: Int get() = block.centerX

    val centerY: Int get() = block.centerY

    /** True when the match did not rely on tolerating a misread. */
    val isStrong: Boolean get() = kind == OcrMatchKind.EXACT || kind == OcrMatchKind.CASE_INSENSITIVE
}

object OcrTextMatcher {
    /**
     * Minimum similarity for a fuzzy match.
     *
     * 0.8 rather than something more permissive, deliberately. At 0.6, "Save" matches "Share" and the agent
     * taps the wrong button in someone's app — and a wrong tap is worse than a failed lookup, because a failure
     * is visible and recoverable while a wrong tap is neither.
     *
     * Short strings are additionally protected below: one wrong character in a four-letter word is already 0.75,
     * so length has to be part of the judgement rather than similarity alone.
     */
    const val FUZZY_THRESHOLD: Double = 0.8

    /**
     * Below this length a fuzzy match is refused outright.
     *
     * "OK" and "Ok" differ by case, which the second rung handles; "No" and "Go" differ by one character out of
     * two, which fuzzy matching cannot tell from a misread. On a short word the risk of tapping the wrong thing
     * outweighs the benefit.
     */
    const val MIN_FUZZY_LENGTH: Int = 4

    /**
     * Finds the best match for [query] among [blocks].
     *
     * Best rather than first: several lines can contain the query, and the closest one is far more likely to be
     * what the user meant than whichever happens to be highest on screen.
     *
     * @param exact when true, only an exact or case-insensitive match is accepted. For a caller that knows the
     *   string precisely and would rather fail than act on a guess.
     */
    fun findBest(
        blocks: List<OcrTextBlock>,
        query: String,
        exact: Boolean = false,
    ): OcrMatch? = findAll(blocks, query, exact).firstOrNull()

    /**
     * Every match for [query], strongest first.
     *
     * Ordered by rung, then by similarity, then by area — the last because when two lines match equally well the
     * smaller box is the more specific target. A query matching both a heading and a button should tap the
     * button.
     */
    fun findAll(
        blocks: List<OcrTextBlock>,
        query: String,
        exact: Boolean = false,
    ): List<OcrMatch> {
        val wanted = query.trim()
        if (wanted.isEmpty()) return emptyList()

        return blocks
            .mapNotNull { block -> match(block, wanted, exact) }
            .sortedWith(
                compareBy<OcrMatch> { it.kind.rank }
                    .thenByDescending { it.similarity }
                    .thenBy { it.block.bounds.area },
            )
    }

    /** How one block matches [query], or null when it does not. */
    fun match(
        block: OcrTextBlock,
        query: String,
        exact: Boolean = false,
    ): OcrMatch? {
        val wanted = query.trim()
        if (wanted.isEmpty()) return null

        val text = block.text.trim()

        if (text == wanted) return OcrMatch(block, OcrMatchKind.EXACT, 1.0)

        val normalisedWanted = normalise(wanted)
        val normalisedText = block.normalisedText

        if (normalisedText == normalisedWanted) {
            return OcrMatch(block, OcrMatchKind.CASE_INSENSITIVE, 1.0)
        }

        if (exact) return null

        // Containment before fuzzy, because it is a stronger claim: every character of the query is present, in
        // order. A recognised line is often longer than the label - "Continue to payment" contains "Continue".
        if (normalisedText.contains(normalisedWanted) || normalisedWanted.contains(normalisedText)) {
            return OcrMatch(block, OcrMatchKind.CONTAINS, containmentSimilarity(normalisedText, normalisedWanted))
        }

        if (normalisedWanted.length < MIN_FUZZY_LENGTH) return null

        val similarity = similarity(normalisedText, normalisedWanted)
        if (similarity < FUZZY_THRESHOLD) return null

        return OcrMatch(block, OcrMatchKind.FUZZY, similarity)
    }

    /**
     * Similarity of two strings, 0..1, from their edit distance.
     *
     * Levenshtein rather than a token or phonetic comparison, because OCR errors are **character**
     * substitutions: `1` for `l`, `0` for `O`. A word-level comparison cannot see them at all, and a phonetic
     * one would match words that look nothing alike.
     */
    fun similarity(
        left: String,
        right: String,
    ): Double {
        if (left == right) return 1.0
        if (left.isEmpty() || right.isEmpty()) return 0.0

        val distance = editDistance(left, right)
        val longest = maxOf(left.length, right.length)

        return 1.0 - distance.toDouble() / longest
    }

    /**
     * Levenshtein distance, two rows at a time.
     *
     * Two rows rather than the full matrix because this runs over every recognised line on a screen — dozens of
     * strings, on the thread driving someone's phone. The full matrix is the textbook version and allocates
     * length × length integers for a number we throw away.
     */
    fun editDistance(
        left: String,
        right: String,
    ): Int {
        if (left == right) return 0
        if (left.isEmpty()) return right.length
        if (right.isEmpty()) return left.length

        var previous = IntArray(right.length + 1) { it }
        var current = IntArray(right.length + 1)

        for (i in 1..left.length) {
            current[0] = i

            for (j in 1..right.length) {
                val substitution = previous[j - 1] + if (left[i - 1] == right[j - 1]) 0 else 1
                val insertion = current[j - 1] + 1
                val deletion = previous[j] + 1

                current[j] = minOf(substitution, insertion, deletion)
            }

            val swap = previous
            previous = current
            current = swap
        }

        return previous[right.length]
    }

    /**
     * Similarity for a containment match, from the length ratio.
     *
     * "Continue" inside "Continue to payment" is a weaker signal than "Continue" inside "Continue ", and the
     * ratio says which. Without this, every containment match scored identically and the sort could not tell a
     * precise hit from a line that merely mentions the word.
     */
    private fun containmentSimilarity(
        text: String,
        query: String,
    ): Double {
        val shorter = minOf(text.length, query.length)
        val longer = maxOf(text.length, query.length)

        return if (longer == 0) 0.0 else shorter.toDouble() / longer
    }

    private fun normalise(value: String): String = value.trim().replace(WHITESPACE, " ").lowercase()

    private val WHITESPACE = Regex("\\s+")
}
