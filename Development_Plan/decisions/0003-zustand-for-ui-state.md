# ADR 0003 - Zustand for UI state

**Status:** Accepted

## Context

The workflow canvas is the most state-heavy screen in the app: dozens of nodes and edges, selection, drag state, zoom/pan, live execution status, and inspector panels. Re-rendering the whole canvas on every state change is unacceptable. Options considered: Redux Toolkit, Jotai/Recoil, React Context, and Zustand.

## Decision

Use **Zustand** for UI and app state, with one store per domain (canvas, selection, execution, agent) composed from slices.

Conventions:

- Components subscribe with **narrow selectors** so unrelated updates do not re-render them.
- Canvas state is **normalized** as keyed maps (`nodes`, `edges`), not arrays.
- **Transient gesture values** (drag offset, zoom) live in Reanimated shared values and are committed to the store only on gesture end.
- Actions live in the store with intent names (`addNode`, `connectEdge`, `runWorkflow`).

## Consequences

- **Positive:** minimal boilerplate, selector-level subscriptions, no provider tree, works well outside React (engine callbacks can update stores).
- **Negative:** less prescriptive than Redux, so conventions must be enforced by review.
- **Rule that follows:** persisted workflows live in SQLite; the store holds only the working copy.
