# 0012 — The agent loop stays in JavaScript, kept alive by a foreground service

**Status:** accepted

## Context

Device testing found the most serious defect in the product: the agent stops the moment the user leaves the app. It reads the screen, plans, starts executing, opens the target app — and the loop stalls, because `runAgent` is driven from a React hook whose lifetime is the screen's lifetime, and RN's JS timers throttle when the activity is backgrounded.

An automation tool that cannot act while another app is in front is not an automation tool. Two ways to fix it:

**(a)** Keep the loop in TypeScript and keep the JS context alive with a foreground service.
**(b)** Move orchestration to Kotlin, calling into JS for each model round trip.

## Decision

**(a).** The loop, memory, replanning, and prompt assembly stay in `packages/ai-agent` and `packages/prompt-engine`. A foreground service keeps the process alive and holds the notification. The service's job is to keep the process running, not to think.

Run state moves out of the React component into a module-level run controller that owns the `AbortController` and the event stream, so no unmount can abort a run.

## Consequences

- **One agent implementation.** Option (b) would put orchestration in Kotlin while the tested loop stayed in TypeScript, creating two agents that can disagree — and the one on the critical path would be the untested one.
- The loop's four independent stop conditions, its stuck/replan signals, and its structured-output validation are all already built and tested. Option (b) discards that.
- A foreground-service notification becomes mandatory, which is right on its own terms: the user is entitled to know when their phone is being driven.
- Progress must be visible from outside the app, which is why the agent status overlay is part of the same step rather than a later polish item.

## Correction: the foreground service is not sufficient

The consequence above originally read *"it rests on an assumption that must be verified early: that JS execution genuinely continues under a foreground service while backgrounded."*

**It does not.** Device testing found the agent freezing the instant it opened WhatsApp — reporting "Opening com.whatsapp" and going no further until the app was reopened — with the foreground service running throughout.

The cause is in React Native, not in the design. `JavaTimerManager` is a `LifecycleEventListener`:

```kotlin
override fun onHostPause() {
    isPaused.set(true)
    clearFrameCallback()   // removes the TIMERS_EVENTS choreographer callback
}
```

With that callback gone, **`setTimeout` and `setInterval` do not fire at all** — not throttled, stopped. The agent loop awaits timers between steps, so it stalls wherever it had reached. The service keeps the *process* alive, which is a different thing entirely: the timer system is driven by the **activity** lifecycle, and a foreground service has no bearing on it.

`clearFrameCallback` has exactly one escape hatch:

```kotlin
if (frameCallbackPosted && isPaused.get() && !headlessJsTaskContext.hasActiveTasks()) { ... }
```

So the decision stands, with an addition: **a `HeadlessJsTask` is held open for the duration of a run** (`RunKeepAliveModule`, `runKeepAlive.ts`). That keeps the callback posted through `onHostPause`.

Two things about it worth stating plainly, because both are easy to get wrong:

- **The task does no work.** It is a lifetime, not a worker. The run continues on the main JS context. Running the agent *inside* a headless task would give it a second execution context with its own copy of the run controller's module state — precisely what ADR 0016 exists to prevent.
- **It must start before the activity pauses.** `isAllowedInForeground` is true for that reason, and `holdTimersAwake()` is called before the loop begins. A task started on pause would race the callback removal it exists to prevent, and React Native refuses to start a foreground-disallowed task from a resumed activity at all.

The probe stays. It now measures whether the keep-alive works on a given device rather than whether the assumption holds in principle, and `timersHeld` is on the run snapshot so the UI can warn that a run may pause instead of leaving the user to guess why it stalled.
