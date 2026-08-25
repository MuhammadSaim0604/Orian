# Permission Model

This app requests some of the most powerful permissions Android offers. Every one is requested with an explicit rationale, gated behind user opt-in, and introduced only in the phase that needs it. Nothing is enabled silently.

## Guiding rules

1. **Never enable a sensitive capability silently.** Each requires an in-app rationale screen before the system prompt or settings redirect.
2. **Request at the moment of need**, not all at once on first launch.
3. **Degrade gracefully.** If a permission is denied, the dependent feature is disabled with a clear explanation - the app must not crash or nag in a loop.
4. **Revocable.** The user can turn any capability off from Settings inside the app, and the app must stop using it immediately.
5. **Visible when active.** Automation running in the background always shows a persistent foreground-service notification.
6. **Secrets are separate.** AI provider keys are not an Android permission concern - they live in Keystore-backed secure storage, are never logged, and never enter prompts.

## The sensitive surface

| Capability | Mechanism | Why it is needed | Introduced |
|-----------|-----------|------------------|-----------|
| **Accessibility service** | `AccessibilityService` (user enables in system settings) | Read the on-screen UI hierarchy and dispatch gestures - the core of all automation | Phase 2 |
| **Overlay window** | `SYSTEM_ALERT_WINDOW` | The Configure-with-AI floating toolset must stay on top of other apps | Phase 2 (host), Phase 8 (feature) |
| **Foreground service** | `FOREGROUND_SERVICE` + notification channel | Keep automation alive while the user is in another app | Phase 2 |
| **Screen capture** | `MediaProjection` (per-session user consent) | Screenshots for AI screen reasoning and the vision fallback selector | Phase 2 |
| **Contacts** | `READ_CONTACTS` | Resolve a person by name for goals such as "message Robert" | Phase 2 (tool), on demand at runtime |
| **Alarms / scheduling** | `SCHEDULE_EXACT_ALARM`, AlarmManager | The `createAlarm` tool and time-based workflow triggers | Phase 2 (tool) |
| **Notifications** | `POST_NOTIFICATIONS` | Foreground-service notification and workflow result notices | Phase 2 |
| **Query installed apps** | `QUERY_ALL_PACKAGES` | `openApp` / `listApps` need to resolve package names | Phase 2 |
| **Network** | `INTERNET` | Calls to the configured Chat Completions provider | Phase 7 |

## Accessibility service - the highest-trust grant

This is the permission that makes the product possible and also the one most open to abuse. Treatment:

- A dedicated onboarding screen explains, in plain language, that the service can read screen content and perform taps and swipes on the user's behalf, and that it is used only to run automations the user creates or requests.
- The user is then taken to system Accessibility settings; the app never fakes or automates that grant.
- The app shows the current service state and a one-tap route to disable it.
- Screen content is processed on-device by default. It leaves the device **only** when the user runs an AI feature, and only to the provider they configured.

## Screen capture

- MediaProjection consent is requested per session; the app does not attempt to persist a capture token across reboots.
- Screenshots are written to app-private storage, referenced from the database by path, and are deletable from Settings.
- A screenshot is sent to the AI provider only when an AI feature that needs vision is invoked.

## MCP server (Phase 10)

The MCP server exposes full device control to an external client, which makes it the highest-risk network surface in the product.

- **Authentication is mandatory.** There is no anonymous mode.
- **Localhost-only by default.** Binding to a network interface requires an explicit user action with an unambiguous warning.
- Every tool invocation is validated and audit-logged (without secrets).

## Privacy posture

- No analytics or telemetry that includes screen content, UI trees, or contact data.
- Traces and screenshots stay on-device unless the user exports them.
- The user can wipe all traces, screenshots, and workflows from Settings.

## Distribution caveat

Accessibility-driven automation has Play Store policy implications. Sideload-versus-Play distribution is an open question flagged in Phase 0; the permission model above is written to satisfy the stricter (Play) reading regardless of the final channel.
