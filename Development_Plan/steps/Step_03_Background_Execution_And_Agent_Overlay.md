# Step 3 — Background Execution & Agent Status Overlay

**Milestone:** M6 — A real app. **Closes:** B1, B2. **Depends on:** Step 2.

## Goal

The agent keeps running when the user leaves the app, and the user can see and stop it from wherever they are.

## What is wrong today

This is the most serious defect in the product. Device testing confirmed the sequence: the agent reads the screen correctly, builds a task list, starts executing — then opens the target app, our app goes to background, **and the loop stops**. Returning to the app resumes it.

An automation tool that cannot act while another app is in front is not an automation tool. Every other agent feature is worthless until this is fixed.

The cause is architectural, not a bug in the loop: `runAgent` is driven from `useAgentRun`, a React hook, so its lifetime is the screen's lifetime. When RN's activity is backgrounded the JS timers throttle and the loop stalls. `startAutomationService` exists in `android/automation` and has never been wired to anything.

## Deliverables

- **A foreground service that owns the run.** Starting a run starts the service; the service holds a wake commitment and a persistent notification; the run ends when the goal completes, the user stops it, or a bound is hit.
- **A run lifetime independent of any screen.** Navigating away, backgrounding the app, or unmounting the chat must not stop the agent.
- **The agent status overlay** — a vertical container on the right edge of the screen showing the current task and a stop button.
- **An expanded overlay** — tapping it opens a compact chat showing tool calls, thinking, and results, with a text box for new input, **wired to the same session** as the in-app chat.
- **Reconnection**: returning to the app shows the run still in progress with its full history, not a fresh screen.
- A notification that reflects the current task and offers stop.

## Tasks

1. Decide where the loop lives and record it as an ADR. The options are genuinely different: (a) keep the loop in JS and keep the JS context alive with a foreground service, or (b) move orchestration to Kotlin and call into JS per step. **(a) is strongly preferred** — the loop, memory, and prompt assembly are all TypeScript and tested, and reimplementing them in Kotlin would create a second agent that can disagree with the first. The service's job is to keep the process alive, not to think.
2. Wire `AutomationForegroundService` to the run lifecycle: start on run start, stop on run end, update its notification per step.
3. Move run state out of the component. A module-level run controller, or a store that owns the `AbortController` and the event stream, so no unmount can abort a run. Keep `useAgentRun` as a thin view onto it.
4. Verify JS execution actually continues while backgrounded, and record what was observed. This is the assumption the whole step rests on; if timers throttle harder than expected, that changes the design and is worth knowing early.
5. Build the overlay in `android/overlays` — a second overlay use case beside the node toolset. Reuse `OverlayManager`, extend it if the geometry differs. Collapsed it is a thin right-edge strip; expanded it is a panel.
6. Overlay content as a React root, same pattern as the node toolset: `ReactHost.createSurface`, initial props, released on detach.
7. Wire the overlay to the run controller so it shows live events, and to the session so its text box appends to the same conversation.
8. Stop must work from three places — the overlay, the notification, and the in-app chat — and all three must take effect between steps.
9. Handle the awkward cases: the run finishing while the overlay is expanded, the user revoking overlay permission mid-run, the process being killed by the system.
10. Update `conventions/Permission_Model.md` on the foreground-service and overlay usage.

## Definition of done

- Start a run, leave the app, and the agent keeps working — confirmed on a device, not an emulator.
- The status overlay shows the current task and updates as it changes.
- Stop works from the overlay, the notification, and the chat, and takes effect within one step.
- The expanded overlay shows tool calls and accepts input that lands in the same session.
- Returning to the app shows the run in progress with its history intact.
- Killing and reopening the app does not leave an orphaned service or overlay.
- A run that ends while the overlay is open closes it cleanly.

## Notes for the implementer

- **The service keeps the process alive; it does not become the agent.** Any reasoning that migrates into Kotlin is reasoning the tested loop no longer does.
- The notification is not decoration. It is the user's guarantee that they know when their phone is being driven, and it is required for a foreground service anyway.
- Two overlays now exist and can both be visible — the agent status overlay and a node toolset. Decide their z-order and whether they may coexist. They serve different modes, so the simplest correct answer is that they cannot both be shown.
- Expect the run controller to be the subtle part. The bug to avoid is a second run starting because the first is only tracked by a component that unmounted.

## Skills to load

- `kotlin-native-module`
- `ai-agent-builder`
- `rn-ui-builder-zustand`
- `testing-quality`
