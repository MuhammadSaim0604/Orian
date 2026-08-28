# Step 1 — App Shell & Onboarding

**Milestone:** M6 — A real app. **Closes:** A1, A2, A3, A4, A5. **Unblocks:** every other step.

## Goal

Replace the tabbed home screen with the real product shape: **Welcome → permission setup → mode switcher → a mode.** Give each mode its own navigation and settings, put root settings where both can reach them, and delete the screens that should not exist.

## What is wrong today

`apps/mobile/src/features/shell/RootScreen.tsx` is a six-tab switch — Workflows, Agent, Runs, Screen inspector, Status, Provider — plus three modal routes. A user's first launch lands on the workflow list with no permissions granted and nothing explained.

A tab bar is the wrong shape. The product is two modes that share a runtime and share nothing else: different navigation, different settings, different sessions, different memory. Tabs imply they are peers within one interface, which forces both into the same navigation model and makes "switch modes" meaningless.

Two of the six tabs should not exist at all. **Status** exposes internal phase state to the user. **Screen inspector** reads our own screen, because the app in the foreground when you press its button is this one — it can only mean something from an overlay.

## Deliverables

- A **welcome screen**: what the app does and what it will need, in plain language.
- An **onboarding flow** that runs once, with its completion persisted. Step 2 fills in the permission screens; this step builds the flow and the gate.
- A **mode switcher**: two large actions (Agent Mode, Workflow Mode) plus root settings. This is "home".
- **Root settings**: AI provider registry, theme, data management (wipe traces, screenshots, workflows), and a permissions overview.
- **Two mode shells**, each owning its own navigation stack, its own settings screen, and a transition animation on entry.
- Each mode's settings ends with two fixed actions: **switch to the other mode** and **back to the mode switcher**.
- `Status` and `Screen inspector` tabs deleted.
- A navigation decision recorded as an ADR — the shell is now deep enough that "a tab switch plus modal routes" no longer covers it.

## Tasks

1. Decide the navigation approach and record it. Two real options: adopt react-navigation now that there are nested stacks per mode, or build an explicit route store. Whichever is chosen, the reasoning goes in an ADR because this decision was deferred twice already.
2. Build a `shellStore` holding onboarding completion, the active mode, and the route within it. Persist onboarding completion and last-used mode; do **not** persist the in-mode route — resuming into a half-built canvas is worse than starting at the mode's home.
3. Welcome screen.
4. Mode switcher, with the transition animation. The animation is the user's signal that the whole interface changed rather than a tab.
5. Root settings, with the provider registry stubbed for Step 4 to fill in.
6. Agent Mode shell — an empty stack with its settings screen. Step 4 fills it.
7. Workflow Mode shell — an empty stack with its settings screen. Step 6 fills it.
8. Move what is worth keeping out of the Status tab (accessibility service state, screen-capture state) into each mode's settings, then delete the tab and `StatusScreen`/`PhaseStatusCard`.
9. Delete the Screen Inspector tab and `ScreenInspectorScreen`. **Keep `features/inspector/inspectScreen.ts`** — the element-flattening and selector-scoring logic is exactly what the node toolset overlay needs in Step 9.
10. Rewire the existing screens (workflow list, agent, runs, provider settings) into whichever mode owns them, unchanged for now.

## Definition of done

- A first launch shows Welcome, then permission setup, then the mode switcher — never the canvas.
- A later launch skips onboarding and opens the mode switcher.
- Entering a mode replaces the whole interface, with an animation.
- Both modes' settings offer _switch mode_ and _back to switcher_, and both work.
- Root settings are reachable from the switcher and from both modes.
- No Status tab and no Screen Inspector tab anywhere in the app.
- `inspectScreen.ts` still exists and still has a caller (or is documented as reserved for Step 9).
- `pnpm turbo run typecheck lint test build` passes; the release bundle builds.

## Notes for the implementer

- **Do not persist the in-mode route.** Restoring into a canvas whose workflow may have changed on disk is a bug waiting to happen; each mode reopens at its home.
- The mode switcher is not a splash screen. It is where the user returns, so it needs to look like a destination.
- Deleting a screen means deleting its store slice too. A dead selector left behind is the kind of thing an architect review finds six weeks later.
- Keep the two mode shells genuinely separate from the start. The temptation is one shared stack with a `mode` prop; that rebuilds the tab bar with extra steps.

## Skills to load

- `rn-ui-builder-zustand`
- `theme-and-styling-nativewind`
- `testing-quality`
