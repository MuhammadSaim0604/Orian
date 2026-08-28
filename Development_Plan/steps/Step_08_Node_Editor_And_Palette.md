# Step 8 — Node Editor & Palette

**Milestone:** M8 — Workflow Mode. **Closes:** C4. **Depends on:** Step 7.

## Goal

Make adding and configuring a node pleasant: a searchable palette, forms that behave, and nodes that ask for the permission they need.

## What is wrong today

The add-step dialog is a flat categorised list with no search (C4). With 28 node types today and third-party packages to come, that is already awkward and will get worse.

The schema-driven form itself is sound — `describeSchema` renders a form for any node type, including one the UI has never seen, and that is what makes third-party nodes real. What it lacks is polish: a selector field that cannot be filled from the screen without leaving the editor, no permission awareness, and no indication of which fields matter.

## Deliverables

- **Search in the palette** — by name, description, and category, with the categorised list as the browse view.
- **Recently used nodes** at the top, since automation is repetitive.
- **Permission-aware adding** — a node needing a capability requests it when added, and shows a warning if declined.
- **A form pass**: required fields marked, validation errors placed on the field, and a selector field that offers the toolset overlay from Step 9.
- **Node deletion and duplication** from the inspector.
- **A visible indication of node validity** on the canvas, so an unconfigured node is obvious before a run fails.

## Tasks

1. Search over the registry: match name, description, category, and node type. Case-insensitive, substring, and cheap enough to run per keystroke over a few hundred entries.
2. Keep the categorised browse view for discovery. Search is for people who know what they want; categories are for people who do not.
3. Recently-used list, persisted, capped at a handful.
4. Mark nodes that need a permission in the palette, and request it on add via Step 2's `useCapability`.
5. Form pass: required-field marks, per-field errors, and clearer grouping for nodes with many fields.
6. Selector fields get an **Open toolset** button (Step 9 implements the overlay; this step provides the entry point) alongside manual entry.
7. Node validity on the canvas: a node whose config fails its own schema is marked, and the inspector says which field.
8. Duplicate a node with its config, offset on the canvas, with a new id.
9. Keep `describeSchema` as the only path to a form. Any hand-written form for a specific node type breaks third-party nodes.

## Definition of done

- The palette has a search box that finds a node by partial name or description.
- Categories still browse.
- Recently-used nodes appear first and persist across restarts.
- Adding a contacts node requests contacts.
- A node with an invalid config is visibly marked on the canvas, and the inspector names the field.
- A selector field offers both manual entry and the toolset overlay.
- Duplicating a node produces an independent copy.
- No node type has a hand-written form.

## Notes for the implementer

- **`describeSchema` stays the only form path.** A hand-written form for one node type is how third-party node support quietly stops working.
- Search should match the description, not just the name. A user looking for "tap" should find `click`.
- The existing form rule is right and worth preserving: validate on every change, but only write back when the problem is not in the field being edited — that is what lets fields be filled in any order.
- Node validity on the canvas is the cheapest possible improvement to the run experience. A run that fails on step four because step four was never configured is a bad way to find out.

## Skills to load

- `rn-ui-builder-zustand`
- `node-sdk-author`
- `testing-quality`
