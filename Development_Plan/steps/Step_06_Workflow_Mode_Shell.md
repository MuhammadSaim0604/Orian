# Step 6 — Workflow Mode Shell

**Milestone:** M8 — Workflow Mode. **Closes:** A6 and the workflow half of A5. **Depends on:** Step 1.

## Goal

Give Workflow Mode its own home: a saved-workflows list, a create menu, a real loading screen, and its own settings.

## What is wrong today

The workflow list is a tab rather than a mode home. Opening a workflow jumps straight to the canvas, so the registry build, document parse, and validation happen with nothing on screen (A6) — and if validation fails the user sees an error appear over a blank canvas. Provider settings sit on a tab shared with everything else (A5).

## Deliverables

- **Workflow list** as the mode's home: name, step count, last edited, and a per-row menu (open, run, duplicate, rename, delete).
- **Create menu** — a dropdown offering _manually_ and _with AI agent_, matching the plan's wording.
- **A loading screen** that names what it is doing: loading the document, building the node registry, validating. A workflow that fails to load reports why **here**, not on the canvas.
- **Workflow Mode settings** — default execution bounds, whether to record runs, canvas preferences (grid, snap), a route to the shared provider registry, and the two fixed actions from Step 1.
- **Run history per workflow**, if cheap: last run's outcome and when.
- The Runs / trace review screen moved into this mode, where it belongs.

## Tasks

1. Rework `WorkflowListScreen` into the mode home. Keep the storage layer — it validates on the way in and out, which is right.
2. Row actions. Duplicate and rename are the two that make a list feel like a real one; delete needs a confirmation.
3. Loading screen with genuine progress stages. The stages exist already — they are just currently invisible.
4. Failure path: an invalid document reports its validation issues in readable terms with the option to delete or export it, and never lands on the canvas.
5. Create menu wired to Step 7's canvas and Step 10's builder agent.
6. Workflow Mode settings, ending with _switch mode_ and _back to switcher_.
7. Move the trace review screen (`features/recorder`) into this mode.
8. Empty state: a new user sees an explanation and both create options, not a blank list.

## Definition of done

- The workflow list is the mode's home and shows real metadata per workflow.
- Opening a workflow shows a loading screen, then the canvas.
- A corrupt or invalid workflow reports why, from the list, and does not open.
- Create offers both options and both work.
- Duplicate, rename, and delete work; delete confirms first.
- Workflow Mode settings offers both fixed actions and reaches the shared provider registry.
- The trace review screen is reachable from Workflow Mode.

## Notes for the implementer

- The loading screen is not a spinner for its own sake. Registry build plus document validation is real work, and naming the stage is what turns a two-second freeze into visible progress.
- **Validate on load, and fail in the list.** A workflow that reaches the canvas invalid makes every subsequent canvas operation suspect.
- Duplicate must give the copy a new id and a new name, or saving it overwrites the original.
- Do not reuse Agent Mode's navigation. The two modes are separate stacks; sharing one is how the tab bar comes back.

## Skills to load

- `rn-ui-builder-zustand`
- `theme-and-styling-nativewind`
- `testing-quality`
