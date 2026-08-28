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
- It rests on an assumption that must be verified early: **that JS execution genuinely continues under a foreground service while backgrounded.** If timers throttle harder than expected, this decision needs revisiting, so Step 3 verifies it explicitly and records what was observed.
- Progress must be visible from outside the app, which is why the agent status overlay is part of the same step rather than a later polish item.
