package com.mobileautomation.accessibility.selector

import com.mobileautomation.accessibility.model.Bounds
import com.mobileautomation.accessibility.model.UiNode
import com.mobileautomation.accessibility.model.UiTree
import kotlin.math.abs

/**
 * Resolves a [Selector] to a node in a captured UI tree.
 *
 * This is the component that makes replay durable. It tries each strategy in
 * priority order and returns the first match along with the strategy that
 * produced it, so callers know how trustworthy the result is:
 *
 * `resourceId → accessibility semantics → text/contentDescription →
 *  structural path → relative position → coordinates → vision`
 *
 * Vision is not implemented here - it needs a screenshot and a model, so it
 * lives above this layer. The resolver reports that it stopped short instead of
 * pretending to have tried.
 *
 * Pure and deterministic: it takes a parsed tree, not a live service, so the
 * whole priority chain is unit-testable.
 */
class SelectorResolver(
    /**
     * How far a candidate's centre may sit from the recorded centre, in pixels,
     * to still count as the same element for relative-position matching. Roughly
     * a finger's width on a typical density - tight enough to avoid matching a
     * neighbouring row, loose enough to survive small layout shifts.
     */
    private val positionTolerancePx: Int = DEFAULT_POSITION_TOLERANCE_PX,
) {
    fun resolve(
        tree: UiTree,
        selector: Selector,
    ): ResolutionResult = resolve(tree.root, selector, tree.packageName)

    fun resolve(
        root: UiNode,
        selector: Selector,
        treePackageName: String? = null,
    ): ResolutionResult {
        if (selector.isEmpty) {
            return ResolutionResult.NotFound(
                attempted = emptyList(),
                reason = "Selector carries no locating information",
            )
        }

        if (!packageMatches(selector, treePackageName)) {
            return ResolutionResult.NotFound(
                attempted = emptyList(),
                reason =
                    "Selector targets package ${selector.packageName} but the screen is $treePackageName",
            )
        }

        val indexed = indexTree(root)
        val candidates = indexed.filter { selector.accepts(it.node) }
        val attempted = mutableListOf<SelectorStrategy>()

        for (strategy in selector.availableStrategies()) {
            attempted.add(strategy)
            val matches =
                when (strategy) {
                    SelectorStrategy.RESOURCE_ID -> matchByResourceId(candidates, selector)
                    SelectorStrategy.ACCESSIBILITY_SEMANTICS -> matchByContentDescription(candidates, selector)
                    SelectorStrategy.TEXT -> matchByText(candidates, selector)
                    SelectorStrategy.STRUCTURAL -> matchByStructuralPath(candidates, selector)
                    SelectorStrategy.RELATIVE_POSITION -> matchByRelativePosition(candidates, selector)
                    SelectorStrategy.COORDINATES -> matchByCoordinates(candidates, selector)
                    SelectorStrategy.VISION -> emptyList()
                }

            val best = pickBest(matches, selector)
            if (best != null) {
                return ResolutionResult.Match(
                    node = best.node,
                    strategy = strategy,
                    structuralPath = best.path,
                    alternativeCount = matches.size - 1,
                )
            }
        }

        return ResolutionResult.NotFound(
            attempted = attempted,
            reason =
                if (attempted.isEmpty()) {
                    "No strategy was applicable to this selector"
                } else {
                    "No node matched after trying ${attempted.joinToString(", ") { it.wireName }}"
                },
        )
    }

    // --- strategies, strongest first ---------------------------------------

    private fun matchByResourceId(
        candidates: List<IndexedNode>,
        selector: Selector,
    ): List<IndexedNode> {
        val wanted = selector.resourceId?.trim().orEmpty()
        if (wanted.isEmpty()) return emptyList()

        // An exact fully-qualified id is unambiguous; prefer it.
        val exact = candidates.filter { it.node.resourceId == wanted }
        if (exact.isNotEmpty()) return exact

        // Fall back to the short name so a selector recorded as `send_button`
        // still matches `com.app:id/send_button`, and vice versa.
        val shortWanted = wanted.substringAfterLast('/')
        return candidates.filter { it.node.resourceIdName == shortWanted }
    }

    private fun matchByContentDescription(
        candidates: List<IndexedNode>,
        selector: Selector,
    ): List<IndexedNode> {
        val wanted = selector.contentDescription?.trim().orEmpty()
        if (wanted.isEmpty()) return emptyList()

        val exact = candidates.filter { it.node.contentDescription?.trim() == wanted }
        if (exact.isNotEmpty() || selector.exactText) return exact

        return candidates.filter { it.node.contentDescription?.trim().equalsIgnoreCase(wanted) }
    }

    private fun matchByText(
        candidates: List<IndexedNode>,
        selector: Selector,
    ): List<IndexedNode> {
        val wanted = selector.text?.trim().orEmpty()
        if (wanted.isEmpty()) return emptyList()

        val exact = candidates.filter { it.node.text?.trim() == wanted }
        if (exact.isNotEmpty() || selector.exactText) return exact

        val caseInsensitive = candidates.filter { it.node.text?.trim().equalsIgnoreCase(wanted) }
        if (caseInsensitive.isNotEmpty()) return caseInsensitive

        // Last resort within this strategy: a label that contains the text.
        // Useful when an app appends a count ("Chats (3)") to a stable label.
        return candidates.filter { candidate ->
            candidate.node.label?.contains(wanted, ignoreCase = true) == true
        }
    }

    private fun matchByStructuralPath(
        candidates: List<IndexedNode>,
        selector: Selector,
    ): List<IndexedNode> {
        val wanted = selector.structuralPath?.trim().orEmpty()
        if (wanted.isEmpty()) return emptyList()
        return candidates.filter { it.path == wanted }
    }

    private fun matchByRelativePosition(
        candidates: List<IndexedNode>,
        selector: Selector,
    ): List<IndexedNode> {
        val recorded = selector.bounds ?: return emptyList()

        val nearby =
            candidates.filter { candidate ->
                centreDistance(candidate.node.bounds, recorded) <= positionTolerancePx
            }
        if (nearby.isEmpty()) return emptyList()

        // Prefer whichever sits closest to where the element used to be.
        val closest = nearby.minOf { centreDistance(it.node.bounds, recorded) }
        return nearby.filter { centreDistance(it.node.bounds, recorded) == closest }
    }

    private fun matchByCoordinates(
        candidates: List<IndexedNode>,
        selector: Selector,
    ): List<IndexedNode> {
        val point =
            selector.coordinates
                ?: selector.bounds?.let { Point(it.centerX, it.centerY) }
                ?: return emptyList()

        val containing = candidates.filter { it.node.bounds.contains(point.x, point.y) }
        if (containing.isEmpty()) return emptyList()

        // Multiple nodes contain any given point because parents contain their
        // children. The smallest one is the actual target.
        val smallestArea = containing.minOf { it.node.bounds.area }
        return containing.filter { it.node.bounds.area == smallestArea }
    }

    // --- helpers ----------------------------------------------------------

    /**
     * Chooses among equally-matching nodes. An actionable node beats a
     * non-actionable one, because tapping a decorative wrapper does nothing;
     * otherwise document order wins so resolution stays deterministic.
     */
    private fun pickBest(
        matches: List<IndexedNode>,
        selector: Selector,
    ): IndexedNode? {
        if (matches.isEmpty()) return null
        if (matches.size == 1) return matches.first()

        val actionable = matches.filter { it.node.isActionable }
        if (actionable.isNotEmpty()) return actionable.first()

        return if (selector.requireActionable) null else matches.first()
    }

    private fun packageMatches(
        selector: Selector,
        treePackageName: String?,
    ): Boolean {
        val wanted = selector.packageName ?: return true
        if (treePackageName == null) return true
        return wanted == treePackageName
    }

    private fun Selector.accepts(node: UiNode): Boolean {
        if (requireActionable && !node.isActionable) return false
        if (!className.isNullOrBlank() && node.className != className) return false
        if (!packageName.isNullOrBlank() && node.packageName != null && node.packageName != packageName) {
            return false
        }
        return true
    }

    private fun centreDistance(
        a: Bounds,
        b: Bounds,
    ): Int = abs(a.centerX - b.centerX) + abs(a.centerY - b.centerY)

    private fun indexTree(root: UiNode): List<IndexedNode> {
        val collected = ArrayList<IndexedNode>()
        indexInto(root, ROOT_PATH, collected)
        return collected
    }

    private fun indexInto(
        node: UiNode,
        path: String,
        into: MutableList<IndexedNode>,
    ) {
        into.add(IndexedNode(node, path))
        node.children.forEachIndexed { index, child ->
            indexInto(child, "$path.$index", into)
        }
    }

    /** A node paired with its structural path from the root. */
    private data class IndexedNode(val node: UiNode, val path: String)

    companion object {
        const val DEFAULT_POSITION_TOLERANCE_PX: Int = 48

        /** Path assigned to the tree root; children extend it as `0.1.2`. */
        const val ROOT_PATH: String = "0"

        private fun String?.equalsIgnoreCase(other: String): Boolean =
            this != null && this.equals(other, ignoreCase = true)
    }
}
