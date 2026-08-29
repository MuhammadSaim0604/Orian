# 0016 — The run controller is a module, not a component

**Status:** accepted. **Refines:** [0012](0012-agent-loop-in-js-with-foreground-service.md).

## Context

ADR 0012 settled that the agent loop stays in JavaScript, kept alive by a foreground service. It did not say **where in JavaScript the run lives**, and that turned out to be the defect.

`useAgentRun` held everything in `useState` and `useRef`, and unmounted with this:

```ts
useEffect(() => () => {
  mountedRef.current = false;
  controllerRef.current?.abort();
}, []);
```

The reasoning at the time was sound in isolation: a run whose screen is gone has nothing left to show the user what is happening, so abort it. But it makes the run's lifetime the screen's lifetime — and the agent's whole purpose is to work while the user is somewhere else.

That is issue **B1**, and it is architectural rather than a bug in the loop. The loop is fine; it was owned by the wrong thing.

## Decision

**Run state lives in a module-level controller** (`apps/mobile/src/features/agent/runController.ts`), outside React entirely. It owns:

- the `AbortController`,
- the event list and the current task,
- the recorder,
- the foreground-service lifecycle.

`useAgentRun` becomes a thin subscription. Components read; they do not own. **No unmount aborts a run** — only an explicit stop, a completed goal, or a bound being hit.

## Consequences

What this makes possible:

- **The agent survives navigation.** Leaving the chat, switching modes, or backgrounding the app changes nothing about the run. This is the whole point.
- **Both React roots see the same run.** The overlay is a separate root (ADR 0011) and can subscribe to the same module. A run started in the app is visible from the overlay without the two exchanging messages.
- **Stop has one implementation** reachable from three places — chat, overlay, notification — instead of three that can disagree.

What it costs, and what to be careful of:

- **A run can now outlive every screen showing it.** That is deliberate, but it means the exits must be exhaustive. A run that finishes with nothing mounted must still stop the service and clear its state, or the notification outlives the work.
- **The single-run rule has to be enforced in the controller.** With ownership in a component, a second run needed two mounted screens; now it only needs two calls. `start()` refuses while a run is active rather than replacing it — replacing would leave the first loop running with nothing tracking it.
- **State is process-global**, so it does not survive a process death. `START_NOT_STICKY` on the service is the matching decision: a killed run does not silently resume, because a user who did not see it start cannot know why their phone is being driven.
- **Testing needs an explicit reset**, since module state persists between tests. The controller exposes one for that purpose.

## The assumption this rests on

Both ADRs depend on **JavaScript continuing to execute while the app is backgrounded, under a foreground service**. If timers throttle hard enough to stall the loop, keeping it in JS is not viable and orchestration would have to move to Kotlin — which ADR 0012 rejects for good reasons, so it is worth knowing early rather than late.

React Native runs JS on its own thread rather than on a WebView timer, and a foreground service keeps the process out of cached-app states where Doze and App Standby apply. The expectation is therefore that it continues.

But **expectation is not verification**, so Step 3 ships a probe: `backgroundProbe.ts` records wall-clock gaps between ticks during a run, and the agent settings screen surfaces the worst gap observed. If real devices show gaps long enough to matter, this ADR gets a follow-up rather than a workaround.

Recorded here so the assumption is visible rather than implicit. A later reader finding the agent stalling in the background should start with this section.
