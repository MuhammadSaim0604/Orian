# Phase 2 — Android Automation Core (Kotlin)

**Milestone:** M2 — Device control. **Depends on:** Phase 1. **Unblocks:** Phase 3.

## Goal

Build the deep-automation Kotlin subsystems that everything else stands on: Accessibility, gestures, screen capture, UI tree parsing, overlays, foreground service, and the Android tool implementations. This is the hardest and most critical layer.

## Deliverables

- `AccessibilityService` implementation that streams/queries the current UI hierarchy.
- **UI Tree Parser** producing a serializable tree of `AccessibilityNodeInfo` (text, resourceId, className, contentDescription, bounds, semantics).
- **Gesture Engine** using `dispatchGesture()` for click, long press, swipe, and coordinate taps.
- **Screen Capture** via MediaProjection producing screenshots.
- **Overlay Manager** for floating windows (`SYSTEM_ALERT_WINDOW`).
- **Foreground Service** keeping automation alive in the background with a persistent notification.
- **App Manager**: launch apps, list packages, current package/activity.
- **Android Tool Layer**: contacts, alarms, clipboard, intents, notifications, system settings, media.
- **Automation Runtime**: the single Kotlin entry point exposing the tool surface listed in `../architecture/System_Architecture.md`.
- Robust **selector resolution** implementing the priority chain (`resourceId → semantics → text/desc → structural → relative → coordinates → vision`).

## Tasks

1. Implement and register the `AccessibilityService`; handle enable/disable and reconnection.
2. Serialize the UI tree to a stable JSON schema (shared with TS side later).
3. Implement gestures and verify on real apps.
4. Implement MediaProjection capture with permission flow.
5. Implement overlay window host (will later render RN content in Phase 8).
6. Implement foreground service + notification channel.
7. Implement each Android tool with clear, typed inputs/outputs.
8. Implement selector resolver with unit + instrumentation tests.
9. Handle permission requests with rationale screens.

## Definition of done

- On a real device: the service reads the UI tree of a third-party app, taps a resolved element, swipes, types text, and captures a screenshot.
- Selector resolver picks the correct element across the priority chain, with tests.
- Foreground service survives app backgrounding.

## Security notes (sensitive)

- Accessibility + overlay + screen capture are high-trust. Gate each behind explicit opt-in with clear explanation. Never enable silently.

## Skills to load

These skills are already installed in your AI agent. Load them before starting this phase:

- `kotlin-native-module`
- `testing-quality`
