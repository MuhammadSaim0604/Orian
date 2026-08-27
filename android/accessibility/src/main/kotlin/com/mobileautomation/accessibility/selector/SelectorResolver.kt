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
    /**
     * The seventh and final strategy. Defaults to unavailable, so a caller that
     * has not configured vision gets the structural chain and an honest report
     * that vision was not attempted.
     */
    private val visionMatcher: VisionMatcher = UnavailableVisionMatcher,
) {
    fun resolve(
        tree: UiTree,
        selector: Selector,
    ): ResolutionResult = resolve(tree.root, selector, tree.packageName, tree.activityName)

    fun resolve(
        root: UiNode,
        selector: Selector,
        treePackageName: String? = null,
        treeActivityName: String? = null,
    ): ResolutionResult {
        if (selector.isEmpty) {
            return ResolutionResult.NotFound(
                attempted = emptyList(),
                reason = "Selector carries no locating information",
            )
        }

        screenMismatchReason(selector, treePackageName, treeActivityName)?.let { reason ->
            return ResolutionResult.NotFound(attempted = emptyList(), reason = reason)
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
                    // Needs a screenshot and a model, so it cannot run inside a
                    // synchronous resolve; see resolveWithVision.
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

    /**
     * Resolves [selector], falling through to vision when the structural chain
     * finds nothing.
     *
     * The complete seven-step chain, and the entry point the agent and workflow
     * engine should use. Kept separate from [resolve] because vision is
     * suspending and costs a model call, so callers that only want the cheap
     * structural strategies are not forced to pay for it.
     */
    suspend fun resolveWithVision(
        tree: UiTree,
        selector: Selector,
    ): ResolutionResult {
        val structural = resolve(tree, selector)
        if (structural.isMatch) return structural

        val notFound = structural as ResolutionResult.NotFound

        // An empty selector or the wrong screen are not vision's problem: there is
        // nothing to look for, or we should not be looking here at all.
        if (notFound.attempted.isEmpty()) return notFound

        if (!visionMatcher.isAvailable) {
            return notFound.copy(
                reason =
                    "${notFound.reason}; vision was not attempted because no screenshot " +
                        "or model is available",
            )
        }

        val attempted = notFound.attempted + SelectorStrategy.VISION

        val match =
            visionMatcher.locate(selector)
                ?: return notFound.copy(
                    attempted = attempted,
                    reason = "${notFound.reason}, and vision found nothing on screen",
                )

        // A vision match may correspond to no accessibility node at all - the usual
        // reason vision was needed - so a synthetic node carries the bounds the
        // gesture layer needs.
        return ResolutionResult.Match(
            node =
                UiNode(
                    text = match.description,
                    bounds = match.bounds,
                    packageName = tree.packageName,
                ),
            strategy = SelectorStrategy.VISION,
            structuralPath = VISION_PATH,
            visionMatch = match,
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

    /**
     * Why [selector] must not be resolved against this screen, or null when it may.
     *
     * A selector recorded on one screen resolving against another is the failure
     * mode this guards: it can find a plausible element and act on the wrong
     * thing, which is worse than not resolving. Both checks skip when the tree
     * does not report its identity, since refusing on missing information would
     * make the resolver unusable against a hand-built tree.
     */
    private fun screenMismatchReason(
        selector: Selector,
        treePackageName: String?,
        treeActivityName: String?,
    ): String? {
        val wantedPackage = selector.packageName
        if (wantedPackage != null && treePackageName != null && wantedPackage != treePackageName) {
            return "Selector targets package $wantedPackage but the screen is $treePackageName"
        }

        val wantedActivity = selector.activityName
        if (wantedActivity != null && treeActivityName != null && wantedActivity != treeActivityName) {
            return "Selector targets activity $wantedActivity but the screen is $treeActivityName"
        }

        return null
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

        /**
         * Structural path reported for a vision match. Not a real path: a vision
         * match often has no node in the tree, so there is none to report.
         */
        const val VISION_PATH: String = "vision"

        private fun String?.equalsIgnoreCase(other: String): Boolean =
            this != null && this.equals(other, ignoreCase = true)
    }
}
