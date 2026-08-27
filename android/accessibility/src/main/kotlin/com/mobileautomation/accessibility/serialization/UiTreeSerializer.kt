package com.mobileautomation.accessibility.serialization

import com.mobileautomation.accessibility.model.Bounds
import com.mobileautomation.accessibility.model.UiNode
import com.mobileautomation.accessibility.model.UiTree

/**
 * Serializes a [UiTree] to the JSON contract shared with the TypeScript layer
 * and with the AI model.
 *
 * **This format is a published contract.** Changing a key or dropping a field
 * requires bumping `UI_TREE_SCHEMA_VERSION` so the other side can reject a
 * payload it does not understand.
 *
 * Output is deterministic: keys are emitted in a fixed order so two captures of
 * the same screen produce byte-identical JSON, which matters for trace diffing
 * and for caching model responses.
 */
object UiTreeSerializer {
    /**
     * Serializes the whole tree.
     *
     * @param compact when true, null and default-valued node fields are omitted.
     *   The AI is charged by the token, so the compact form is what gets sent to
     *   a model; the full form is what the recorder stores.
     */
    fun toJson(
        tree: UiTree,
        compact: Boolean = false,
    ): String {
        val json = JsonBuilder()
        json.beginObject()
        json.name("schemaVersion").value(tree.schemaVersion)
        json.name("packageName").value(tree.packageName)
        json.name("activityName").value(tree.activityName)
        json.name("capturedAtEpochMs").value(tree.capturedAtEpochMs)
        json.name("screenWidthPx").value(tree.screenWidthPx)
        json.name("screenHeightPx").value(tree.screenHeightPx)
        json.name("nodeCount").value(tree.nodeCount)
        json.name("root")
        writeNode(json, tree.root, compact)
        json.endObject()
        return json.build()
    }

    /** Serializes a single node and its subtree. */
    fun nodeToJson(
        node: UiNode,
        compact: Boolean = false,
    ): String {
        val json = JsonBuilder()
        writeNode(json, node, compact)
        return json.build()
    }

    private fun writeNode(
        json: JsonBuilder,
        node: UiNode,
        compact: Boolean,
    ) {
        json.beginObject()

        writeOptionalString(json, "text", node.text, compact)
        writeOptionalString(json, "resourceId", node.resourceId, compact)
        writeOptionalString(json, "className", node.className, compact)
        writeOptionalString(json, "contentDescription", node.contentDescription, compact)
        writeOptionalString(json, "packageName", node.packageName, compact)

        json.name("bounds")
        writeBounds(json, node.bounds)

        writeFlag(json, "clickable", node.clickable, compact, default = false)
        writeFlag(json, "longClickable", node.longClickable, compact, default = false)
        writeFlag(json, "scrollable", node.scrollable, compact, default = false)
        writeFlag(json, "editable", node.editable, compact, default = false)
        writeFlag(json, "checkable", node.checkable, compact, default = false)
        writeFlag(json, "checked", node.checked, compact, default = false)
        writeFlag(json, "selected", node.selected, compact, default = false)
        writeFlag(json, "focused", node.focused, compact, default = false)
        writeFlag(json, "enabled", node.enabled, compact, default = true)
        writeFlag(json, "visible", node.visible, compact, default = true)

        if (!compact || node.index != 0) {
            json.name("index").value(node.index)
        }

        if (!compact || node.children.isNotEmpty()) {
            json.name("children")
            json.beginArray()
            for (child in node.children) {
                writeNode(json, child, compact)
                json.endValue()
            }
            json.endArray()
            json.endValue()
        }

        json.endObject()
    }

    private fun writeBounds(
        json: JsonBuilder,
        bounds: Bounds,
    ) {
        json.beginObject()
        json.name("left").value(bounds.left)
        json.name("top").value(bounds.top)
        json.name("right").value(bounds.right)
        json.name("bottom").value(bounds.bottom)
        json.endObject()
        json.endValue()
    }

    private fun writeOptionalString(
        json: JsonBuilder,
        name: String,
        value: String?,
        compact: Boolean,
    ) {
        if (compact && value.isNullOrBlank()) return
        json.name(name).value(value)
    }

    private fun writeFlag(
        json: JsonBuilder,
        name: String,
        value: Boolean,
        compact: Boolean,
        default: Boolean,
    ) {
        if (compact && value == default) return
        json.name(name).value(value)
    }
}
