package com.mobileautomation.accessibility.selector

/**
 * How an element was located, strongest first.
 *
 * The order is the product's core robustness guarantee (ADR 0009): coordinates
 * break on a different screen size, density, scroll position, or app update, so
 * they are the last resort before vision. Names must match the TypeScript
 * `SELECTOR_STRATEGIES` in `@mobile-automation/workflow-schema`.
 */
enum class SelectorStrategy(val wireName: String) {
    RESOURCE_ID("resourceId"),
    ACCESSIBILITY_SEMANTICS("accessibilitySemantics"),
    TEXT("text"),
    STRUCTURAL("structural"),
    RELATIVE_POSITION("relativePosition"),

    /**
     * Matched by recognising text in a screenshot (ADR 0013, Step 5).
     *
     * Placed **above coordinates and below relative position** deliberately. It is weaker than anything
     * structural, because it depends on what a recogniser read off pixels — but stronger than a raw coordinate,
     * because a text match survives the layout shifting and is *checkable*: the string either matched or it did
     * not, whereas a coordinate is a guess that always "succeeds".
     */
    OCR_TEXT("ocrText"),
    COORDINATES("coordinates"),
    VISION("vision"),
    ;

    /** Lower rank is a stronger match. */
    val rank: Int get() = ordinal

    fun isStrongerThan(other: SelectorStrategy): Boolean = rank < other.rank

    companion object {
        val wireNames: List<String> = entries.map { it.wireName }

        fun fromWireName(name: String): SelectorStrategy? = entries.firstOrNull { it.wireName == name }
    }
}
