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
