# Phase 3 — Native Bridge (Turbo Modules / JSI)

**Milestone:** M2 — Device control. **Depends on:** Phase 2. **Unblocks:** Phase 6, and TS access for Phases 5/7/9.

## Goal

Expose the Kotlin Automation Runtime to TypeScript through React Native Turbo Modules (JSI where performance matters), with a fully typed, promise-based API.

## Deliverables

- Turbo Module spec(s) mirroring the Android tool surface.
- Typed TS wrappers in a package consumed by `android-nodes`, `ai-agent`, and `screen-inspector`.
- Event channel for streaming (e.g., UI tree changes, execution progress) from Kotlin to RN.
- Error mapping from Kotlin exceptions to typed TS errors.

## Tasks

1. Define the Turbo Module interface (codegen spec) covering `click, swipe, longPress, typeText, findElement, waitForElement, getUiTree, takeScreenshot, pressBack, pressHome, openApp, listApps, getCurrentScreen, getContacts, createAlarm, read/writeClipboard, sendNotification, launchIntent, getSystemSetting`.
2. Implement the Kotlin side of the module bound to the Automation Runtime.
3. Generate and publish typed TS wrappers.
4. Add an event emitter for streamed data (large payloads like screenshots passed by reference/file path, not inline where possible).
5. Benchmark UI-tree/screenshot transfer; move hot paths to JSI if needed.

## Definition of done

- From RN JS/TS, calling `automation.getUiTree()` and `automation.click(selector)` drives a real device.
- Types flow end-to-end; a wrong argument is a compile error.
- Screenshot transfer does not block the JS thread.

## Skills to load

These skills are already installed in your AI agent. Load them before starting this phase:

- `kotlin-native-module`
