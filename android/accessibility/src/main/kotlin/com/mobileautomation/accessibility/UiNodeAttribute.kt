package com.mobileautomation.accessibility

/**
 * Attributes the UI tree parser serializes for every node.
 *
 * This contract is shared with the TypeScript layer (`screen-inspector`) and
 * with the AI model, so it must stay stable and versioned. The parser itself
 * lands in Phase 2.
 */
enum class UiNodeAttribute(val key: String) {
    TEXT("text"),
    RESOURCE_ID("resourceId"),
    CLASS_NAME("className"),
    CONTENT_DESCRIPTION("contentDescription"),
    BOUNDS("bounds"),
    CLICKABLE("clickable"),
    FOCUSED("focused"),
    PACKAGE_NAME("packageName"),
    ;

    companion object {
        /** Serialization key set, in the order the parser emits them. */
        val keys: List<String> = entries.map { it.key }

        fun fromKey(key: String): UiNodeAttribute? = entries.firstOrNull { it.key == key }
    }
}

/**
 * Version of the serialized UI tree format. Bump when the shape changes so the
 * TypeScript side can reject a payload it does not understand.
 */
const val UI_TREE_SCHEMA_VERSION: Int = 1
