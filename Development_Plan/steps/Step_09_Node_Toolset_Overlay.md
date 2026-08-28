# Step 9 — Node Toolset Overlay

**Milestone:** M8 — Workflow Mode. **Closes:** C5, C6, and the capability half of A4. **Depends on:** Step 7, Step 8, and Step 5 (for OCR in the toolset).

## Goal

The feature the original plan described and the first implementation did not deliver: open a floating toolset from a node, walk to the app you are automating, and configure the node **against the real screen**.

## What is wrong today

**C5 — tapping Configure with AI crashes the app.** The concept is right, the schema pipeline is tested, and the window wiring fails on a device. Phase 8 rewrote `OverlayReactHost` from `ReactRootView` to `ReactHost.createSurface` after discovering the old API does not work under the new architecture; the crash suggests that rewrite is still not correct on hardware — a null surface, a view attached twice, or a window added before the React host is ready.

**C6 — the button appears on every node**, including nodes with nothing on screen to target. A `variable` node has no element to inspect.

**A4** — the deleted Screen Inspector tab's capability belongs here. Screen inspection only means something from an overlay, standing on the target app; from inside our app it reads our own screen.

## Which nodes get a toolset

Only nodes that target something on screen:

- `click`, `longPress`, `swipe`, `typeText`
- `findElement`, `waitForElement`
- `condition` — when its condition is about screen state
- the OCR node from Step 5

Not `openApp`, `variable`, `transform`, `loop`, `notification`, `alarm`, `clipboard`. Offering a screen toolset for a node with no screen target is noise, and it teaches the user the button is meaningless.

## Deliverables

- **A toolset that opens without crashing**, or reports precisely why it cannot.
- **Open toolset** on screen-targeting nodes only, named as the plan names it — the AI is one tool inside the toolset, not the whole thing.
- **The tools**: current node, screen identity, UI tree, screenshot, element inspector, coordinate inspector, **OCR**, test action, ask AI.
- **Compact by default with an eye toggle**, never covering the screen being configured.
- **Element picking** from the live screen, writing a durable selector into the node.
- **Test action** that runs the resolution and shows the result, never the destructive action.
- **Ask AI** returning a config validated against the node's own Zod schema, offered rather than applied silently.
- **Draggable**, so it can be moved off whatever it is covering.

## Tasks

1. **Diagnose the crash on a device before changing anything.** Get the actual stack trace via logcat. The candidates: `reactHost` null at call time, `createSurface` returning null and the empty-container path being wrong, the surface's view already having a parent, `WindowManager.addView` throwing because the permission was revoked between check and add, or the second React root failing to register. Fix the cause named by the trace, not the most likely guess.
2. Verify the overlay permission immediately before adding the window, and treat a denial as the expected case with a settings route.
3. Restrict the button to the node types listed above. Drive it from a predicate on the node type, not a hard-coded list in the UI — the OCR node and future third-party nodes need to opt in.
4. Rename the entry point to **Open toolset**. The AI is one tool inside it.
5. Add OCR to the toolset: run it on the current screen, list recognised text, and let the user pick a string as the target.
6. Reuse `features/inspector/inspectScreen.ts`, kept alive in Step 1 — element flattening and selector scoring are exactly what the element inspector needs.
7. Make the overlay draggable. `moveOverlay` exists and clamps correctly; it has never had a gesture wired to it. A drag handle in the header, not the whole panel, or dragging will conflict with the tool row.
8. Element picking writes a **durable** selector, and the row says how durable, as the old screen inspector did.
9. Coordinate inspector keeps its real job: probe a point, find a real element there if one exists, and upgrade the selection away from the coordinate.
10. Test action: resolution only. Testing a `click` resolves the element; it does not tap. Testing `typeText` checks the field exists; it does not type.
11. Ask AI: keep the existing pipeline — `buildNodeConfigContext`, `parseStructured`, validation against the node's own schema, two attempts with the error fed back. Add OCR text to the context so the model can see text the tree does not expose.
12. Decide the interaction with the agent status overlay from Step 3. Simplest correct answer: they belong to different modes and cannot both be visible.

## Definition of done

- Opening the toolset on a `click` node works on a device — no crash.
- If overlay permission is missing, the app says so and offers settings.
- The toolset stays visible when the user switches to another app.
- It is compact by default and the eye toggle reveals the rest.
- It can be dragged and stays on screen.
- The element inspector lists the **target app's** elements, not ours, and picking one writes a durable selector.
- OCR lists recognised text and a string can be picked as the target.
- Test action resolves without performing the action.
- **The definition-of-done scenario:** on a condition node, open the toolset, switch to WhatsApp, type "Return true if the Send button is visible", and get `{ condition: { type: "element_exists", selector: { text: "Send" } } }` back — applied only when accepted.
- Nodes with no screen target do not offer the toolset.

## Notes for the implementer

- **Get the stack trace first.** C5 is the one bug in the register where guessing is most likely to produce a second wrong fix; the Phase 8 write-up already contains one rewrite that was necessary but evidently insufficient.
- The two window flags matter and are easy to lose: `FLAG_NOT_FOCUSABLE` stops the overlay stealing touches meant for the app underneath, and `FLAG_ALT_FOCUSABLE_IM` is what still lets the keyboard open for the overlay's own field. Without the second, the user cannot type the instruction the feature exists to accept.
- A proposal is **offered, not applied**. The user is standing in another app and cannot see the node change.
- The overlay is a second React root and shares state only through the Zustand store module both roots import. That is what makes an accepted config land in the canvas store with the node editor updating itself.
- Release the surface when the window detaches, or every session leaks one.

## Skills to load

- `kotlin-native-module`
- `rn-ui-builder-zustand`
- `ai-agent-builder`
- `prompt-engine`
- `testing-quality`
