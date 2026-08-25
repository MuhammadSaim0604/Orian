---
name: rn-ui-builder-zustand
description: Build professional React Native product UI - workflow canvas, node editor, inspectors, agent UI, and overlay content - with Zustand state and structured feature directories. Use when building RN screens or the canvas.
---

# Skill: React Native Professional UI Builder (with Zustand)

## When to use

You are building React Native product UI — especially the workflow canvas, node editor, inspectors, agent UI, and the Configure-with-AI overlay content. Used in Phases 6 and 8.

## Principles

- **Structured directories.** Group by feature, not by file type. A feature owns its components, hooks, store slice, and types.
- **Zustand for app/UI state; local state for the ephemeral.** Don't put transient input state in global stores.
- **Performance first on the canvas.** Skia + Reanimated + Gesture Handler; keep animations on the UI thread; avoid re-rendering the whole canvas on every gesture frame.
- **Schema-driven forms.** Node config forms are generated from the node's Zod schema, so new nodes get UI for free.
- **Theme everything.** No hardcoded colors/spacing — use theme tokens via NativeWind (see `theme-and-styling-nativewind.md`).

## Suggested feature structure

```
apps/mobile/src/
├── features/
│   ├── canvas/        components/ hooks/ store.ts types.ts
│   ├── node-editor/
│   ├── inspector/
│   ├── agent/
│   ├── overlay/       (Configure-with-AI content)
│   └── logs/
├── navigation/
├── stores/            (cross-feature stores)
└── lib/               (api clients, helpers)
```

## Zustand patterns

- **One store per domain** (canvas, selection, execution, agent). Compose rather than one mega-store.
- **Slice pattern** for large stores: split state + actions into slices merged in `create`.
- **Selector subscriptions**: components subscribe with narrow selectors (`useCanvas(s => s.nodes[id])`) so unrelated updates don't re-render them. Use `useShallow` for object/array selections.
- **Keep actions in the store**, not scattered in components; components call intent-named actions (`addNode`, `connectEdge`, `runWorkflow`).
- **Normalize canvas state**: store `nodes` and `edges` as keyed maps, not arrays, for O(1) updates.
- **Transient gesture values** (drag offsets, zoom) live in Reanimated shared values, not Zustand — commit to the store only on gesture end.
- Persist workflows to SQLite/Room, not into the store; the store holds the working copy.

## Canvas procedure

1. Build the camera model (pan/zoom) with Reanimated shared values.
2. Render nodes and edges with Skia; edges as bezier paths between resolved ports.
3. Handle gestures with Gesture Handler: pan canvas, drag node, draw edge, tap to select.
4. Commit position changes to the Zustand store on gesture end.
5. Virtualize/skip off-screen nodes if counts grow large.

## Node editor procedure

1. Read the selected node's config Zod schema from the registry.
2. Generate form fields from the schema (string, number, enum, selector, nested).
3. Validate on change; write valid config back to the store.
4. Provide the "Configure with AI" entry that opens the overlay (Phase 8).

## Checklist

- [ ] Features are self-contained (components/hooks/store/types).
- [ ] Stores are per-domain with narrow selector subscriptions.
- [ ] Canvas stays ~60fps with dozens of nodes; gestures on UI thread.
- [ ] Canvas state normalized as keyed maps.
- [ ] Config forms generated from Zod schemas.
- [ ] No hardcoded style values; theme tokens only.
- [ ] Working copy in store; persisted copy in SQLite.
