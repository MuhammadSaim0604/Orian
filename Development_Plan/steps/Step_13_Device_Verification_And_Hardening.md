# Step 13 — Device Verification & Hardening

**Milestone:** M10 — Platform. **Closes:** G1, G3, G5, G6. **Depends on:** every previous step.

## Goal

Prove the whole product on real hardware, then make it survivable: recover from the failures a phone actually produces, and ship a properly signed release.

## What is wrong today

Every layer has been built and tested against fakes. **Almost nothing has been proven against hardware** — and the device testing that has happened is exactly what produced the issue register, which is the argument for doing this deliberately rather than incidentally.

Outstanding from earlier phases: no workflow has ever run end to end on a device (G1), the agent has never completed the WhatsApp scenario on hardware (G3), Room persistence has never been verified across a restart (G5), and the release APK is debug-signed because signing secrets are unset (G6).

## The verification chain

One session, in this order, because each step feeds the next and a failure localises itself:

1. **Onboarding** — fresh install, grant the five required permissions, reach the mode switcher. Confirm screen capture reports as enabled (E1).
2. **Agent Mode** — run the WhatsApp scenario with a real provider key. Confirm it **continues while WhatsApp is in the foreground** and the status overlay shows progress (B1, B2, G3).
3. **OCR** — run it on an app whose accessibility tree is empty, and tap something found only by OCR (F1).
4. **The recorder** — confirm the run above produced a trace with screenshots (G4).
5. **Generation** — compile that trace into a workflow and review it.
6. **Workflow execution** — run it from the canvas. This exercises the engine, the bridge, and the Kotlin core in one pass (G1).
7. **The canvas** — judge and measure it while doing the above: node text legible, drag correct, zoom usable, frame rate with 30+ nodes (C1, C2, C3, G2).
8. **The node toolset overlay** — open it on one of the generated steps, switch to WhatsApp, and configure it with AI (C5).
9. **Persistence** — force-stop, reopen, and confirm workflows, traces, sessions, and provider config all survived (G5).

Record what happened at each stage in `tracking.md`, including anything that worked but felt wrong. A subjective observation about the canvas is worth more than a passing test.

## Hardening

The failures a phone produces that a fake never will:

- **The accessibility service dies or is revoked mid-run.** Detect it, stop cleanly, tell the user.
- **Screen capture consent expires.** Re-request, or degrade to tree-only perception.
- **The foreground service is killed.** Report it rather than leaving a dead run showing as active.
- **The target app updates and selectors stop resolving.** Fail with the selector that failed and which strategy it tried, not just "element not found".
- **The provider is unreachable or rate-limits.** Back off, report, and keep the session intact.
- **The device rotates**, or a fold changes the screen. Overlay geometry must recover.
- **Storage fills.** Screenshot writes fail; the run should not.
- **Two runs at once** — prevent it, or make it explicit.

## Release readiness

- **Signing** — set `ANDROID_KEYSTORE_BASE64` and friends so the release APK is genuinely signed (G6). It has been debug-signed since Phase 1.
- **ProGuard/R8** — verify the release build does not strip something reflection depends on. Room and the bridge are the risks.
- **Size** — measure the APK; a bundled font and an OCR model both add weight.
- **Startup time** — measure cold start, since the shell now does onboarding checks and registry building.
- **The distribution question** — accessibility-driven automation has Play Store policy implications, flagged since Phase 0 and still open. Decide sideload versus Play, and record it as an ADR.

## Definition of done

- Every stage of the verification chain has been run on a physical device and recorded in `tracking.md`.
- The WhatsApp scenario completes while the agent is outside the app.
- A generated workflow runs from the canvas on hardware.
- OCR resolves a target on a screen the tree cannot describe.
- All data survives a force-stop and reopen.
- Every hardening case above is either handled or documented as accepted.
- The release APK is properly signed and installs.
- APK size and cold-start time measured and recorded.
- The distribution decision is made and recorded.
- Both CI workflows green.

## Notes for the implementer

- **Follow the chain in order.** Each stage feeds the next, so a failure localises itself. Run them out of order and a failure is ambiguous across every layer.
- Record the subjective observations. "The canvas felt fine but panning stuttered when the log was open" is the kind of thing no test will tell you and every user will notice.
- Hardening is not polish. An automation tool that leaves a dead run showing as active is worse than one that fails loudly.
- Do not skip the persistence check. Room has never been verified across a real restart, and it holds everything the user has made.
- Signing should be done early in this step, not last — an unsigned release APK is not something to discover at the end.

## Skills to load

- `testing-quality`
- `kotlin-native-module`
- `monorepo-master`
