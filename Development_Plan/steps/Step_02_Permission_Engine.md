# Step 2 — Permission Engine

**Milestone:** M6 — A real app. **Closes:** E1, E2, E3, E4, and the permission half of B4. **Depends on:** Step 1.

## Goal

One place that knows every capability the app can use, whether it is granted, how to request it, and why the user should agree. Onboarding grants the **required** set; everything else is requested at the moment it is needed.

## What is wrong today

Permissions are requested ad hoc from whichever screen happens to need one, with no explanation and no distinction between essential and optional. There is no onboarding.

Two capabilities the plan never included at all: **default assistant role**, which gives more precise screen reading, and **usage access**, which gives reliable foreground-app detection.

And one hard bug: **E1** — tapping _Allow Screen Capture_ shows the Android recording dialog, the user allows it, and the app still reports the capability disabled. Either the MediaProjection consent result is not being stored or the status read looks at the wrong thing. This is a blocker for OCR and vision, both of which need a screenshot.

## The two tiers

**Required** — onboarding will not continue without them, because the product does not work at all otherwise:

| Capability | Mechanism | Why |
| --- | --- | --- |
| Accessibility service | user enables in system settings | read the UI tree, dispatch gestures |
| Display over other apps | `SYSTEM_ALERT_WINDOW` | the agent status overlay and the node toolset |
| Default assistant role | assistant role request | more precise screen reading |
| Usage access | `PACKAGE_USAGE_STATS` | reliable foreground-app detection |
| Notifications | `POST_NOTIFICATIONS` | the foreground-service notification |

**Optional** — offered during onboarding, skippable, and requested again at the point of use:

contacts, phone/calling, SMS, calendar, storage, exact alarms, screen capture. Screen capture is optional-but-special: MediaProjection consent is per session and cannot be granted once and forgotten.

## Deliverables

- A **capability registry** — for each capability: id, human name, rationale, tier, the mechanism used to request it, and how to read its current state. One list, in Kotlin, surfaced to TypeScript.
- A **native permission module** that reports state and starts the right request for each capability, including the settings-redirect cases that have no runtime prompt (accessibility, overlay, assistant, usage access).
- **Onboarding permission screens**: required ones first, each with its rationale and a route to grant; then optional ones with a clear _skip_.
- **Just-in-time requests**: adding a node that needs a permission requests it; toggling a tool on requests it.
- **A permissions overview** in root settings: everything, its state, and a route to change it.
- **E1 fixed**, with a test that would have caught it.

## Tasks

1. Read the existing `SensitiveCapability` / `AndroidPermissionGate` in `android/tools` — the shape is already there and should be extended rather than replaced.
2. Add assistant role and usage access to the capability set, each with its state read and its settings intent.
3. **Diagnose E1 properly before fixing it.** The likely candidates: the consent `Intent` result is not being retained past the activity result, the projection token is not being held by anything with a longer life than the request, or the status read asks whether a capture is _currently active_ rather than whether consent exists. Name the actual cause in the commit message — a guess-fix here will recur.
4. Build the permission module: `getCapabilityStates()`, `requestCapability(id)`, and an event when a state changes so the UI updates without polling.
5. Onboarding screens, driven by the registry rather than hand-written per capability. A hand-written screen per permission is how one gets forgotten.
6. A `useCapability(id)` hook for the just-in-time path, returning state and a request function.
7. Wire the node palette: adding a permission-requiring node prompts, and the node is added either way with a visible warning if declined.
8. Wire tools management (Step 4 builds the page; this step provides the mechanism).
9. Permissions overview in root settings.
10. Update `conventions/Permission_Model.md` with the two tiers and the two new capabilities.

## Definition of done

- Onboarding cannot be completed without the five required capabilities, and each explains itself before sending the user anywhere.
- Optional capabilities can be skipped and are requested again when actually needed.
- **Granting screen capture reports as enabled immediately** and stays that way for the session.
- Revoking a permission in system settings is reflected in the app without a restart.
- Adding a contacts node requests contacts.
- Every capability appears in root settings with its live state.
- Denial is handled everywhere: the dependent feature disables with an explanation and the app never loops or crashes.
- Kotlin ktlint and unit tests pass; `gradle :tools:assembleDebug` compiles.

## Notes for the implementer

- **Never fake a grant, never automate the settings screen.** Accessibility-driven automation is already policy-sensitive; automating its own permission grant would be indefensible.
- Read capability state **live** on every check. Caching it means acting on a permission the user revoked a minute ago.
- Assistant role and usage access have no runtime prompt — the app can only deep-link to settings and re-check on resume. Design the UI for that round trip rather than pretending it is a dialog.
- E1 is the one to be rigorous about. Write the test first, watch it fail, then fix.

## Skills to load

- `kotlin-native-module`
- `rn-ui-builder-zustand`
- `testing-quality`
