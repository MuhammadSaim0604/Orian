package com.mobileautomation.automation

import com.mobileautomation.accessibility.model.Bounds
import com.mobileautomation.accessibility.selector.OcrMatcher
import com.mobileautomation.accessibility.selector.OcrTextMatch
import com.mobileautomation.accessibility.selector.Selector
import com.mobileautomation.ocr.OcrMatchKind
import com.mobileautomation.ocr.ScreenTextSource

/**
 * Connects the OCR module to the selector chain's sixth rung.
 *
 * Lives in `:automation` rather than in either module it joins, and that placement is the point. `:accessibility`
 * declares `OcrMatcher` as an interface and must never depend on `:ocr` — ADR 0017 requires OCR to be independent
 * of the accessibility tree, because the screens that need OCR are exactly the ones whose tree is empty, and a
 * dependency in either direction would make the fallback chain circular. `:automation` already depends on both,
 * so the adapter belongs here.
 *
 * Nothing but conversion happens here: no matching, no thresholds, no coordinate arithmetic. Those live in
 * `OcrTextMatcher` and `OcrScaling` where they are unit-tested off a device. A second implementation of any of
 * them would eventually disagree with the first, and the failure would be a tap landing one row off while
 * reporting success.
 */
class ScreenTextOcrMatcher(
    private val reader: ScreenTextSource,
) : OcrMatcher {
    override val isAvailable: Boolean get() = reader.isAvailable

    override suspend fun locate(selector: Selector): OcrTextMatch? {
        // Only the selector's text is usable. A resourceId does not appear on screen and a structural path is
        // not something a recogniser can see, so anything else gives OCR nothing to look for.
        val wanted = selector.text?.takeIf { it.isNotBlank() } ?: return null

        // `exactText` is honoured rather than ignored: a selector recorded with an exact-text requirement was
        // recorded that way for a reason, and quietly relaxing it here would make the resolver tap something the
        // author explicitly excluded.
        val search = reader.findText(wanted, exact = selector.exactText)

        val match = search.matchOrNull ?: return null

        return OcrTextMatch(
            bounds =
                Bounds(
                    left = match.block.bounds.left,
                    top = match.block.bounds.top,
                    right = match.block.bounds.right,
                    bottom = match.block.bounds.bottom,
                ),
            recognisedText = match.block.text,
            confidence = match.block.confidence,
            // Only the fuzzy rung tolerated a misread. Containment did not bend any characters - it found the
            // query inside a longer line - so calling it fuzzy would overstate the risk and make the recorder
            // flag durable steps as weak.
            wasFuzzy = match.kind == OcrMatchKind.FUZZY,
        )
    }
}
