# Step 5 — OCR & the Perception Chain

**Milestone:** M7 — Agent Mode. **Closes:** F1, F2, G7. **Depends on:** Step 4 (for the tools page) and Step 2 (for screen-capture consent).

## Goal

Give both modes a way to see screens the Accessibility tree does not describe. On-device OCR returning recognised text with bounding boxes, exposed as an agent tool and a workflow node, plus the vision fallback finally wired.

## What is wrong today

The original plan assumed the Accessibility tree was sufficient. It is not — some apps expose almost nothing, and on those screens the agent is blind and the automation simply cannot be built. There is no fallback of any kind.

Separately, `SelectorResolver` still defaults to `UnavailableVisionMatcher`, so the seventh step of the selector chain reports "vision was not attempted" and resolution stops at coordinates. The plumbing was built in Phase 2 and never connected.

## The perception chain

Three ways to see a screen, tried in order, with the AI choosing how far it needs to go:

1. **Accessibility UI tree** — fastest, richest, gives real selectors that survive layout changes. Always first.
2. **OCR** — recognise text on a screenshot, return each string with its bounding box. Coordinates derived from a text match are far better than coordinates guessed from a screenshot, and they are checkable: the text either matches or it does not.
3. **Vision** — hand the screenshot to a vision-capable model and let it name coordinates. Last resort, slowest, and the only one that costs money per look.

OCR sits between them because it is on-device, cheap, and verifiable.

## Deliverables

- **A Kotlin OCR module** — on-device text recognition over a captured screenshot, returning blocks with text, bounding box, and confidence. On-device only; screen content must not go to a cloud OCR service.
- **An `ocr` tool** in `tool-sdk` and the Android runtime: recognise the current screen, optionally filtered to text matching a query, returning matches with their boxes and centre points.
- **An OCR workflow node** in `android-nodes`, configurable: what text to look for, exact or fuzzy match, whether to fail or continue when absent, and where to put the result.
- **`findTextOnScreen`** — the convenience the agent will actually reach for: give it a string, get back the best matching box and a tappable point.
- **An OCR-backed selector strategy** in the Kotlin resolver, inserted between relative position and raw coordinates, and reflected in `workflow-schema`'s `SELECTOR_STRATEGIES`.
- **A working `VisionMatcher`** replacing `UnavailableVisionMatcher`, using the active provider.
- **A TypeScript parity test** for the UI-tree attribute lists (G7) — nothing currently catches a stale TS copy.
- OCR exposed in the tools page with its own toggle, and over MCP in Step 12.

## Tasks

1. Choose the OCR engine and record it as an ADR. On-device text recognition via ML Kit is the obvious candidate; the decision that matters is **on-device, no network**, and the reasoning should say so.
2. New Gradle module `android/ocr`, depending on `screen` for the bitmap. It must not depend on `accessibility` — OCR is an independent way of seeing.
3. Recognition: bitmap in, blocks out, each with text, bounds, and confidence. Bounds in the same coordinate space as the accessibility tree, or the results cannot be tapped.
4. Text matching: exact, case-insensitive, and fuzzy. Fuzzy matters because OCR misreads characters, and a strict match will fail on a screen a human can read perfectly.
5. Wire into `AutomationRuntime` as `runOcr` and `findTextOnScreen`. **Both `DeviceTool` and `TOOL_NAMES` in the same commit**, plus both parity tests — that contract is duplicated on purpose and the build fails if it drifts.
6. Extend the bridge and `packages/native-automation`.
7. Add the OCR node to `android-nodes` with its Zod config, and extend `NODE_TO_TOOL`.
8. OCR selector strategy in `SelectorResolver`: when nothing else matches, OCR the screen, find the text, tap its centre. Report `ocrText` as the matched strategy so the recorder and the review UI can say how fragile it is.
9. Add `ocrText` to `SELECTOR_STRATEGIES` in `workflow-schema`, positioned between `relativePosition` and `coordinates`. Update `strategyRank` and `isFragileStrategy` — an OCR match is more durable than a coordinate and less than a resourceId.
10. Implement `VisionMatcher` against the provider: screenshot plus the target description, expect coordinates back, validate they are on screen before using them.
11. Prompt work: tell the model the chain exists and when to descend it. The failure to avoid is a model that reaches for OCR first because it is mentioned last.
12. Add the TS-side parity test for `UI_NODE_ATTRIBUTES` / `UI_TREE_ATTRIBUTES` (G7).

## Definition of done

- OCR returns text with usable bounding boxes on a real screen.
- `findTextOnScreen('Send')` returns a point that actually taps Send on an app whose tree is empty.
- The agent uses the tree first and only falls back — verifiable from a trace.
- An OCR node can be added to a workflow, configured, and run.
- `ocrText` appears in the selector chain and in the recorder's durability reporting.
- The vision fallback resolves a target the other six strategies could not.
- OCR appears in the tools page with a toggle.
- Kotlin ktlint and unit tests pass; `gradle :ocr:assembleDebug` compiles; both tool-name parity tests pass.

## Notes for the implementer

- **On-device only.** Screen content leaves the phone only for the provider the user configured, and only for a vision call they triggered. A cloud OCR service would break that promise silently.
- Coordinate spaces are the trap. A screenshot may be scaled relative to the accessibility tree's coordinates; get the transform right or every OCR tap lands slightly wrong.
- Fuzzy matching is not optional. OCR reads `l` as `1` and `O` as `0`, and an exact match will fail on text a human reads without noticing.
- Adding a tool touches five places: `DeviceTool.kt`, `tool-sdk`'s `TOOL_NAMES`, both parity tests, and the TS wrapper. All in one commit.
- OCR is slower than a tree read. It must not become the default path just because it is more reliable on the worst screens.

## Skills to load

- `kotlin-native-module`
- `node-sdk-author`
- `prompt-engine`
- `monorepo-master`
- `testing-quality`
