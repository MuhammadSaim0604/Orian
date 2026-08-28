# 0011 — Two modes, not one tabbed shell

**Status:** accepted — supersedes the tabbed shell built in Phase 6

## Context

The first implementation built the app as a six-tab home screen: Workflows, Agent, Runs, Screen inspector, Status, Provider. Device testing and a re-reading of the product intent showed this is the wrong shape.

The product is two things that share a device runtime and share almost nothing else. Agent Mode is a chat product with sessions and per-session memory. Workflow Mode is a builder with a canvas, a node palette, and its own workflow-building agent. Their navigation, settings, and state have nothing in common.

## Decision

The app is **two modes**, chosen from a mode-switcher screen after onboarding. Each mode is a whole interface with its own navigation stack, settings screen, sessions, and memory. Switching modes replaces the interface wholesale, with a transition animation.

Root settings — provider registry, theme, data management, permissions overview — live at the switcher and are reachable from both modes. Each mode's settings ends with two fixed actions: switch to the other mode, and back to the switcher.

## Consequences

- A tab bar would force both products into one navigation model. Under tabs, "switch modes" has no meaning, and the mode-specific settings screens have nowhere to live.
- Two of the original tabs disappear entirely. **Status** exposed internal phase state to the user. **Screen inspector** read our own screen, because the app in the foreground when you press its button is this one — screen inspection only means anything from an overlay.
- The shell is now deep enough that "a tab switch plus modal routes" no longer covers it. A navigation library or an explicit route store is needed; that choice is Step 1's and gets its own record.
- Onboarding becomes a real flow rather than an afterthought, because the mode switcher needs permissions already granted to be useful.
- The two modes must be kept genuinely separate in code. One shared stack with a `mode` prop rebuilds the tab bar with extra steps.
