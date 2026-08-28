# Step 7 — Canvas Rebuild

**Milestone:** M8 — Workflow Mode. **Closes:** C1, C2, C3, G2. **Depends on:** Step 6.

## Goal

A canvas that works on a phone. Nodes that show their labels, a drag that moves the node instead of opening its settings, and zoom controls a thumb can use.

## What is wrong today

Three defects, each on its own enough to make the builder unusable.

**C1 — nodes render as blank white rectangles.** No label, no type, nothing. The canvas cannot be read at all. Skia text drawing is almost certainly the cause: either no font is resolved, or the paint colour matches the fill, or the text is drawn outside the node's clip.

**C2 — drag and selection fight.** Dragging a node often opens its settings instead of moving it; movement feels stuck; and sometimes a node jumps to its dragged position _after_ the settings sheet closes — which says the position was committed to the store but the canvas never repainted. That last symptom is the diagnostic one: the gesture works and the render does not follow.

**C3 — no zoom controls.** Pinch is the only zoom. On a phone that is imprecise, and there is no way back to a sensible view.

## Deliverables

- **Legible nodes**: label, type, and port markers, readable at every zoom level, with a bundled font if Skia's default is the problem.
- **Unambiguous gestures**: tap selects, drag moves, pinch zooms, drag on empty canvas pans. No two fire for one interaction.
- **A repaint that follows the store.** A committed position is visible immediately.
- **Zoom controls**: zoom in, zoom out, fit-to-view, and a reset, as on-screen buttons.
- **Measured frame rate** on a real device with a few dozen nodes (G2), recorded in `tracking.md`.
- Long-press or an explicit affordance to open node settings, rather than a tap that competes with drag.

## Tasks

1. **Fix node text first**, because nothing else can be judged while the canvas is unreadable. Check in this order: is a font actually resolved (Skia needs one explicitly, and a missing font draws nothing rather than erroring); is the paint colour distinct from the node fill; is the text inside the node's clip rect; is the font size sane after the camera transform.
2. Bundle a font if the platform default proves unreliable. It is a size cost, and an unreadable canvas is worse.
3. **Diagnose C2 before changing gesture code.** The "jumps after settings close" symptom points at a repaint problem rather than a gesture problem — a Reanimated shared value updated on the UI thread with no dependency that triggers a Skia redraw, so the frame only lands when something else forces one. Confirm which it is; the fix is different for each.
4. Rework the gesture composition. Tap-to-select and drag-to-move on the same element need an explicit relationship: a movement threshold before the drag activates, and a tap that only fires if the threshold was never crossed. Gesture Handler can express this; the current `Exclusive` composition apparently does not.
5. Move node settings off tap. A tap selects; settings open from a long press or a button on the selection. A gesture that both selects and opens a sheet will always be ambiguous during a drag.
6. Guarantee the repaint. If a shared value drives position, the Skia scene needs something that re-renders when it changes.
7. Zoom controls: in, out, fit-to-view, reset. Fit-to-view already exists in `geometry.ts` and just needs a button.
8. Make sure zoom steps are quantised and clamped so repeated taps cannot reach an unusable scale.
9. Measure the frame rate on a device with 30+ nodes while panning and zooming. Record the numbers, not an impression.
10. Re-check culling and the grid path at the new scale limits.

## Definition of done

- Every node shows its label and type, legibly, at minimum and maximum zoom.
- A drag moves the node. It never opens settings. The node stays where it was dropped, visibly, immediately.
- A tap selects and nothing else.
- Settings open from a deliberate action that cannot be confused with a drag.
- Zoom in, out, fit-to-view, and reset all work and stay within bounds.
- Pinch still zooms about the focal point.
- Frame rate measured on hardware with 30+ nodes and recorded in `tracking.md`.
- Edge drawing still works: ports are still hit-testable before node bodies.

## Notes for the implementer

- **Fix the text before anything else.** Every other judgement about the canvas is unreliable while it cannot be read.
- The "position jumps after the sheet closes" symptom is the most informative bug report in the register. It says the gesture and the store are fine and the render is not. Do not rewrite the gesture layer before ruling that out.
- A movement threshold is what separates a tap from a drag. Without one, every drag begins as a tap and the tap handler wins.
- Keep the good decisions from the first build: camera values on the UI thread committed only on gesture end, ports hit-tested before bodies, a 22px touch radius against a 7px dot, one Group carrying the camera transform. Those are not what is broken.
- Zoom buttons should animate to the new scale rather than jumping, or the canvas feels like it teleports.

## Skills to load

- `rn-ui-builder-zustand`
- `theme-and-styling-nativewind`
- `testing-quality`
