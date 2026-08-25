# Phase 6 — Workflow Builder UI

**Milestone:** M3 — Workflows. **Depends on:** Phases 3, 5. **Unblocks:** Phase 8.

## Goal

Build the smooth, professional mobile canvas and node editor — the n8n-style visual builder — in React Native, with Zustand state and the centralized theme.

## Deliverables

- **Workflow Canvas** using Skia + Reanimated + Gesture Handler: pan, zoom, node drag, edge drawing, snapping — 60fps on device.
- **Node Editor**: add nodes from the registry, wire edges, edit config with schema-driven forms.
- **Workflow Debugger** + **Execution Logs** consuming engine events.
- **Screen Inspector** UI showing the live UI tree and screenshots from `screen-inspector`.
- Zustand stores for canvas, selection, execution state (load the `rn-ui-builder-zustand` skill).
- All screens themed via NativeWind + theme tokens.
- Manual and "Create by AI" entry points (AI creation wired in Phase 7).

## Tasks

1. Build the canvas renderer and gesture/camera model on Skia.
2. Implement node components, ports, and edge routing.
3. Build schema-driven config forms (from node config Zod schemas).
4. Wire Zustand stores; keep canvas state normalized and performant.
5. Connect to the workflow engine to run and visualize execution.
6. Build the Screen Inspector view.
7. Persist workflows to SQLite/Room.

## Definition of done

- A user builds a workflow by hand on the canvas, runs it, and watches live execution + logs.
- Canvas stays smooth with dozens of nodes.
- Workflows persist and reload.

## Skills to load

These skills are already installed in your AI agent. Load them before starting this phase:

- `rn-ui-builder-zustand`
- `theme-and-styling-nativewind`
