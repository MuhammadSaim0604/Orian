# 0013 — Perception is a fallback chain: tree, then OCR, then vision

**Status:** accepted

## Context

The original plan assumed the Accessibility UI tree was sufficient to read any screen. Device testing disproved it: some apps expose almost nothing through Accessibility — custom-rendered UIs, games, and anything drawing its own text. On those screens the agent is blind and the automation cannot be built at all.

The vision fallback was designed in Phase 2 and never wired; `SelectorResolver` still defaults to `UnavailableVisionMatcher`.

## Decision

Perception is a **three-stage fallback chain**, and the AI decides how far to descend:

1. **Accessibility UI tree** — always first. Fastest, richest, and the only source that yields durable selectors.
2. **OCR** — on-device text recognition over a screenshot, returning strings with bounding boxes.
3. **Vision** — the screenshot to a vision-capable model, which names coordinates.

OCR is a first-class subsystem: a Kotlin module, an agent tool, and a workflow node. `ocrText` is inserted into the selector priority chain between relative position and raw coordinates.

## Consequences

- OCR sits above coordinates because a text match **survives layout shifts and is checkable** — the text either matches or it does not. A raw coordinate is neither.
- OCR sits below a tree text match because OCR misreads characters. Fuzzy matching is therefore mandatory, not an enhancement: an exact match will fail on text a human reads without noticing.
- **On-device only.** A cloud OCR service would silently break the promise that screen content leaves the phone only for the provider the user configured. This constrains engine choice and is the point of the decision.
- Coordinate spaces must line up. A screenshot may be scaled relative to the tree's coordinates, and getting the transform wrong makes every OCR-derived tap land slightly off.
- The prompt must describe the chain and when to descend it. The failure to avoid is a model reaching for OCR first because it is cheaper to explain.
- Vision is the only stage that costs money per look, which is the other reason it is last.
