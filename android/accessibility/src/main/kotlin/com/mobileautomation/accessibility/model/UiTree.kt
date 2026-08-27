package com.mobileautomation.accessibility.model

import com.mobileautomation.accessibility.UI_TREE_SCHEMA_VERSION

/**
 * A captured snapshot of the screen: the node hierarchy plus the context needed
 * to know what was on screen at the time.
 *
 * The package and activity are captured alongside the tree because a selector
 * is only meaningful on the screen it was recorded from (ADR 0009), and the
 * recorder needs both to generate a durable workflow node.
 */
data class UiTree(
    val root: UiNode,
    val packageName: String? = null,
    val activityName: String? = null,
    val capturedAtEpochMs: Long = 0L,
    val screenWidthPx: Int = 0,
    val screenHeightPx: Int = 0,
    val schemaVersion: Int = UI_TREE_SCHEMA_VERSION,
) {
    val nodeCount: Int get() = root.size()

    val maxDepth: Int get() = root.depth()

    /** Every node that can be acted on, which is what the AI is offered. */
    fun actionableNodes(): List<UiNode> = root.filter { it.isActionable }

    /** Nodes carrying visible text or an accessibility description. */
    fun labelledNodes(): List<UiNode> = root.filter { it.label != null }
}
