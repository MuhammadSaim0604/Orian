# 0015 — A typed route store, not react-navigation

**Status:** accepted

## Context

The shell needs a real structure for the first time. Onboarding gates the app, a mode switcher chooses between two whole interfaces, and each mode owns a stack of its own screens plus a settings screen. The previous shell — a `useState` tab switch with three modal routes — cannot express any of that.

This decision was deferred twice. Phase 6 judged five destinations not worth a navigator. Phase 8 turned out not to need one either, because the overlay became a second React root in its own window rather than a route. Now it has to be settled.

Two real options:

**react-navigation.** The default answer for a React Native app. Native stack transitions, deep linking, back-button handling, and a large body of documentation.

**A typed route store.** Zustand holding the current mode and the route within it, with the shell rendering from that state.

## Decision

**A typed route store**, in `apps/mobile/src/features/shell/shellStore.ts`.

The shell renders one of: onboarding, the mode switcher, root settings, or a mode. Each mode holds its own route union, and the store keeps them separate so an Agent Mode route cannot be set while Workflow Mode is active.

## Consequences

What this buys:

- **Two modes stay genuinely separate.** ADR 0011 says the modes share no navigation. With one navigator, keeping two parallel stacks honest is a discipline problem; with a discriminated union per mode, an Agent Mode route in Workflow Mode is a **type error**. The rule enforces itself.
- **The store is already shared with the overlays.** Both overlay windows are second React roots and reach app state only through the Zustand store modules they import. Route state in a store is readable there for free; a navigator's state lives inside its own React tree, which the overlay is not part of.
- **Routing is testable without rendering.** Onboarding gating, mode switching, and route resets are store assertions, in the same style as `canvasStore` and `overlayStore`.
- **No new native dependency.** react-navigation needs `react-native-screens`, and pnpm's strict layout has already produced three CI failures from React Native tooling that expected hoisting. The Metro entrypoint trap is the same family of problem.

What it costs, honestly:

- **Transitions are ours to build.** Reanimated is already a dependency and the mode switch needs a bespoke animation anyway, but per-screen push and pop animations are now work rather than a default.
- **The Android back button is ours to wire.** A `BackHandler` reading the store, with each route declaring where back goes. A navigator does this correctly out of the box, and it is the most likely thing to be got wrong.
- **No deep linking.** Nothing needs it today. If an external MCP client or a notification ever has to open a specific workflow, that is the moment to reconsider.

Revisit this if any of three things become true: deep linking is needed, per-screen native transitions start to matter for perceived quality, or route state grows past what one union per mode can describe clearly.
