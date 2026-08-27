package com.mobileautomation.accessibility.selector

import com.mobileautomation.accessibility.model.Bounds

/**
 * A description of the element to act on, carrying every clue captured at record
 * time so the resolver can fall back when the strongest clue stops matching.
 *
 * A selector is never a single locator - that is the whole point. Recording only
 * `x, y` produces automation that breaks on the next screen size; recording the
 * full chain produces automation that survives layout changes (ADR 0009).
 *
 * All fields are optional so a selector can be built from whatever the recorder
 * managed to capture, but [isEmpty] selectors resolve to nothing.
 */
data class Selector(
    /** Fully-qualified (`com.app:id/send`) or short (`send`) resource id. */
    val resourceId: String? = null,
    val contentDescription: String? = null,
    val text: String? = null,
    val className: String? = null,
    /** Structural path of child indices from the root, e.g. `0.2.1`. */
    val structuralPath: String? = null,
    /** Bounds recorded at capture time, used for relative and coordinate matching. */
    val bounds: Bounds? = null,
    /** Explicit tap point, used only when nothing else identifies the element. */
    val coordinates: Point? = null,
    /** Restricts matching to this package, so a selector cannot fire on the wrong app. */
    val packageName: String? = null,
    /** Require the match to be actionable (clickable/editable, enabled, non-empty). */
    val requireActionable: Boolean = false,
    /** Match text exactly rather than case-insensitively and trimmed. */
    val exactText: Boolean = false,
) {
    val isEmpty: Boolean
        get() =
            resourceId.isNullOrBlank() &&
                contentDescription.isNullOrBlank() &&
                text.isNullOrBlank() &&
                structuralPath.isNullOrBlank() &&
                bounds == null &&
                coordinates == null

    /** Strategies this selector carries enough information to attempt, in order. */
    fun availableStrategies(): List<SelectorStrategy> =
        buildList {
            if (!resourceId.isNullOrBlank()) add(SelectorStrategy.RESOURCE_ID)
            if (!contentDescription.isNullOrBlank()) add(SelectorStrategy.ACCESSIBILITY_SEMANTICS)
            if (!text.isNullOrBlank()) add(SelectorStrategy.TEXT)
            if (!structuralPath.isNullOrBlank()) add(SelectorStrategy.STRUCTURAL)
            if (bounds != null) {
                add(SelectorStrategy.RELATIVE_POSITION)
                add(SelectorStrategy.COORDINATES)
            } else if (coordinates != null) {
                add(SelectorStrategy.COORDINATES)
            }
        }

    companion object {
        fun byResourceId(
            resourceId: String,
            packageName: String? = null,
        ): Selector = Selector(resourceId = resourceId, packageName = packageName)

        fun byText(
            text: String,
            exact: Boolean = false,
        ): Selector = Selector(text = text, exactText = exact)

        fun byContentDescription(description: String): Selector = Selector(contentDescription = description)

        fun byCoordinates(
            x: Int,
            y: Int,
        ): Selector = Selector(coordinates = Point(x, y))
    }
}

/** A point on screen in device pixels. */
data class Point(val x: Int, val y: Int)
