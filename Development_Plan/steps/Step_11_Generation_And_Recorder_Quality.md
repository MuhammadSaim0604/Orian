# Step 11 — Generation & Recorder Quality

**Milestone:** M9 — Intelligence quality. **Closes:** D2 (recorder half), G4, G8. **Depends on:** Step 10, Step 5.

## Goal

Make a recorded run compile into a workflow that actually replays. Capture screenshots per step, teach the generator about OCR selectors, and guard the contract nothing currently checks.

## What is wrong today

The recorder and the generator are sound in structure — the trace is rich, the compilation is deterministic, and the generator upgrades a text match to a resourceId where it can. What has never been proven is that the result **replays**. Step 13 tests that on hardware; this step removes the known reasons it would fail.

**G4 — no screenshot per step.** The path field, the directory, and the cleanup all exist; nothing captures. A trace without screenshots is harder to review and gives the vision fallback nothing to work from.

**G8 — `NODE_TO_TOOL` and `TOOL_TO_NODE` have no parity test.** They are inverse maps in different packages. If a tool is added to one and not the other, a recorded step silently produces no node — reported as "no workflow step exists for this action yet", which reads like a known limitation rather than a bug.

And OCR arrives in Step 5, so the generator needs to understand an OCR-matched target.

## Deliverables

- **A screenshot per recorded step**, captured on the same consent as everything else, written to the trace's directory, referenced by path.
- **A capture policy** — downscaled, capped in count, pruned with the trace. A full-resolution image per step across twenty traces is real storage.
- **OCR in the trace and the generator**: a step resolved by OCR records the matched text, and the generated node uses an OCR selector rather than falling to a coordinate.
- **A parity test** for `NODE_TO_TOOL` ↔ `TOOL_TO_NODE` (G8).
- **Better replay checking**: an unwired condition branch, a loop with no body, a selector scoped to a screen the workflow never reaches.
- **The review screen showing screenshots**, since a step is far easier to judge with its screen next to it.

## Tasks

1. Capture in the recorder path: after each tool executes, take a screenshot and store the path. **The recorder must not own capture logic** — the capture belongs where the tool result is produced, and the recorder records the path it is given. That boundary is deliberate and worth keeping.
2. Capture policy: downscale before writing, cap per trace, and reuse the existing prune-on-write. Record the chosen resolution and why.
3. Make capture failure non-fatal. A screenshot is for the human; a trace without one is still generatable.
4. Record the OCR match when a step resolved that way: the text, its box, and `ocrText` as the matched strategy.
5. Teach `improveSelector` about OCR: an OCR text match ranks above a raw coordinate and below a text match from the tree. Say so in the node's rationale, as the other strategies do.
6. Parity test for the two node/tool maps, in whichever package can see both.
7. Extend `checkReplay`: a condition with an unwired branch, a loop with no body, a node whose selector names a screen the trace never visited. These are exactly the failures a generated workflow exhibits.
8. Show screenshots in the trace review screen, per step, lazily.
9. Re-check the durability score now that OCR is in the chain — the normalisation divides by the worst rank and the chain has grown by one.

## Definition of done

- Every recorded step has a screenshot, or a recorded reason it does not.
- Screenshots are downscaled, capped, and deleted with their trace.
- A trace with no screenshots still generates a workflow.
- A step resolved by OCR generates a node with an OCR selector, not a coordinate.
- The node/tool parity test fails if either map gains an entry alone.
- `checkReplay` catches an unwired condition branch and a bodyless loop.
- The review screen shows each step's screenshot.
- Storage stays bounded across twenty traces — measured, not assumed.

## Notes for the implementer

- **Keep the recorder free of capture logic.** It consumes an event and records what it is given; two places deciding what a step is would be one too many, and that separation is why the recorder is testable without a device.
- Downscale before writing, not after. A full-resolution PNG per step is tens of megabytes per trace.
- Capture must never fail a run. The screenshot is a review aid, not part of the automation.
- OCR's place in the chain is a judgement worth stating: a text match from OCR is more durable than a coordinate because it survives layout shifts, and less durable than a tree text match because OCR misreads characters.
- The replay checks being added are the ones that would have caught D2. Write them against a deliberately broken workflow first.

## Skills to load

- `node-sdk-author`
- `ai-agent-builder`
- `testing-quality`
