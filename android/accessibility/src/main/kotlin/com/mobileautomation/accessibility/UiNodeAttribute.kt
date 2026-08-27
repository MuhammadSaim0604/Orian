package com.mobileautomation.accessibility

/**
 * Attributes the UI tree parser serializes for every node.
 *
 * This contract is shared with the TypeScript layer
 * (`@mobile-automation/screen-inspector`) and with the AI model, so it must stay
 * stable and versioned. The entries and their order match exactly what
 * `UiTreeSerializer` emits - a parity test enforces that, because a key listed
 * here but not emitted (or the reverse) would make the TypeScript side read a
 * field that is never present.
 */
enum class UiNodeAttribute(val key: String) {
    TEXT("text"),
    RESOURCE_ID("resourceId"),
    CLASS_NAME("className"),
    CONTENT_DESCRIPTION("contentDescription"),
    PACKAGE_NAME("packageName"),
    BOUNDS("bounds"),
    CLICKABLE("clickable"),
    LONG_CLICKABLE("longClickable"),
    SCROLLABLE("scrollable"),
    EDITABLE("editable"),
    CHECKABLE("checkable"),
    CHECKED("checked"),
    SELECTED("selected"),
    FOCUSED("focused"),
    ENABLED("enabled"),
    VISIBLE("visible"),
    INDEX("index"),
    CHILDREN("children"),
    ;

    companion object {
        /** Serialization key set, in the order the parser emits them. */
        val keys: List<String> = entries.map { it.key }

        fun fromKey(key: String): UiNodeAttribute? = entries.firstOrNull { it.key == key }
    }
}

/**
 * Keys of the tree envelope that wraps the root node.
 *
 * Separate from [UiNodeAttribute] because these appear once per capture rather
 * than per node, and the TypeScript side validates them separately.
 */
enum class UiTreeAttribute(val key: String) {
    SCHEMA_VERSION("schemaVersion"),
    PACKAGE_NAME("packageName"),
    ACTIVITY_NAME("activityName"),
    CAPTURED_AT_EPOCH_MS("capturedAtEpochMs"),
    SCREEN_WIDTH_PX("screenWidthPx"),
    SCREEN_HEIGHT_PX("screenHeightPx"),
    NODE_COUNT("nodeCount"),
    ROOT("root"),
    ;

    companion object {
        val keys: List<String> = entries.map { it.key }
    }
}

/**
 * Version of the serialized UI tree format. Bump when the shape changes so the
 * TypeScript side can reject a payload it does not understand.
 *
 * Version 2 adds the interaction flags (`longClickable`, `scrollable`,
 * `editable`, `checkable`, `checked`, `selected`, `enabled`, `visible`),
 * `index`, and `children` to the documented attribute set. Version 1 declared
 * only eight keys while the serializer already emitted more.
 */
const val UI_TREE_SCHEMA_VERSION: Int = 2
