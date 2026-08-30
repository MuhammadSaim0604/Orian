# Permission Model

This app requests some of the most powerful permissions Android offers. Every one is requested with an explicit rationale and gated behind user opt-in. Nothing is enabled silently.

## Guiding rules

1. **Never enable a sensitive capability silently.** Each requires an in-app rationale before the system prompt or settings redirect.
2. **Two tiers.** A small **required** set is granted during onboarding, because the product does not function without it. Everything else is **optional** and requested at the moment of need.
3. **Never fake a grant and never automate the settings screen.** Accessibility-driven automation is already policy-sensitive; automating its own permission grant would be indefensible.
4. **Read state live.** Capability state is checked on every use, never cached. A cached value means acting on a permission the user revoked a minute ago.
5. **Degrade gracefully.** If a permission is denied, the dependent feature disables with a clear explanation. The app must not crash or nag in a loop.
6. **Revocable.** The user can turn any capability off from system settings, and the app must notice without a restart.
7. **Visible when active.** Automation running in the background always shows a persistent foreground-service notification.
8. **Secrets are separate.** AI provider keys are not an Android permission concern — they live in Keystore-backed storage, are never logged, and never enter prompts.

## Tier 1 — required, granted during onboarding

Onboarding cannot be completed without these. The product does not work at all otherwise, and the gate is enforced in code: `CapabilityRegistry.requiredCapabilitiesGranted()` consults this tier and nothing else.

| Capability | Mechanism | Why it is needed |
| --- | --- | --- |
| **Accessibility service** | user enables in system settings | Read the on-screen UI hierarchy and dispatch gestures — the core of all automation |
| **Display over other apps** | `SYSTEM_ALERT_WINDOW` | The agent status overlay and the node toolset overlay must stay on top of other apps |
| **Default assistant role** | assistant role request | More precise screen reading than Accessibility alone provides |
| **Usage access** | `PACKAGE_USAGE_STATS` | Reliable detection of which app is in the foreground |
| **Notifications** | `POST_NOTIFICATIONS` | The foreground-service notification, which is how the user knows automation is running |

Four of the five have **no runtime prompt** — they can only be granted in system settings. The app explains each, deep-links to the right settings page, and re-checks on resume. Onboarding is designed around that round trip rather than pretending it is a dialog.

### Two state reads that are not what they look like

Both cost real time to get right, and both fail in the direction of a false positive — the app believing it has a permission it does not.

- **Usage access is an appop, not a permission.** `PACKAGE_USAGE_STATS` must be declared in the manifest, but `checkSelfPermission` then returns *granted* purely because of that declaration, whether or not the user ever allowed it. The only honest read is `AppOpsManager.unsafeCheckOpNoThrow(OPSTR_GET_USAGE_STATS, …)`; `MODE_DEFAULT` means "fall back to the permission check", so it is confirmed rather than assumed either way.
- **The assistant role needs services, not just a permission.** Android builds the "Default digital assistant app" list from **installed voice-interaction services**, so an app that requests the role without declaring one never appears in the picker at all — the deep link works, the list is correct, and the app is simply absent. `android/assistant` declares the three services the platform requires: a `VoiceInteractionService`, a session service, and a recognition service (required by `VoiceInteractionServiceInfo` even for an assistant that does no speech recognition — a missing one makes the whole service fail to parse, silently). The state is read via `RoleManager.isRoleHeld(ROLE_ASSISTANT)` from API 29, falling back to the non-public `assistant` secure setting, compared by **package prefix** so renaming our own service cannot report the role as lost.

## The four grant mechanisms

Every capability declares one, because conflating them is what makes permission UI feel broken. The mechanism decides how the UI behaves, not just how the request is made.

| Mechanism | Resolves with a result? | What the UI must do |
| --- | --- | --- |
| `runtime_prompt` | yes, via callback | show a dialog, await the answer, label the button "Allow" |
| `settings_screen` | **no** | deep-link, tell the user to come back, re-read on resume, label the button "Open settings" |
| `session_consent` | yes, but only for this session | request per session; "granted" is never permanent |
| `install_time` | n/a | nothing to request; absence means the build is wrong |

The second row is the one that shapes the code. A settings grant has **no callback at all**, so anything that awaits it waits forever — which is why `requestCapability` resolves with `settings_opened` rather than a boolean, and why the app carries an `AppState` resume listener rather than trusting an event.

## Tier 2 — optional, requested at the moment of need

Offered during onboarding with a clear *skip*, and requested again when something actually needs them.

| Capability | Mechanism | Requested when |
| --- | --- | --- |
| **Screen capture** | `MediaProjection` (per-session consent) | OCR, vision fallback, or a screenshot tool is first used |
| **Contacts** | `READ_CONTACTS` | A contacts node is added, or the contacts tool is enabled |
| **Phone / calling** | `CALL_PHONE` | A calling node is added, or the calling tool is enabled |
| **SMS** | `SEND_SMS`, `READ_SMS` | An SMS node is added, or the SMS tool is enabled |
| **Calendar** | `READ_CALENDAR`, `WRITE_CALENDAR` | A calendar node is added or its tool enabled |
| **Exact alarms** | `SCHEDULE_EXACT_ALARM` | An alarm node is added, or a time trigger is configured |
| **Query installed apps** | `QUERY_ALL_PACKAGES` | `openApp` / `listApps` resolve a package name |
| **Network** | `INTERNET` | Any call to the configured provider |

Two just-in-time paths, both required:

- **Adding a node** that needs a capability requests it there and then. The node is added either way, with a visible warning if declined — a workflow with a step that cannot run is better than a silently missing step.
- **Toggling a tool on** in Agent Mode's tools management page requests it. A tool whose permission is already granted simply enables.

## Accessibility service — the highest-trust grant

This is the permission that makes the product possible and the one most open to abuse.

- A dedicated onboarding screen explains in plain language that the service can read screen content and perform taps and swipes on the user's behalf, and that it is used only for automations the user creates or requests.
- The user is then taken to system Accessibility settings. The app never fakes or automates that grant.
- The app shows the current service state and a one-tap route to disable it.
- If the service dies or is revoked mid-run, the run stops cleanly and says why.
- Screen content is processed on-device by default. It leaves the device **only** when the user runs an AI feature, and only to the provider they configured.

## Screen capture and OCR

- MediaProjection consent is requested per session. The app does not attempt to persist a capture token across reboots.
- **Granting consent must immediately reflect as enabled.** This was a confirmed defect (issue E1) with an instructive cause: the status object's fallback path hardcoded `canCaptureScreen = false`, and that path was taken whenever the accessibility service was off — so a user who had just granted screen recording was told it had not worked, because a *different* permission was missing. **Every capability is now read independently.** A status object that lies about one capability because another is absent is worse than no status at all.
- **OCR runs entirely on-device.** Recognised text never leaves the phone. A cloud OCR service would silently break the promise that screen content goes only to the configured provider.
- Screenshots are written to app-private storage, referenced from the database by path, deleted with their trace, and wipeable from root settings.
- A screenshot is sent to the AI provider only when a vision feature the user invoked needs it.

## Overlays

Two overlay windows exist and both need `SYSTEM_ALERT_WINDOW`:

- **The agent status overlay** — shows the running agent's task with a stop button. This is a transparency feature as much as a convenience: the user must be able to see and stop automation from wherever they are.
- **The node toolset overlay** — lets the user configure a node against a live screen.

Both use `FLAG_NOT_FOCUSABLE` so they never steal touches meant for the app underneath, paired with `FLAG_ALT_FOCUSABLE_IM` so the keyboard still opens for their own text fields. That pairing matters twice over for the status overlay: the agent is actively tapping the app underneath, so an overlay that took focus would interfere with the automation it is reporting on.

**They are mutually exclusive** (Step 3, `OverlayExclusivity`). Never both on screen, for a reason that is about honesty rather than layout: the status overlay carries a stop button, and with a toolset panel also floating it would not be clear what that button stops. The rule is last-one-wins — showing one evicts the other — because refusing the second would mean telling a user they cannot see their running agent while a panel from the other mode is open.

**A denied or revoked overlay permission never blocks a run.** `showAgentOverlay` reports whether the window appeared and the run continues either way. The automation is the point; the strip is how the user watches it. Refusing to work because a status window could not be drawn would be the worse failure.

## Foreground service

Required for the agent to keep running while the user is in another app. Without it the JS context is throttled and the loop stalls, which was issue B1 — the most serious defect the product had.

- **The service keeps the process alive; it does not become the agent** (ADR 0012). No reasoning moves into Kotlin, because a second agent implementation could disagree with the tested one.
- **The notification is mandatory and always reflects the current task**, with a stop action. It is the user's guarantee that they know when their phone is being driven.
- **It is stopped on every exit from a run** — success, failure, abort, and the early return when no provider key is configured. Every path routes through one `finish` in the run controller for exactly this reason: a notification outliving the work tells the user their phone is being driven when it is not, which is worse than no notification at all.
- **`START_NOT_STICKY`.** A killed service does not silently restart. A user who did not see a run start cannot know why their phone is being driven, so a new run must be started deliberately.
- **Stop from the notification aborts the loop, not just the service.** The action is delivered to the service, which broadcasts before calling `stopSelf` — order matters, because killing the service alone would leave the agent running with no notification left to stop it from.

### The assumption underneath

All of this rests on JavaScript continuing to execute while the app is backgrounded. **The foreground service alone does not achieve that**, which device testing proved: RN's `JavaTimerManager` clears the timer choreographer callback in `onHostPause`, so `setTimeout` stops firing entirely and the loop stalls with the service running. A `HeadlessJsTask` held open for the run keeps the callback posted — see the correction in ADR 0012.

The app still measures it rather than assuming the fix works everywhere: `backgroundProbe` records the worst wall-clock gap during a run, Agent Mode settings reports it, and `timersHeld` on the run snapshot lets the overlay warn that a run may pause before the user walks away.

## Screen capture

A MediaProjection session, granted **per session and never persisted** — the user re-grants after every restart, and the app does not try to work around that.

**From API 34 a `mediaProjection` foreground service must already be running before `getMediaProjection` is called**, or it throws. That is a separate service from the automation one, because a service declares a single foreground type and the two are different claims: *an automation is driving the phone* versus *the screen is being recorded*. Getting this wrong is not a subtle failure — the user grants recording in the system dialog, the call throws, and the app reports the capability as off with nothing to indicate their grant was accepted and then discarded.

**Waiting for that service is necessarily asynchronous, and getting it wrong crashes the process.** `startForegroundService` only *posts* `onStartCommand` to the main thread. A first version polled `getMediaProjection` with `Thread.sleep` from `onActivityResult` — which runs on the main thread — so the service could not start until the polling gave up, every attempt failed, and the failure path then stopped a service whose start had never been honoured. Android killed the app with `ForegroundServiceDidNotStartInTimeException`.

Two rules follow, both now enforced in code:

- **The service reports when it is ready**; nothing waits on the main thread for it. `ScreenCaptureService.start` takes a callback, and `attachScreenCapture` is callback-shaped for the same reason.
- **Never stop a start that has not completed.** `stop` is called only once the service is genuinely in the foreground; otherwise the service stops itself after reporting failure.

The service is stopped with the session. A notification saying the screen can be read must not outlive the ability to read it.

**Consent accepted but capture unavailable is a failure, not a decline.** They resolve differently on purpose: declining resolves `false` and the UI explains the consequence, while a service that could not start **rejects** with an actionable message. Reporting the second as the first would tell a user who agreed that they had refused.

**Status reads distinguish "off" from "unknown".** They are different claims: off means the user has not granted this and Settings is where to go; unknown means the app could not tell. Reporting a failed read as three revoked permissions sends the user to fix something that was never broken, which is what happened when a capture failure made the accessibility and overlay rows flip off with it.

## MCP server and clients

The MCP server exposes full device control to an external client, which makes it the highest-risk surface in the product.

- **Authentication is mandatory.** There is no anonymous mode.
- **Localhost-only by default.** Binding to a network interface requires an explicit user action with an unambiguous warning.
- Every tool invocation is validated and audit-logged, without secrets.
- Destructive tools require a grant beyond mere connection — every tool definition carries an `impact` field for exactly this.
- The provider key must never be reachable over MCP, directly or through a tool that echoes settings.

As a **client**, external MCP servers' tools are merged into Agent Mode's tool set but marked as external. A user should never be unsure whether a tool runs on their phone or someone else's server.

## Where this lives in code

One registry, so a new capability appears everywhere at once rather than being added to four screens and forgotten in a fifth.

| Piece | Responsibility |
| --- | --- |
| `android/tools/SensitiveCapability.kt` | the capability list, with tier and grant mechanism |
| `android/tools/PermissionRationale.kt` | title, explanation, consequence, settings action — exhaustive `when`, so a capability with no rationale does not compile |
| `android/tools/AndroidPermissionGate.kt` | the live state read for each one |
| `android/assistant/` | the voice-interaction services that put the app in the assistant picker — declaration only, no runtime caller |
| `android/tools/CapabilityRegistry.kt` | pairs state with a `CapabilityRequest`; holds no Android types, so it is unit-testable |
| `apps/mobile/android/…/permissions/PermissionsModule.kt` | the bridge: launches prompts and settings intents, emits `capabilitiesChanged` |
| `apps/mobile/src/features/permissions/` | the typed view, the store, `useCapability`, and the shared `CapabilityRow` |

Two rules the structure enforces:

- **The registry describes a request; it does not perform one.** Launching an intent needs an Activity, which belongs to the React Native layer.
- **All rationale copy comes from Kotlin.** A screen that wrote its own explanation could describe a permission differently from the rationale the model requires, and the two would drift.

## Privacy posture

- No analytics or telemetry that includes screen content, UI trees, OCR text, or contact data.
- Traces, screenshots, and sessions stay on-device unless the user exports them.
- The user can wipe all traces, screenshots, workflows, and sessions from root settings.

## Distribution caveat

Accessibility-driven automation has Play Store policy implications. Sideload-versus-Play distribution is still an open question, decided in Step 13. The permission model above is written to satisfy the stricter (Play) reading regardless of the final channel.
