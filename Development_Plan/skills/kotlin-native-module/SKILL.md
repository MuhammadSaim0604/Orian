---
name: kotlin-native-module
description: Build Kotlin Android capabilities (Accessibility, gestures, screen capture, overlays, device APIs) and bridge them to React Native via Turbo Modules. Use when implementing or debugging the native Android automation layer.
---

# Skill: Kotlin Native Module Master (for React Native)

## When to use

You are implementing an Android capability in Kotlin (Accessibility, gestures, screen capture, overlays, device APIs) and/or exposing it to React Native through a Turbo Module. Used in Phases 2, 3, and 8.

## Principles

- **Kotlin owns the OS; RN owns the product.** Never push automation logic into JS.
- **One runtime entry point.** All device capabilities are exposed through a single `AutomationRuntime` so both the workflow engine and the AI agent call identical functions.
- **Typed, promise-based bridge.** Every native method returns a resolved value or a typed error — no silent failures.
- **Big payloads by reference.** Pass screenshots and large UI trees by file path or handle, not inline base64, to avoid blocking the JS thread.
- **Selectors over coordinates.** Element targeting resolves through the priority chain; coordinates are a last resort.

## Procedure

### 1. Structure the native modules
Under `android/`, keep focused Gradle modules: `accessibility`, `automation`, `gestures`, `screen`, `overlays`, `tools`. Each has a clear responsibility and its own unit tests.

### 2. Implement the AccessibilityService
- Subclass `AccessibilityService`; declare it in the manifest with an `accessibility-service` config XML.
- Handle connect/disconnect and reconnection; expose the root `AccessibilityNodeInfo`.
- Recycle node infos to avoid leaks.

### 3. Serialize the UI tree
- Walk the node tree into a stable JSON schema: `text, resourceId, className, contentDescription, bounds, clickable, focused, packageName, children[]`.
- This schema is shared with the TS side and the AI — keep it stable and versioned.

### 4. Implement gestures
- Use `dispatchGesture()` with `GestureDescription` for click, long press, and swipe.
- Support both selector-resolved targets and raw coordinate taps.

### 5. Implement the selector resolver
Resolve a target in priority order: `resourceId → accessibility semantics → text/contentDescription → structural UI selector → relative position → coordinates → screenshot/vision fallback`. Return the matched node plus which strategy matched (useful for debugging and for the recorder).

### 6. Screen capture, overlays, foreground service
- Screen capture via MediaProjection; store screenshots to files, return paths.
- Overlay windows via `SYSTEM_ALERT_WINDOW` (`WindowManager` + `TYPE_APPLICATION_OVERLAY`). The overlay can host RN content for the Configure-with-AI toolset.
- A foreground service with a persistent notification keeps automation alive in the background.

### 7. Implement the tool layer
Wrap Android APIs into clean functions: `openApp, listApps, getCurrentScreen, getContacts, createAlarm, read/writeClipboard, sendNotification, launchIntent, getSystemSetting`, plus the accessibility/gesture/screen tools.

### 8. Bridge to React Native (Turbo Module)
- Define a codegen spec listing every method with precise types.
- Implement the Kotlin side delegating to `AutomationRuntime`.
- Add an event emitter for streamed data (UI-tree changes, execution progress).
- Map Kotlin exceptions to typed TS errors.
- Benchmark hot paths; drop to JSI where the bridge is a bottleneck.

## Permissions (sensitive)

Accessibility, overlay, screen capture, and contacts are high-trust. Request each with a clear rationale screen and explicit user opt-in. Never enable silently. Document why each is needed.

## Checklist

- [ ] Modules split by responsibility under `android/`.
- [ ] AccessibilityService reads a third-party app's UI tree on a real device.
- [ ] UI-tree JSON schema is stable and shared.
- [ ] Gestures work for click/long-press/swipe/type.
- [ ] Selector resolver implements the full priority chain, with tests.
- [ ] Screenshots/trees passed by reference; JS thread not blocked.
- [ ] Turbo Module fully typed; wrong args are compile errors.
- [ ] Every sensitive permission is gated behind explicit opt-in.
- [ ] ktlint + JUnit + instrumentation tests pass.
