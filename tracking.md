# Tracking

Living record of what has been implemented, what is complete, and what remains. Updated after every phase and, from Step 1 onward, after every step (per `IMPORTANT_RULES.txt` rule 6). **History is never rewritten — only appended.**

Authoritative plan: `Development_Plan/`. It was restructured from **phases** to **steps** after device testing (commit `b0c1c60`); phases 0–9 are complete and everything since is a numbered step. See `Development_Plan/03_Issue_Register.md` for the defect IDs each step closes.

Last updated: after Step 3, with both CI workflows green on `main` (Android CI run `33243497410`, TypeScript CI run `33243497411`).

---

## Status

### Phases 0–9 — the engines (all complete)

| Phase | Scope                                                | Milestone         | Status       |
| ----- | ---------------------------------------------------- | ----------------- | ------------ |
| 0     | Foundation & decisions                               | M1 Skeleton       | **Complete** |
| 1     | Monorepo & tooling (pnpm/Turborepo, lint, tests, CI) | M1 Skeleton       | **Complete** |
| 2     | Android automation core in Kotlin                    | M2 Device control | **Complete** |
| 3     | Native bridge (Turbo Modules / JSI)                  | M2 Device control | **Complete** |
| 4     | Node SDK & Zod workflow schema                       | M3 Workflows      | **Complete** |
| 5     | Workflow engine (DAG, registry, executor)            | M3 Workflows      | **Complete** |
| 7     | AI agent engine (loop, planner, memory)              | M4 Intelligence   | **Complete** |
| 6     | Workflow builder UI (Skia canvas, Zustand)           | M3 Workflows      | **Complete** |
| 9     | Execution recorder & workflow generation             | M4 Intelligence   | **Complete** |
| 8     | Configure-with-AI floating overlay                   | M4 Intelligence   | **Complete** |

Rows below Phase 5 are in **execution order**, not numeric order. Phase 10's scope moved to Step 12.

### Steps 1–13 — the product rebuild

| Step | Scope                                   | Milestone        | Closes         | Status       |
| ---- | --------------------------------------- | ---------------- | -------------- | ------------ |
| 1    | App shell & onboarding                  | M6 A real app    | A1–A5          | **Complete** |
| 2    | Permission engine                       | M6 A real app    | E1–E4          | **Complete** |
| 3    | Background execution & agent overlay    | M6 A real app    | B1, B2         | **Complete** |
| 4    | Agent Mode                              | M7 Agent Mode    | B3, B4, B6     | Next         |
| 5    | OCR & perception chain                  | M7 Agent Mode    | F1, F2, G7     | Not started  |
| 6    | Workflow Mode shell                     | M8 Workflow Mode | A6             | Not started  |
| 7    | Canvas rebuild                          | M8 Workflow Mode | C1–C3, G2      | Not started  |
| 8    | Node editor & palette                   | M8 Workflow Mode | C4             | Not started  |
| 9    | Node toolset overlay                    | M8 Workflow Mode | C5, C6         | Not started  |
| 10   | Workflow builder agent                  | M9 Intelligence  | D1–D3          | Not started  |
| 11   | Generation & recorder quality           | M9 Intelligence  | G4, G8         | Not started  |
| 12   | MCP server & clients, node distribution | M10 Platform     | B5             | Not started  |
| 13   | Device verification & hardening         | M10 Platform     | G1, G3, G5, G6 | Not started  |

---

## Phase 0 — Foundation & Decisions (complete)

Locked the stack and wrote down every decision so later phases build on a shared foundation.

**Implemented**

- Ten ADRs recording the decisions and their consequences.
- Coding conventions: language boundary, naming, dependency direction, commit style.
- Permission model: every sensitive capability with rationale and the phase it is introduced.
- Pinned toolchain versions and Android targets (`minSdk` 26, `targetSdk` 35).
- Repository hygiene files.

**Files**

```
Development_Plan/decisions/README.md
Development_Plan/decisions/0001-react-native-plus-kotlin.md
Development_Plan/decisions/0002-pnpm-turborepo-monorepo.md
Development_Plan/decisions/0003-zustand-for-ui-state.md
Development_Plan/decisions/0004-nativewind-for-styling.md
Development_Plan/decisions/0005-sqlite-room-persistence.md
Development_Plan/decisions/0006-zod-for-schemas.md
Development_Plan/decisions/0007-chat-completions-only.md
Development_Plan/decisions/0008-two-engines-one-runtime.md
Development_Plan/decisions/0009-selectors-over-coordinates.md
Development_Plan/decisions/0010-ci-only-apk-builds.md
Development_Plan/conventions/Coding_Conventions.md
Development_Plan/conventions/Permission_Model.md
Development_Plan/conventions/Versions_And_Targets.md
README.md, LICENSE, .editorconfig, .gitattributes, .gitignore
```

**Commit:** `511eace docs(plan): add Phase 0 foundation`

---

## Phase 1 — Monorepo & Tooling (complete)

Stood up the workspace, thirteen packages, the RN app shell, the Kotlin module skeleton, quality tooling, and CI.

**Implemented**

_Workspace_ — `pnpm-workspace.yaml`, root `package.json` (pnpm 9.15.4 pinned via `packageManager`), `turbo.json` with `build`/`typecheck`/`lint`/`test` and `^build` ordering, `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`).

_Thirteen TypeScript packages_, each with `package.json`, `tsconfig.json`, a barrel export, and passing unit tests. Every package encodes a real architectural invariant rather than an empty stub:

| Package              | Encodes                                                |
| -------------------- | ------------------------------------------------------ |
| `shared-types`       | Branded ids, `Result` type; bottom of the graph        |
| `node-sdk`           | The seven device-agnostic node kinds                   |
| `tool-sdk`           | The 20-name device tool surface                        |
| `workflow-schema`    | Selector strategy priority order, bounds schema (Zod)  |
| `core-nodes`         | Covers all generic kinds, no Android knowledge         |
| `android-nodes`      | Node→tool mapping, verified against `tool-sdk`         |
| `workflow-engine`    | Node lifecycle states, error behaviours                |
| `prompt-engine`      | Message roles, context kinds, secret redaction         |
| `ai-agent`           | Agent loop phases, bounded step budget                 |
| `mcp-server`         | Loopback default, no anonymous access, binding safety  |
| `execution-recorder` | Step fields; refuses generation from coordinates alone |
| `screen-inspector`   | UI node attributes, centre/tappability helpers         |
| `ui`                 | Design tokens, semantic colours, `ThemeProvider`       |

_Theme system_ (`packages/ui`) — raw tokens → semantic tokens per scheme → assembled theme → `ThemeProvider`/`useTheme`, plus a Tailwind preset (`tailwind.preset.cjs`) that emits CSS-variable colours so semantic classes such as `bg-surface` exist and follow the active scheme. Nine tests cover scheme parity and resolution.

_RN app_ (`apps/mobile`) — RN 0.76.6, NativeWind 4 (with its own preset plus the shared token preset, and `src/global.css` declaring the theme CSS variables), Zustand available, Metro configured for the pnpm monorepo (symlinks, workspace watch folders), Babel with NativeWind + Reanimated, Jest with `@testing-library/react-native`, and a themed placeholder screen showing phase status using only semantic classes.

_Android Kotlin_ (`android/`) — six Gradle library modules (`accessibility`, `automation`, `gestures`, `screen`, `overlays`, `tools`) with a version catalog, ktlint applied to all subprojects, and JUnit tests per module encoding contracts: UI-tree attribute keys, the 20 device tools matching `tool-sdk`, gesture duration validation, capture policy, overlay layout limits, sensitive-capability permission mapping.

_RN app Android project_ (`apps/mobile/android/`) — AGP 8.7.3 / Kotlin 2.0.21 / JDK 17, new architecture + Hermes, `minSdk` 26 / `targetSdk` 35, release signing from CI secrets with a debug-key fallback, ProGuard rules, adaptive launcher icon, day/night launch theme matching the design tokens.

_Quality tooling_ — ESLint 9 flat config with a rule forbidding packages from importing `apps/mobile`, Prettier 3, `lint-staged` + Husky pre-commit hook.

_CI_ — two workflows:

- `ci-typescript.yml`: format check → typecheck → lint → test → build, with pnpm and Turbo caching.
- `ci-android.yml`: ktlint + Kotlin unit tests, then a debug/release matrix that assembles both APKs and uploads them as artifacts.

**Local verification** (Windows, this machine)

```
pnpm install                                  ok (950 packages)
pnpm format:check                             ok
pnpm turbo run typecheck lint test build      56/56 tasks successful
cd android && gradle ktlintCheck testDebugUnitTest    ok (27 Kotlin tests, 0 failures)
cd apps/mobile/android && gradle help                 ok (plugin/classpath resolution)
cd apps/mobile/android && gradle :app:generateAutolinkingPackageList   ok
cd apps/mobile && react-native bundle --platform android --dev false   ok (1.42 MB)
```

71 TypeScript/RN tests pass (68 Vitest across the 13 packages + 3 Jest in the app), plus 27 Kotlin JUnit tests across the six native modules. **No APK was built locally** — that is CI-only per ADR 0010. The Gradle tasks run above are non-assemble tasks used to verify configuration and the JS bundle; the APKs themselves are built only by GitHub Actions.

**CI verification**

Both workflows are green on `main`:

| Run           | Workflow      | Result                                                          |
| ------------- | ------------- | --------------------------------------------------------------- |
| `32942495470` | TypeScript CI | success (46s)                                                   |
| `32942495576` | Android CI    | success (8m24s) — ktlint + Kotlin tests, debug APK, release APK |

Artifacts produced: `app-debug`, `app-release`, `kotlin-test-reports`.

### Getting CI green — five follow-up fixes

The first Android run failed. Each fix is recorded because most were caused by pnpm's strict, non-hoisting `node_modules` surfacing undeclared transitive dependencies that npm/yarn hoisting would have masked — a class of problem that will recur whenever a React Native tool is added.

| Commit    | Failure                                                                         | Cause and fix                                                                                                                                                                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `7ae69c3` | ktlint failed                                                                   | Multi-parameter Kotlin signatures must wrap one parameter per line, and a fitting single-expression body must stay on the signature line. Fixed three files, verified with `ktlintFormat`. Also moved the workflow actions off deprecated Node 20 versions.                                                                            |
| `0220e71` | `Included build '.../@react-native/gradle-plugin' does not exist`               | `settings.gradle.kts` includes that plugin and the app points `codegenDir` at `@react-native/codegen`, but neither was a declared dependency, so pnpm never linked them where Gradle looks. Declared both.                                                                                                                             |
| `059f31f` | `Could not find com.facebook.react:react-native-gradle-plugin:` (empty version) | RN ships the plugin as source, not a published artifact. It resolves only when `settings.gradle.kts` includes it a **second** time outside `pluginManagement`, so Gradle substitutes the versionless coordinate. Added that, plus the `com.facebook.react.rootproject` plugin.                                                         |
| `f7e073a` | `RNGP - Autolinking: Could not find project.android.packageName`                | The Gradle plugin shells out to the RN CLI for autolinking config; the CLI's Android platform resolver was not linked into the app, so `react-native config` emitted no `project.android`. Declared `@react-native-community/cli` and `cli-platform-android`.                                                                          |
| `139df84` | `Tailwind CSS has not been configured with the NativeWind preset`               | Four issues: `tailwind.config.js` never listed `require('nativewind/preset')`; the token preset emitted hardcoded hex plus custom `dark-*` classes instead of NativeWind v4 CSS variables; `@babel/plugin-transform-react-jsx` was unresolvable from the app; and `packages/ui` used ESM `.js` import specifiers Metro cannot resolve. |

The NativeWind fix changed the theming approach and is worth knowing about: the Tailwind preset now emits `rgb(var(--color-<role>) / <alpha-value>)`, and the concrete values live in `apps/mobile/src/global.css` as CSS variables with a `prefers-color-scheme` override. So `bg-surface` follows the active scheme with no component change. `packages/ui/src/theme/semantic.ts` remains the source of truth for the TypeScript side (`useTheme`, and later Skia); `global.css` is the source of truth for className styling. **The two must be kept in sync.**

**Files**

```
pnpm-workspace.yaml, package.json, turbo.json, tsconfig.base.json
eslint.config.mjs, prettier.config.mjs, .prettierignore, vitest.config.ts
.husky/pre-commit
packages/{shared-types,node-sdk,tool-sdk,workflow-schema,core-nodes,android-nodes,
          workflow-engine,prompt-engine,ai-agent,mcp-server,execution-recorder,
          screen-inspector,ui}/**
apps/mobile/**            (RN app + its Android project)
android/**                (6 Kotlin modules + version catalog + ktlint config)
.github/workflows/ci-typescript.yml
.github/workflows/ci-android.yml
```

**Commits:** `11303c1` (scaffold), `7ae69c3`, `0220e71`, `059f31f`, `f7e073a`, `139df84` (CI fixes)

---

## Phase 2 — Android Automation Core (complete)

The hardest layer in the plan, and the one everything above it depends on: read the screen, resolve a target, act on it. Six Gradle modules, each behind an interface so the logic is unit-testable without an emulator.

**Implemented**

_`accessibility`_ — the module that matters most.

- `UiNode` / `UiTree` / `Bounds` as pure Kotlin with no Android imports, so the model is constructible in tests.
- `UiTreeSerializer` producing deterministic JSON in a fixed key order, with a compact mode that omits nulls and default flags for model context. The format is a published contract shared with `screen-inspector`; changing a key requires bumping `UI_TREE_SCHEMA_VERSION`.
- `NodeSource` abstraction plus `UiTreeWalker`, which enforces depth and node caps, skips invisible subtrees, and recycles every platform node it obtains.
- `UiAutomationAccessibilityService` — tracks only the foreground package/activity from events and reads the hierarchy on demand; it never logs or persists screen content. Also implements `NodeActionPerformer` for set-text/click/focus by structural path.
- `AccessibilityConnection`, a narrow process-wide holder, since only the system can construct the service.
- `SelectorResolver` implementing the full ADR 0009 priority chain: `resourceId → accessibility semantics → text/contentDescription → structural path → relative position → coordinates → vision`. Reports which strategy matched, how many other nodes matched, and whether the match is fragile. The vision step is a `VisionMatcher` seam — see the audit below.

_`gestures`_ — `GestureSpec` validates at construction, so a 100 ms long press is rejected rather than silently delivered as a tap. `GestureBuilder` owns the coordinate arithmetic including the edge inset that keeps paths clear of the system gesture strip. `GestureEngine` retries cancellation and settles afterwards so the next step does not read the pre-gesture screen. `AccessibilityGestureDispatcher` wraps the callback-based platform API in a cancellable coroutine with a timeout.

_`screen`_ — `ScreenshotStore` keeps captures in app-private storage and prunes by count and age. `MediaProjectionScreenCapture` runs the `MediaProjection → VirtualDisplay → ImageReader → Bitmap → PNG` pipeline, handles the row-stride padding that otherwise skews the image, and samples a pixel grid to distinguish a `FLAG_SECURE` window from a real failure.

_`overlays`_ — `OverlayGeometry` computes and clamps window placement; `WindowManagerOverlayManager` refuses to draw without `SYSTEM_ALERT_WINDOW` and uses `FLAG_NOT_FOCUSABLE` so the overlay never steals input meant for the app beneath.

_`tools`_ — `PermissionGate` as a hard precondition on every sensitive call, with `AndroidPermissionGate` handling the three different mechanisms Android requires: the package manager, `Settings.canDrawOverlays`, and parsing the enabled-accessibility-services string. `PermissionRationale` holds user-facing copy per capability in an exhaustive `when`. Implementations for apps, contacts, clipboard, alarms, notifications, intents, settings, and media playback.

_`automation`_ — `AutomationRuntime`, the single surface both engines call (ADR 0008), with `DefaultAutomationRuntime` composing all five modules through injected interfaces. `AutomationForegroundService` uses the `specialUse` type with a stated justification and a non-dismissible stop action.

### Two decisions worth carrying forward

**Errors are data, not exceptions.** Every tool returns `ToolResult<T>`, and `AutomationError` separates `isRetryable` from `needsUserAction`. A missing element is retryable because the screen is usually still loading; a `FLAG_SECURE` banking screen is neither retryable nor fixable by prompting. The Phase 7 agent loop depends on that distinction to avoid burning its step budget, and the Phase 5 engine uses it to pick a retry policy.

**`click` prefers the node's own accessibility action** over a coordinate tap, falling back only when it fails. This succeeds where a tap cannot: a target overlapped by another view, or one whose touch area differs from its reported bounds.

**Local verification**

```
cd android && gradle ktlintCheck                     clean, all 6 modules
cd android && gradle testDebugUnitTest               334 tests, 0 failures
cd android && gradle assembleDebugAndroidTest        compiles
pnpm format:check                                    clean
pnpm turbo run typecheck lint test build             56/56 tasks
```

**CI verification** — Android CI run `33047779509` and TypeScript CI run `33047779506` are both green on `main`. The Android run covers ktlint, Kotlin unit tests, instrumentation on API 26 and API 34 emulators, and both APKs.

_(Superseded by the audit numbers further down: the suite is now 381 Kotlin tests, verified by run `33057095459`.)_

### Instrumentation coverage

Five suites cover what a JVM test cannot prove, since the Android JVM stub returns default values for framework calls and a unit test would pass while asserting nothing:

| Suite                        | Verifies                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `AccessibilityNodeSource`    | the mapping from a real `AccessibilityNodeInfo`, including screen bounds       |
| Accessibility service        | it is declared in the merged manifest and **disabled by default**              |
| `GestureDescription`         | the platform accepts every gesture the builder produces                        |
| `ScreenshotStore`            | captures land in app-private storage, never shared external storage            |
| Tool layer / overlay manager | `PackageManager` queries work; permissions read as denied; the overlay refuses |

Two of these initially failed on a bare emulator and were fixed in `3d0c315`, because both assumptions held on a real phone but not on a clean CI image:

- `findApps` does not return the instrumentation package — correctly, since it filters to apps with a launcher activity and a test APK has none. Replaced with tests pinning the actual contract: the package is visible in the unfiltered list, and the launchable list is a strict subset excluding it.
- A clipboard write is refused outright on API 26 from an unfocused instrumentation process, and reads are focus-dependent from API 29. Both are outcomes the tool already reports as a boolean, so the test now asserts only that no path throws.

**Files**

```
android/accessibility/src/{main,test,androidTest}/**   model, parser, selector, serialization, service
android/gestures/src/{main,test,androidTest}/**
android/screen/src/{main,test,androidTest}/**
android/overlays/src/{main,test,androidTest}/**
android/tools/src/{main,test,androidTest}/**           incl. android/ implementations
android/automation/src/{main,test}/**                  runtime, errors, foreground service
android/gradle/libs.versions.toml                      androidx test runner + core-ktx
apps/mobile/android/app/src/main/AndroidManifest.xml   Phase 2 permissions
.github/workflows/ci-android.yml                       connectedDebugAndroidTest on API 26 + 34
```

Added by the audit:

```
android/accessibility/.../selector/VisionMatcher.kt              vision seam
android/accessibility/.../selector/VisionFallbackTest.kt
android/accessibility/.../serialization/UiNodeAttributeParityTest.kt
android/automation/.../DeviceToolParityTest.kt
android/tools/.../MediaTool.kt, android/AndroidMediaTool.kt, MediaToolTest.kt
packages/screen-inspector/src/index.ts                           18 attributes + envelope + version guard
packages/tool-sdk/src/index.ts                                   controlMedia, adjustVolume
```

**Commits:** `b5f788c` (core), `3d0c315` (instrumentation fixes), `7021b25` (plan-conformance audit)

### Plan-conformance audit (commit `7021b25`)

Before starting Phase 3 the implementation was read back against `Development_Plan/` line by line. Five places approximated the documents rather than matching them. All five would have surfaced as bugs once the bridge existed, and each is the kind of thing that fails quietly rather than loudly — which is why they are now pinned by tests rather than by intention.

**1. The UI-tree contract was lying.** `UiNodeAttribute` is documented as the versioned, shared description of what the parser emits, and `screen-inspector` mirrors it — but it declared 8 keys while `UiTreeSerializer` emitted 18. The TypeScript side would have been blind to every interaction flag (`longClickable`, `scrollable`, `editable`, `checkable`, `checked`, `selected`, `enabled`, `visible`) and to `children` and `index`.

- Both sides now declare all 18 in emission order, plus a new `UiTreeAttribute` enum for the envelope keys (`schemaVersion`, `packageName`, `activityName`, `capturedAtEpochMs`, `screenWidthPx`, `screenHeightPx`, `nodeCount`, `root`).
- `UiNodeAttributeParityTest` asserts declared-equals-emitted **in order**, so drift is a build failure. It scans keys with a small hand-rolled walker rather than a JSON library, because `org.json` is stubbed in Android JVM unit tests.
- `UI_TREE_SCHEMA_VERSION` bumped 1 → 2, with `isSupportedSchemaVersion` on the TS side so a mismatched payload is rejected rather than half-read.

**2. Selectors were not scoped to a screen.** `Data_Models.md` specifies `screen: { package, activity }`, but `Selector` carried only `packageName`. One package renders many screens, so a "Send" selector recorded in a WhatsApp conversation could resolve against the chat list and act on the wrong element — worse than failing outright.

- Added `Selector.activityName`, the `Selector.onScreen(...)` factory, and a `scopedTo(...)` extension for pinning an existing selector.
- The resolver's `packageMatches` became `screenMismatchReason`, covering package and activity and naming which one mismatched. Both checks skip when the tree cannot report its identity, so a hand-built tree or a transient window still resolves.

**3. The selector chain stopped at step 6.** Strategy 7 was in the enum and returned an empty list, so a chain documented as seven steps silently ran six. Vision needs a screenshot and a model, neither of which the accessibility module may depend on.

- Vision is now a `VisionMatcher` interface with `VisionMatch` (bounds + confidence + description) and `UnavailableVisionMatcher` as the default, so the "no provider" path is exercised rather than being a null check.
- `SelectorResolver.resolveWithVision` completes the chain. It is suspending and separate from `resolve`, so callers wanting only the cheap structural strategies do not pay for a model call.
- Three outcomes that used to collapse into one are now distinct: **vision not attempted** (no screenshot or model — fixable by asking the user), **vision found nothing**, and a **match carrying its confidence** so the recorder can flag a 0.42 guess instead of presenting it as equivalent to a `resourceId` match. A vision match reports `structuralPath = "vision"` because there is often no node in the tree to point at — precisely why vision was needed.

**4. The `media` tool was missing** from the Android Tool Layer deliverables.

- `MediaCommand` (play/pause/stop/next/previous/fast-forward/rewind) and `VolumeDirection`, with `AndroidMediaTool` dispatching media **key events** via `AudioManager.dispatchMediaKeyEvent` — always as a down/up pair, since sending only the down event leaves some players stuck.
- Scoped to control on purpose: key events need **no new permission** and reach whichever app holds the media session, which is also what the user expects from "pause". Reading _what_ is playing needs notification-listener access and media files need `READ_MEDIA_*`; neither is in the Phase 2 permission table, so both are out of scope rather than a quiet expansion of the sensitive surface.
- Surfaced as `controlMedia` and `adjustVolume` on `AutomationRuntime`, and added to `DeviceTool` and `tool-sdk`.

**5. Nothing stopped the tool vocabulary drifting.** `DeviceTool` and `tool-sdk`'s `TOOL_NAMES` must match exactly (ADR 0008) — the AI and MCP server name tools from the TypeScript list while the runtime implements the Kotlin one, so divergence lets the model name a tool it cannot call, showing up as a confusing agent loop rather than an error.

- `DeviceToolParityTest` restates the TypeScript list as a literal and asserts equality, and a matching Vitest test does the reverse. A one-sided change now fails the build.
- It also checks every tool name maps to an `AutomationRuntime` method, using Java reflection since `kotlin-reflect` is not on the test classpath. The check is one-directional by design: every tool must be a method, but `openAppByName`, `clickAt`, and `swipeBetween` are convenience overloads outside the named vocabulary.

**Audit verification**

```
cd android && gradle ktlintCheck                     clean, all 6 modules
cd android && gradle testDebugUnitTest               381 tests, 0 failures (was 334)
cd android && gradle assembleDebugAndroidTest        compiles
pnpm format:check                                    clean
pnpm turbo run typecheck lint test build             56/56 tasks
```

CI run `33057095459` (Android) and `33057095353` (TypeScript) green: ktlint, Kotlin unit tests, instrumentation on API 26 and 34, and both APKs.

---

## Phase 3 — Native Bridge (complete)

The language boundary from ADR 0001 becomes real: one typed, promise-based crossing between the React Native product layer and the Kotlin OS layer. Nothing above this reaches for `NativeModules` directly.

### Two layers, deliberately

React Native's codegen understands a narrow type vocabulary — primitives, arrays of primitives, and flat objects. No unions, no discriminated results. Writing the whole API at that level would push those constraints onto every caller.

So the spec stays plain (structured arguments cross as JSON strings) and a wrapper provides the API the product actually uses: real types, `Promise<T>`, and no JSON handling anywhere else. The spec file reads primitively on purpose; it is a wire format, not the API.

### `packages/native-automation`

| File                       | Holds                                                                      |
| -------------------------- | -------------------------------------------------------------------------- |
| `spec/NativeAutomation.ts` | the codegen spec: 22 tools, capture consent, foreground service, streaming |
| `types.ts`                 | `Selector`, `ResolvedElement`, `UiTree`, `Screenshot`, mirroring Kotlin    |
| `errors.ts`                | `AutomationError` plus the mapping from Kotlin error codes                 |
| `events.ts`                | the three streamed events and a typed event map                            |
| `automation.ts`            | the wrapper callers use; every method rejects with a typed error           |

`ResolvedElement` carries `strategy` as part of the contract rather than as debug output: the recorder uses it to judge how durable a generated step is, and `isFragileMatch` lets the UI warn when automation has degraded to coordinates or vision.

### Errors survive the crossing

Kotlin returns failures as data; a JS promise can only reject with an error. The mapping preserves the two flags callers branch on, so **TypeScript makes the same retry decision Kotlin does** — `element_not_found` is retryable because the screen is usually still loading, while `secure_screen` is neither retryable nor fixable by prompting.

React Native flattens a rejection into an `Error` whose `code` holds the native code, so `toAutomationError` recovers it from the _shape_ rather than the type, and anything unrecognised becomes `unexpected`. A caller never faces an untyped failure. Two codes are the bridge's own: `bridge_unavailable` when the module is missing from the build, and `bridge_protocol` when the native side returns unreadable JSON.

`AutomationError` restores its prototype chain in the constructor — subclassing a built-in loses it under transpilation, and without that fix `catch` blocks silently miss.

### `android/bridge` (new Gradle module)

Kept separate from `:automation` so the runtime stays free of wire-format concerns.

- `AutomationBridge` takes **only** an `AutomationRuntime` — no `ReactApplicationContext`, no `Promise`. That is what makes argument parsing, result serialization, and error mapping testable off-device; the RN module is then a thin adapter that calls the bridge and settles a promise.
- `JsonReader` is hand-rolled because `org.json` returns default values under Android JVM unit tests, so using it would leave the conversion layer unverifiable locally. Adding kotlinx-serialization for one wire format would be disproportionate.
- `BridgeResults` delegates the UI tree to the existing versioned serializer rather than inventing a second format that could drift from the TypeScript contract.
- `BridgeArguments` validates at the boundary: an empty selector is rejected **by name here** rather than surfacing as `element_not_found` several layers down.

### `apps/mobile`

The `android/` modules are now mounted into the app build by `projectDir` rather than as a composite build — substitution for seven modules would be noise, and `gradle :accessibility:test` keeps working standalone from `android/`. The app depends only on `:bridge`, which re-exposes the rest via `api`.

`AutomationRuntimeProvider` is the composition root. It builds the runtime **per call** rather than caching it, because the accessibility service is created and destroyed by the system whenever the user toggles it; a cached reference would fail in a way that looks like a device fault rather than a revoked permission. It also holds the MediaProjection session, which must survive a JS reload.

`AutomationEventBridge` streams UI-tree changes and status changes. Streaming is **off by default**: content-change events fire continuously on animated screens, and emitting a full tree each time would flood the bridge for no benefit.

### Closes the Phase 2 gap: MediaProjection had no caller

The capture pipeline existed but nothing could grant it a session, because launching the consent dialog needs an Activity. `useScreenCaptureConsent` now drives it end to end, and **declining resolves as `declined` rather than an error** — it is a legitimate choice, so the UI explains the consequence instead of nagging. `AutomationStatusPanel` shows all three capabilities with a per-capability hint, because a user who does not know the accessibility service is off cannot turn it on.

### A CI failure worth recording

The first push (`07a74c4`) failed the **release** APK only: Metro resolved `@mobile-automation/native-automation` but could not find its `main`, because the package pointed at `dist/index.js` and the RN bundle step does not run Turborepo's build first. The debug APK passed because it happened to be built before the bundle step needed it — a genuinely misleading signal.

Fixed in `20795d4` the way `packages/ui` already handles it: a private, source-entry package consumed directly by Metro, which transpiles the TypeScript itself. `main` is `./src/index.ts`, `build` emits declarations only, and the relative imports drop their `.js` extensions since Metro's resolver does not expect them.

**Verification**

```
cd android && gradle ktlintCheck                     clean, 7 modules
cd android && gradle testDebugUnitTest               459 tests, 0 failures
cd android && gradle assembleDebugAndroidTest        compiles
cd apps/mobile/android && gradle projects            all 7 native modules listed
react-native bundle --dev false                      succeeds (the step CI failed on)
pnpm format:check                                    clean
pnpm turbo run typecheck lint test build             60/60 tasks
pnpm install --frozen-lockfile                       clean
```

CI run `33067139054` (Android) and `33067139071` (TypeScript) are green: ktlint, 459 Kotlin unit tests, instrumentation on API 26 and 34, and both APKs.

**Files**

```
packages/native-automation/**                          spec, types, errors, events, wrapper, 39 tests
android/bridge/**                                      JsonReader, BridgeArguments/Results/Errors, AutomationBridge, 78 tests
android/settings.gradle.kts                            :bridge added
android/accessibility/.../AccessibilityConnection.kt    screen-change listeners
android/accessibility/.../UiAutomationAccessibilityService.kt  emits change notifications
apps/mobile/android/settings.gradle.kts                mounts the 7 native modules
apps/mobile/android/app/build.gradle.kts               depends on :bridge
apps/mobile/android/app/src/main/kotlin/.../bridge/**  AutomationModule, Package, RuntimeProvider, EventBridge
apps/mobile/android/app/src/main/kotlin/.../MainApplication.kt  registers AutomationPackage
apps/mobile/src/features/automation/**                 status hook, consent hook, status panel
eslint.config.mjs                                      codegen spec may default-export
```

**Commits:** `07a74c4` (bridge), `20795d4` (Metro resolution fix)

Phase 3's definition of done also needs a physical device — calling `automation.getUiTree()` and `automation.click(selector)` from JS and watching a real phone respond. That and the outstanding Phase 2 checks are listed together under **Outstanding device verification** below, along with what Phase 3 deliberately defers.

---

## Phases 4 + 5 — Node SDK, Schema, Node Packages & Workflow Engine (complete)

Built together deliberately. The executor contract and the node config schemas have no consumer until an engine exists, so building them apart would have meant guessing the shape and reworking it once the engine arrived.

### `workflow-schema` — the workflow document

Zod schemas for `Selector`, `Bounds`, `Variable`, `Node`, `Edge`, `Workflow`, and per-kind node config, with types derived by `z.infer` so each shape has exactly one definition. A workflow may have been hand-edited, model-generated, or written by an older version of the app, so nothing is trusted.

Four decisions that constrain everything above:

- **A selector with nothing to locate by is rejected.** `{ className: 'Button' }` narrows a search but cannot find anything. Left unvalidated it reports "element not found" at run time, which sends the user to inspect their screen rather than their workflow.
- **`while` loops must declare `maxIterations`** — unbounded is not offered at all. A workflow drives someone's phone; a condition that never becomes false would keep tapping. The same reasoning caps every loop at 1000 and retries at 10.
- **`onError: 'retry'` with `retry: 0` is refused.** It reads as "retry" and behaves as "stop" — the kind of silent contradiction that costs an afternoon of debugging.
- **`ValueSource` is a discriminated union** (`literal` / `variable` / `nodeOutput`) rather than string interpolation everywhere. Interpolation is right for a message body, where surrounding words are literal; for a whole value, `{{ count }}` would arrive as the string `"12"` and break a numeric comparison.

`WorkflowNode.config` is deliberately typed `unknown` here. Its real shape depends on `type`, and only the registry knows which schema applies — so the engine validates it against the resolved definition at load time.

### `shared-types` and `node-sdk` — the node contract

The plain cross-package types (`JsonValue`, `ExecutionPolicy`, `NodeKind`, `NodeState`) moved down into `shared-types`, which holds **no Zod**. That is what lets `node-sdk` sit at the bottom of the dependency graph: a third-party node package needs the shape of a variable value without being forced to depend on the schema package. A type-level parity test in `workflow-schema` fails to compile if the two ever diverge.

| File            | Holds                                                          |
| --------------- | -------------------------------------------------------------- |
| `definition.ts` | `NodeDefinition`, `ExecutionContext`, `NodeResult`, `PortSpec` |
| `registry.ts`   | registration, resolution, palette grouping                     |
| `manifest.ts`   | the manifest schema, SDK version gate, reconciliation          |
| `errors.ts`     | `NodeExecutionError`, `ExecutionCancelledError`                |
| `authoring.ts`  | `defineNode`, `executeNode`, and the test helpers              |

**A node cannot see the graph.** It receives its validated config, its inputs, the variable store, and an abstract `ToolInvoker` — nothing else. It returns which output handle to follow and whether to be re-entered, but the engine decides what actually runs. A loop repeats by returning `repeat: true` rather than holding a private counter, which would be wrong the moment an outer loop re-entered it or the workflow was paused and resumed.

`ToolInvoker` being an interface rather than an import of the bridge is what keeps `android-nodes` pure TypeScript and testable off-device — and it is the single seam Phase 9's recorder will observe, since every device action passes through it.

`NodeExecutionError` carries `retryable` and `needsUserAction` **separately**. A missing permission will never resolve itself no matter how many retries, but the user can grant it, so the UI should prompt rather than merely report failure.

The registry **refuses a duplicate type** instead of overwriting it. Silent replacement would make a workflow's behaviour depend on package load order — a bug that only appears on someone else's device. `registerAll` is all-or-nothing for the same reason: a half-loaded package leaves some workflows working and others mysteriously broken.

One typing note worth recording: `AnyNodeDefinition` is spelled structurally rather than as `NodeDefinition<never>`. `z.ZodType<never>` accepts nothing, so no real definition satisfies it and the registry would have needed a cast; describing the erased shape directly means every `NodeDefinition<T>` is assignable with none.

### `core-nodes` — the seven generic nodes

`trigger`, `input`, `condition`, `loop`, `setVariable`, `transform`, `action`. Nothing here knows about Android; `condition` and `action` can reach tools, but only by name through the SDK's invoker, so the package still builds and tests with no bridge present.

- **`condition` returns a named branch handle**, not a boolean, so the engine follows the `true`/`false` edge without interpreting a result value — and the log shows the decision rather than requiring it to be inferred.
- **`loop` is stateless.** Its counter lives in the variable store as `__loop_<nodeId>_index`, namespaced so nested loops cannot collide, and it is cleared on completion so re-entry from an outer loop starts fresh.
- **`isTruthy` treats `[]` and `{}` as falsy**, unlike JavaScript. `[]` being truthy surprises everyone, and a "while items remain" loop written against a list would never terminate. Workflow authors are not necessarily JavaScript programmers.
- **`input` validates rather than prompts.** The engine collects answers before the run and seeds the store, because a workflow that stalled mid-run with a dialog while sitting behind another app would be unusable.

### `android-nodes` — twenty-one device nodes

One thin wrapper per tool. Their config schemas live here rather than in `workflow-schema`, which stays device-agnostic (ADR 0008).

`shared.ts` holds the plumbing they all need: refusing to run with no device, and translating a bridge rejection into a `NodeExecutionError` that **preserves the bridge's own** `retryable` and `needsUserAction` classification. The bridge already knows `element_not_found` usually means a loading screen; re-deriving that from message text would be guesswork.

`openApp` declares `defaultExecutionPolicy: { retry: 2, onError: 'retry' }` — a cold start can lose the launch intent, and expecting every user to discover that and configure it by hand would make the product feel unreliable.

This phase also added `openAppByName` and `findContacts` to the tool vocabulary: `DeviceTool`, `TOOL_NAMES`, and both parity tests, in one commit as the contract requires.

### `workflow-engine`

**Everything checkable is checked before the device is touched:** the JSON shape, that every node type is registered, that each config satisfies its own schema, that every edge names a handle that exists, that there is exactly one entry point, and that there is no cycle. Discovering on step nine that step ten refers to an unregistered node type leaves the user's phone half-way through a task, in a state nobody designed.

Two design points worth carrying forward:

- **Loop bodies flow forward to a dead end**, and the engine returns to the innermost loop via a return stack. The obvious alternative — an edge from the last body node back to the loop — makes the graph genuinely cyclic, and cycle detection could then no longer distinguish an intended loop from a workflow that will run forever. It also removes an edge the user would have to remember to draw, and nesting falls out of the stack for free.
- **Execution is sequential.** Two nodes fanning out from one handle would both drive the same physical screen, and there is only one screen, so the second would act on whatever the first left behind. The loader permits the shape; the executor follows the first edge.

Cycle detection uses an iterative DFS with an explicit stack — a generated workflow can be long, and blowing the JS stack while _validating_ would present as a crash rather than a validation error. It names the loop (`b -> c -> b`), which is the difference between a fixable report and a puzzle.

`RunVariableStore` type-checks writes against declared types, turning "the workflow did something strange twenty steps later" into a report naming the node that wrote the wrong thing. Loop counters are hidden from the reported snapshot since they are bookkeeping, not user data.

Ten structured event types on an `ExecutionEventBus` that survives a throwing listener — a UI bug in the log view must not abandon a half-finished workflow on someone's phone.

### Third-party node discovery

The n8n community-node model. **The manifest is read and validated before any of the package's code is loaded**, because a node package can tap on someone's banking app: one that lies about what it provides, targets an incompatible SDK, or is simply broken is rejected without ever executing.

- Reconciliation runs **both ways**. A node declared but not exported is a broken package. A node exported but not declared is worse — it would execute without appearing in the manifest the user was shown.
- Third-party types are namespaced `@scope/package:type`, so a community package cannot shadow the built-in `click` that workflows and the AI refer to by bare name.
- One broken package does not stop the others; a user with five installed should not lose all of them because one is bad.

`packages/node-sdk/AUTHORING.md` documents the whole contract for package authors, including why the manifest is checked first and why the SDK must be a peer dependency.

**Verification**

```
pnpm turbo run typecheck lint test build     60/60 tasks across 15 packages
                                             511 TypeScript tests
pnpm format:check                            clean
pnpm install --frozen-lockfile               clean
cd android && gradle :automation:ktlintCheck testDebugUnitTest   green
```

The integration test runs the **real** node packages, registry, and engine against a fake device: a nine-step WhatsApp workflow (`openApp → findElement → click → typeText → waitForElement → click → typeText → click`) and a second workflow exercising a condition inside a loop. It is the test that would catch a node wired to a tool the runtime does not expose.

CI run `33095669422` (Android) and `33095669365` (TypeScript) are green, including both APKs and instrumentation on API 26 and 34.

**Files**

```
packages/workflow-schema/src/{selector,variable,node-config,workflow,validation}.ts  + parity test
packages/shared-types/src/index.ts                    plain cross-package types
packages/node-sdk/src/{definition,registry,manifest,errors,authoring,contracts}.ts
packages/node-sdk/AUTHORING.md                        third-party author guide
packages/core-nodes/src/{values,trigger,input,condition,loop,variable,transform,action}-node.ts
packages/android-nodes/src/{config,shared,nodes}.ts   21 device nodes
packages/workflow-engine/src/{loader,executor,events,variables,discovery}.ts
android/automation/.../DeviceTool.kt                  + openAppByName, findContacts
packages/tool-sdk/src/index.ts                        matching tool names
```

**Commit:** `dd25227`

### Not yet verified on a real device

Phase 5's definition of done requires `RN → Workflow JSON → Engine → Registry → Executor → Android Tool Runtime` executing end-to-end on hardware. Everything up to the tool call is proven against a fake; the last hop needs a phone, and it also depends on the outstanding Phase 2 and 3 device checks. See **Outstanding device verification** below.

### Deliberately deferred

- **No RN wiring yet.** The engine is headless by design; the app has no screen that runs a workflow until Phase 6's canvas. `runWorkflow` is the entry point it will call.
- **`skipped` node events are defined but unused.** The type exists for Phase 6's debugger, which will want to grey out untaken branches; the executor currently just does not visit them.
- **No workflow persistence.** SQLite storage belongs with Phase 6, where there is a UI to save from.

---

## Phase 7 — AI Agent Engine (complete)

Natural-language goal in, device driven out. Separate from the workflow engine and sharing only the tool vocabulary (ADR 0008), so the agent's non-determinism never leaks into deterministic workflow execution.

### `tool-sdk` — one definition per tool

Four modules: `names.ts` (the vocabulary Kotlin mirrors), `arguments.ts` (a strict Zod schema per tool), `definitions.ts` (what the model is told), `validation.ts` (the gate before execution).

The `description` field is written **for the model**, not for a reader. The commonest agent failure is not a malformed call but a plausible call to the wrong tool, so each description says what the tool is for and, where it matters, what to prefer instead — "use `waitForElement` if the screen may still be loading".

Every argument schema is `.strict()`. A model that invents a field is misunderstanding the tool, and dropping it silently would hide that while doing something other than what the model intended.

`impact` and `idempotent` make retry policy **data rather than guesswork**: a read is always safe to repeat, a tap might submit a form twice, and sending a message twice is worse than not sending it.

`validateToolCall` distinguishes three failures because the useful correction differs — an unknown tool needs the list of real ones, malformed JSON needs "send valid JSON", bad arguments need the specific field. Each message is phrased as an instruction, since it goes straight into the next prompt.

The Zod-to-JSON-Schema conversion is hand-rolled rather than taken from a library. The subset needed is small, and it has to **unwrap `.refine()`** — without that the selector renders as an empty schema and the model cannot construct one at all.

### `prompt-engine` — context assembly is the agent's perception

The model cannot see the phone. It sees what `buildAgentContext` assembles, so what is included, what is omitted, and how it is labelled _is_ what the agent is capable of. That is why this is a tested function rather than string concatenation at a call site: a context that silently loses the current screen produces an agent that confidently acts on a stale one, which looks like a bad model rather than a bug.

Ordering is deliberate — the goal first because everything serves it, the current screen **last** because recency weighs heavily on a model's attention and the screen is what the next decision rests on.

The token budget is divided explicitly rather than filled naively, because the parts are not equally important: one busy screen's UI tree would otherwise crowd out the goal. Memory trimming keeps the most recent steps and **announces the drop**, since a model shown steps 4–9 with no indication that 1–3 existed may conclude it has just started and repeat work.

Every rule in `AGENT_SYSTEM_PROMPT` exists to prevent a specific failure:

| Rule                                     | Failure it prevents                                         |
| ---------------------------------------- | ----------------------------------------------------------- |
| read the screen before acting            | tapping coordinates remembered from two screens ago         |
| prefer `resourceId`                      | text selectors breaking on any label or language change     |
| wait after an action that loads a screen | the commonest false "element not found" — looking too early |
| say when you are finished                | running to the step ceiling on every success                |
| never invent an element                  | guessing a plausible id and tapping something unintended    |

Redaction strips credential-shaped keys **recursively** — a key at depth four is exactly as dangerous as one at the top — and preserves structure so the model still sees that a field existed, which matters when reasoning about a login screen. Truncation announces itself, because text that stops mid-sentence reads as the whole content and the model will reason confidently about a screen it half saw.

`parser.ts` extracts JSON by brace matching rather than regex, tolerating fences, a preamble, a trailing explanation, and braces inside string values. Repair fixes **formatting only, never meaning**: trailing commas, smart quotes, unquoted keys. A missing required field is reported rather than invented — guessing would produce a config that validates and then does the wrong thing on someone's phone.

Node-config and generation contexts were built here too, so Phase 8 and Phase 9 are UI work rather than a second prompt pipeline.

### `ai-agent` — the loop

```
goal → plan → observe → choose tool → validate → execute → observe → replan → done
```

**Four independent stops**, because a confused model driving someone's phone is the worst failure this product can have: a step ceiling, a wall-clock deadline, stuck detection, and cancellation. The deadline is separate from the step count because a step is not a fixed cost — forty `waitForElement` steps could be twenty minutes of a phone being driven.

Memory derives three signals a model does not reliably notice about itself:

- **Consecutive failures** (≥2 replans). Not one: a single failure is usually a screen that had not finished loading, and replanning on it throws away a correct plan.
- **An identical action repeated** (≥3 is stuck). Not two — tapping the same "next" button twice is normal.
- **Steps without the screen changing** (≥6 is stuck). The subtler and more common loop: different selectors tried on a screen that does not contain what the agent wants.

`summarise()` is mechanical rather than a model call, because summarising would cost a round trip and a wait at exactly the moment the agent is already struggling.

Three decisions in the loop worth carrying forward:

- **The screen is observed every iteration, never cached.** Acting on a stale reading is the failure this ordering exists to prevent.
- **One tool call at a time.** A model will propose three taps at once, but the second depends on what the first did to the screen and it cannot know that yet.
- **A rejected call is fed back as a correction and does not charge the step budget.** Otherwise a confused model exhausts the run without ever acting.

`toolChoice` is `auto`, not `required`: forcing a tool call would leave the model no way to say it is finished, and the run could only end by hitting the ceiling.

### The recorder seam

`toolExecuted` is built in now rather than retrofitted in Phase 9. It carries everything `ExecutionStep` requires — screen identity, the UI tree before the action, the resolved element and which strategy matched, the result or the error and its code, and the screen after — for **failures as much as successes**, since the failed step is the one a person most wants to look at.

The resolved element is the point: a trace of coordinates compiles into a workflow that breaks on the next app update, while one carrying the element that actually matched compiles into one that survives (ADR 0009).

### Provider credentials

`ProviderCredentialStore` encrypts the API key with an AES-GCM key from the hardware-backed Android Keystore. Hand-rolled because `androidx.security:security-crypto` is deprecated and its replacement is not stable; the primitive needed here is one key and one value.

The asymmetry is the design. TypeScript can **write** the key and ask whether one exists, but `getSettings` returns `hasApiKey` rather than the value, and the only reader is the provider client at request time. The TS provider takes `apiKey` as a **function**, so nothing in JS state ever owns a credential — it cannot reach a component tree, a devtools snapshot, or a crash report (ADR 0007).

The base URL and model are stored in the clear. Encrypting them would imply they are secret, which invites treating the key as casually as the URL.

`setUserAuthenticationRequired` is deliberately not set: it would demand a device unlock on every read, which for a background automation run means the run simply fails. The protection would cost the feature.

### The app

`AgentScreen` — type a goal, watch it happen, stop it. Three things it must get right, being the surface where a user hands control of their phone to a model:

- **Stop is always reachable**, beside the goal field rather than below a scrolling log.
- **Every step is narrated.** An agent acting silently is alarming; the log is the reassurance. `AgentEventRow` renders each of the nine event types in plain language, describing a tap by what was touched rather than by selector JSON.
- **It refuses to start when it cannot work.** Accessibility off and no provider key are different problems with different fixes, and both are stated rather than surfacing later as a failed run.

`HomeScreen` became a three-tab shell (Agent / Status / Provider) rather than pulling in react-navigation — a structural decision better made in Phase 6, where the canvas and its editors define what navigation has to support.

`packages/native-automation/src/tools.ts` adds `invokeTool`, dispatching a tool name to a device function. Both the agent and Phase 10's MCP server need it; without it each would grow its own switch and the two would eventually disagree about what `swipe` means. A test asserts every name in `TOOL_NAMES` is wired, which is what would catch a tool added to the vocabulary and connected to nothing.

**Verification**

```
pnpm turbo run typecheck lint test build     60/60 tasks, 782 TypeScript tests
pnpm format:check                            clean
pnpm install --frozen-lockfile               clean
cd android && gradle ktlintCheck             clean across all modules
npx react-native bundle --dev false          succeeds
```

The bundle check mattered here: `ai-agent`, `prompt-engine`, `tool-sdk`, and `shared-types` were switched to source entrypoints because the app now imports them, and pointing at `dist/` breaks the release bundle while the debug APK still passes — the exact regression that cost a CI round trip in Phase 3.

CI runs `33137160631` (Android) and `33137160688` (TypeScript) are green, including both APKs and instrumentation on API 26 and 34.

**The flagship scenario** runs `"Send Robert a WhatsApp message that I'll be late tomorrow"` against a simulated phone whose screen **only advances when the right action is taken**, and a model that reacts to the rendered tree rather than following a fixed script. That construction is what gives the test value: it fails if the loop ever stops putting the screen in context. It covers the happy path, recovery when the agent tries to send before typing, that taps are recorded as selectors rather than coordinates, and that an unvalidated call never reaches the device.

**Files**

```
packages/tool-sdk/src/{names,arguments,definitions,validation}.ts
packages/prompt-engine/src/{template,redaction,agent-context,node-config-context,generation-context,parser}.ts
packages/ai-agent/src/{provider,memory,events,loop}.ts       + scenario.test.ts
packages/native-automation/src/tools.ts                      invokeTool dispatch
apps/mobile/src/features/agent/{AgentScreen,AgentEventRow,ProviderSettingsScreen}.tsx
apps/mobile/src/features/agent/{useAgentRun,providerSettings}.ts
apps/mobile/android/.../settings/{ProviderCredentialStore,ProviderSettingsModule}.kt
```

**Commit:** `578e36c`

### Not yet verified on a real device

The definition of done requires the WhatsApp scenario completing on hardware. Everything up to the tool call is proven against a simulated phone; the last hop needs a device, an enabled accessibility service, and a real provider key.

### Deliberately deferred

- **Streaming completions.** The loop needs a whole tool call before it can act, so streaming would only make the "thinking" text appear sooner. Worth adding when the UI has somewhere to stream into.
- **Vision.** `takeScreenshot` is offered and the context carries a screenshot path, but no image is sent to the model. Doing so needs a vision-capable provider and a cost decision, and it is also what would complete the selector chain's seventh step at run time.
- **The foreground service is not started for an agent run.** A run currently dies if the user leaves the app. The plumbing exists (`startAutomationService`); wiring it belongs with the run-persistence work in Phase 9.
- **`execution-recorder` is still a scaffold.** The seam it will consume now exists and is tested, which was the point of building it here.

---

## Phase 6 — Workflow Builder UI (complete)

The app now has a front door: a list of workflows, one of which you can open, edit, run, and watch happen.

### The canvas

Skia + Reanimated + Gesture Handler, arranged so the camera never crosses into JavaScript during a gesture. Pan and pinch write to **shared values on the UI thread** and commit to the store only on release (ADR 0003) — writing every frame would put a store update, a React reconcile, and a bridge hop between the finger and the pixels, and the canvas would visibly lag the touch.

Everything draws inside one `Group` carrying the camera transform, so panning changes a transform rather than rebuilding paths. The grid is one `Path` with a bounded line count: a node per line would mean hundreds of Skia elements reconciled on every zoom, and an unbounded loop at maximum zoom-out would freeze rather than degrade.

Two interaction rules decide whether the canvas feels deliberate or fidgety:

- **Ports are hit-tested before node bodies.** A port sits on the node's edge, so a touch near it is inside both. Testing the body first makes drawing an edge nearly impossible, because every attempt drags the node instead.
- **The port touch radius is 22px against a 7px drawn dot.** A 7px circle is a reasonable thing to look at and an unreasonable thing to hit with a fingertip.

The camera maths has two non-obvious corrections. Pan divides by scale, so a drag moves content the same screen distance at every zoom — without it, panning while zoomed out feels sluggish and while zoomed in feels violent. Pinch zooms about the **focal point**, because scaling about the origin makes content shoot away from the fingers, which feels like the canvas is fighting back.

Gestures are composed `Simultaneous(Exclusive(node, camera), tap)`: a drag starting on a node moves the node, a drag on empty canvas moves the view, and a pinch always zooms. Without the explicit ordering, Gesture Handler resolves the race by activation order, which varies with where the finger lands.

Other decisions worth keeping:

- Only an **input port** completes an edge. Dropping on a node body is ambiguous when it has several inputs, and guessing would silently wire the wrong handle.
- Nodes are hit-tested in reverse, so the one drawn on top is the one selected.
- Node size is fixed rather than measured. Measuring text inside a Skia canvas would mean a layout pass per node per frame, and a uniform grid is easier to read anyway.
- Run state **overrides** selection on a node's border: during a run, which step is live matters more than which node was last tapped.
- Culling is padded by a node's width, because culling exactly at the boundary makes edges visibly pop in and out at the screen edge.

### The node editor

`packages/node-sdk/src/introspection.ts` reads a node's Zod config into field descriptors, and the form is generated from those. **This is what lets the builder edit a node it has never heard of**, including one from a third-party package installed after the app shipped. A hand-written form per node type could not do that, and would drift from the schema the executor actually validates against.

| Decision                                                | Why                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Unwraps `optional`/`default`/`describe`/`refine` stacks | Otherwise an ordinary field reads as an unsupported wrapper and renders as raw JSON  |
| Union branches stay separate, keyed by discriminator    | Flattening shows every variant's fields at once, most invalid together               |
| Selector recognised **structurally**                    | A third-party node using the same shape gets the element picker, not nine text boxes |
| Exotic types degrade to a JSON editor                   | An unusual node stays editable rather than breaking the editor                       |
| Discriminator rendered as a fixed choice                | An editable one invites setting it to something the schema then rejects              |

The form validates on every change but writes back **only when the problem is not in the field being edited**, so fields can be filled in any order rather than the user being blocked until the whole config is valid.

The selector control is where durability is decided, so it names it: "By id — survives app updates" against "By position — will break if the layout changes". Typing a resourceId by hand is something nobody will do, so the picker has to be the easy path (ADR 0009).

### Stores

Three, one per domain (ADR 0003). Splitting them is not tidiness: selection changes on every tap, and a node that only cares whether it is selected must not re-render when another node's config changes.

`canvasStore` holds the working copy as normalized keyed maps and **refuses invalid shapes at the point of drawing** rather than at the point of running:

- A self-loop is refused — it is always a cycle the loader rejects.
- An exact duplicate edge is refused.
- A second edge from one output handle **replaces** the first. The executor follows only the first edge from a handle, so a second would be drawn but never taken, and a silently dead connection is worse than a replaced one.
- Deleting a node takes its edges with it, or the workflow fails to load with a dangling-edge error the user cannot see on the canvas.

`executionStore` is fed by the engine's event stream, with a 500-entry log cap — a thousand-iteration loop would otherwise make the log unscrollable.

### Persistence

A new **`android/storage`** Gradle module, Room-backed (ADR 0005).

The workflow document is **one JSON column**, not decomposed into node and edge tables. Node config schemas are owned by TypeScript and by third-party packages, so a relational shape here would mirror something Kotlin cannot validate and would need a migration every time a node package changed. As an opaque column it is stable.

Summary queries exclude the document, so listing workflows never reads them — fifty saved workflows would otherwise be several megabytes for a screen that shows names. `WorkflowDocumentReader` hand-rolls its parsing because **`org.json` is stubbed in JVM unit tests**, the same reason `android/bridge` does; a parser built on it would appear to work in tests and report every workflow as empty on a device.

**No destructive migration fallback.** Losing a user's saved workflows on a schema change is not an acceptable upgrade path, so every future version must ship a real migration.

Validation happens on the way **in** as well as out: a document written by an older version, hand-edited, or model-generated could be anything, and loading it unchecked would put an invalid workflow onto a canvas where every subsequent operation assumes it is well-formed. Saving an invalid document is refused, because a workflow that cannot be loaded back is not saved in any useful sense.

### Running from the canvas

The real engine, through `invokeTool`, with node borders coloured by live state and every event appended to a log. Load errors are kept **separate** from run failures because they mean different things to the user: one means the workflow is invalid and nothing happened, the other means the phone was driven and something went wrong partway. Collapsing them would leave someone unsure whether their device had been touched.

The log auto-scrolls while running and stops following when the run ends, so the user can read back through what happened without the list moving under them.

### Screen inspector

Its real job is not listing elements — it is showing **how durable each one is to target**. An inspector that just lists them invites picking whatever is convenient, and the convenient choice is usually coordinates. Every row names its strategy, coordinates are marked fragile, and the selector is computed in the same priority order as the Kotlin resolver — so what the inspector offers is what the device will actually try first.

The tree is flattened to targetable elements only. A full tree is mostly layout containers, and listing them buries the twelve things that matter under two hundred that do not. A tree whose schema version this build cannot read is **refused rather than partially read**, since misreading it would show elements that are not there.

### Create by AI

Deliberately **not** the agent loop. The agent drives the device to achieve a goal now; this produces a reusable workflow without touching the phone, which is what "create a workflow" means. Compiling an agent trace into a workflow is a better path for a task the user is doing anyway — that is Phase 9.

Output is validated against `WorkflowSchema` and every node's own config schema before it reaches the canvas, and it is loaded **unsaved** so the user reviews it first. A generated workflow is exactly the case where unchecked output does most damage: it looks authoritative, the user did not write it, and it drives their phone.

The document shape is described by hand rather than converted from the full Zod schema. The complete schema is thousands of tokens of recursive definitions, and a model given all of it reliably spends its attention on the wrong parts.

### `packages/ui` grew a component library

`Button`, `Card`, `Badge`, `Field`, `TextField`, `NumberField`, `Select`, `Toggle`, `EmptyState` — all semantic classes, no raw values. Two are worth explaining:

- **`NumberField` keeps its own text.** Parsing on every keystroke makes `1.` collapse to `1` and `-` impossible to type, because both are invalid numbers mid-entry.
- **`Select` is segmented, not a dropdown.** Node config enums have two to five options; every one visible and one tap away beats a picker that hides them behind a modal.

Components are written with `createElement` so the package stays `.ts` throughout — a couple of `.tsx` files would split its build configuration for no gain.

### Metro entrypoints

Seven packages gained a **`react-native` entrypoint field** pointing at source. Metro and Jest read it; Node and vitest keep `main` at `dist`. That avoids the Phase 3 release-bundle trap — a `dist` entry breaks the release bundle while the debug APK still passes — without making every package source-only and losing the published-package story for `node-sdk`, `core-nodes`, and `android-nodes`.

**Verification**

```
pnpm turbo run typecheck lint test build     60/60 tasks, 890 TypeScript tests
                                             (802 in packages, 88 in the app)
pnpm format:check                            clean
pnpm install --frozen-lockfile               clean
cd android && gradle ktlintCheck testDebugUnitTest   472 tests, 8 modules, clean
npx react-native bundle --dev false          succeeds
```

The bundle check is the one that matters most here: it proves Metro resolves Skia and Gesture Handler, and that the entrypoint change still bundles for release.

CI runs `33143486251` (Android) and `33143486309` (TypeScript) are green, including both APKs and instrumentation on API 26 and 34.

**A CI failure worth recording.** The first push failed both APK builds with `Cannot access androidx.room.RoomDatabase which is a supertype of AutomationDatabase`. The app module was calling `AutomationDatabase.get(...)` directly, and `:storage` declared room-runtime as `implementation`. Local ktlint and unit tests could not catch it, because **neither compiles the app module** — only an assemble does, and those are CI-only (ADR 0010). Fixed by making `WorkflowStore` the module's only public surface, so Room types stay behind the boundary, plus exposing room-runtime as `api`. `gradle :storage:assembleDebug` locally is what would have caught it.

**Files**

```
apps/mobile/src/features/canvas/{geometry,canvasStore,selectionStore,executionStore}.ts
apps/mobile/src/features/canvas/{useCamera,useCanvasInteraction,useWorkflowRun,registry}.ts
apps/mobile/src/features/canvas/{CanvasScene,CanvasScreen,ExecutionLog}.tsx
apps/mobile/src/features/node-editor/{SchemaForm,NodeInspector,NodePalette}.tsx
apps/mobile/src/features/workflows/{storage,useWorkflowGeneration}.ts
apps/mobile/src/features/workflows/{WorkflowListScreen,CreateWithAiScreen}.tsx
apps/mobile/src/features/inspector/{inspectScreen.ts,ScreenInspectorScreen.tsx}
apps/mobile/src/features/shell/RootScreen.tsx          tab + modal routing
packages/node-sdk/src/introspection.ts                 schema → form descriptors
packages/ui/src/components/{Button,Card,Field}.ts
android/storage/                                       new Room module
apps/mobile/android/.../storage/WorkflowStorageModule.kt
```

**Commits:** `76eac4c`, `bc516e4`

### Not yet verified on a real device

- **60fps with dozens of nodes.** The architecture is right — gestures on the UI thread, one transform, culling — but frame timing is a device measurement.
- **A workflow running end to end**, which is also Phase 5's outstanding definition-of-done item and is now reachable from the UI.
- **Room persistence across restarts.**

### Deliberately deferred

- **react-navigation.** The shell is a tab switch plus one modal route. Five destinations, one of them a full-bleed canvas, did not justify a navigator; Phase 8's overlay is where real routing needs deciding.
- **Node labels are drawn by Skia's text primitive.** Adequate, but shipping a font file for better typography is a size cost worth weighing later.
- **No multi-select, copy/paste, or undo.** Each is a real feature rather than a polish item, and none is needed to build and run a workflow.
- **Variables have no editor.** They are read and displayed during a run; declaring them by hand comes with the Input-node work.
- **The "Configure with AI" button exists and is disabled.** A feature that appears from nowhere in a later release is harder to find than one whose place is already visible.

---

## Phase 9 — Execution Recorder & Workflow Generation (complete)

The agent run you just watched can now become a workflow you keep. Recording is a first-class subsystem rather than a logging afterthought: every tool call is captured richly enough that the trace compiles into something durable.

### The recorder owns no capture logic

`toolExecuted` was built in Phase 7 carrying everything an `ExecutionStep` needs — screen identity, the UI tree before the action, the resolved element and which strategy matched, the result or error, the screen after. So `packages/execution-recorder` **shapes and trims rather than collecting**. Two places deciding what a step is would be one too many, and the seam was designed for exactly this: Phase 9 never reopened the agent loop.

Its one substantive job is trimming results. A `getUiTree` result is tens of thousands of characters, and the tree is already stored once per step as `uiTreeBefore` — keeping it again as a result would store the same screen twice. It is truncated rather than dropped, because a partial result still tells a reader what the step returned, and a step with no result looks like it did nothing.

It ignores events when no trace is open rather than throwing. Crashing an agent that is driving someone's phone is worse than losing a recording.

Screenshots are held as **paths, never bytes**. A twenty-step trace with inline images would be tens of megabytes in one database row.

### `waitForElement` is not an observation

The generator collapses screen reads, because a trace is dense with observations the agent needed in order to _decide_ and which a workflow does not need to repeat. Left in they triple the node count and make the canvas unreadable.

`waitForElement` looks like an observation and is deliberately excluded from the list. It is load-bearing: removing it produces a workflow that works when replayed slowly and fails on a cold start, which is the worst kind of intermittent.

### The generator is deterministic

No model is involved. The trace already says exactly what happened, and asking a model to restate it would introduce a chance of it saying something else. Model-assisted generation from a _goal_ is the separate Create-by-AI path built in Phase 6.

**`improveSelector` is where the durability comes from.** A trace is full of coordinates because that is where taps landed; a workflow built from those breaks on the next app update. So the generator walks the resolved element strongest-first — exactly as the runtime resolver does, so the generated selector is one the device will match by the strategy it claims (ADR 0009).

| Available on the element | Generated strategy       | What the user is told                       |
| ------------------------ | ------------------------ | ------------------------------------------- |
| `resourceId`             | `resourceId`             | survives updates and translation            |
| `contentDescription`     | `accessibilitySemantics` | stable across layout changes                |
| `text`                   | `text`                   | may break if the app is translated          |
| bounds only              | `relativePosition`       | consider replacing via the screen inspector |
| nothing                  | recorded selector        | will break if the layout changes            |

In the WhatsApp scenario this is not theoretical: step 3 taps by accessibility label, and the generated node carries `com.whatsapp:id/menuitem_search`.

Bounds are kept **alongside** a strong selector as the fallback that keeps the chain resolvable when an app update removes the id. Every selector is scoped to the screen it was recorded on, because one package renders many screens and a "Send" selector from a conversation must not resolve against the chat list.

Other decisions worth keeping:

- **Every omission is reported with a reason.** A silent collapse from nine steps to six looks like data loss.
- **Typed text becomes a named variable**, with the recorded value as the default. A workflow hardcoded to "I'll be late tomorrow" can be replayed but not reused, and reuse is the point of generating one. Names come from the field (`searchInput`, `entry`) rather than being numbered — the difference between a reusable workflow and a puzzle.
- **A wait gets retries; a tap does not.** Retrying a tap could submit a form twice, and the recorded run only ever tapped once.
- **`openApp` prefers the package name** even when the agent opened the app by label, since the recorder always knows the exact package.
- **Failed steps are excluded but stay in the trace.** Replaying one would reproduce the failure rather than the outcome; keeping it explains why the next step looks like a repeat.
- **The chain is straight.** Inventing branches from a linear recording would produce a workflow whose shape the user never demonstrated.

### Replay checking is pre-flight, not simulation

The definition of done asks that a generated workflow "reproduces the outcome". The honest answer is that only a device can confirm that, so `checkReplay` checks what is derivable from the two documents and does not pretend to more. **Claiming to have verified a replay without running it would be worse than not checking, because the user would trust the result.**

Blocking problems are kept apart from warnings because they demand different things:

- **Blocking** — a selector with nothing to locate by (the workflow would fail with "element not found", sending the user to look at their phone rather than at their workflow), or no actions at all.
- **Warning** — a position-based selector, a screen change with no wait after it, a step that succeeded but did not become a node, a selector scoped to a screen the run never visited.

The missing-wait check reads screen changes **from the trace** rather than guessing from node types, because whether a tap opens a new screen is a fact about the app, not about the tool.

### Persistence

`android/storage` gains a traces table, on the same reasoning as workflows: one JSON document column, because a trace's shape is owned by TypeScript.

Screenshots stay files with paths inside the document (ADR 0005), and the **directory is stored on the row** so deleting a trace can delete its files — without that, removing a trace would leave orphaned images nothing ever cleans up. `TraceScreenshotStore` handles the rest of what that design allows: orphan cleanup for a crash between writing files and committing the row, and id sanitising so a path can never escape its root.

The **1→2 migration is written by hand** rather than falling back to a destructive one. Someone upgrading has workflows they built and expect to still be there.

Traces prune to the newest twenty on write. They accumulate with every agent run and each carries screenshots; unbounded growth would quietly consume a user's storage for recordings they will never open again. Pruning happens on write because that is the only moment the app is certainly running and the user is certainly not reading an older trace.

### In the app

**Recording is automatic, not opt-in.** The decision to keep a run as a workflow is made _after_ watching it succeed, so an opt-in would mean the interesting runs are the ones nobody recorded. Failed runs are saved too — often the more interesting recording, and the one a user wants to look at.

The recorder is fed before the `mounted` check in `useAgentRun`, so a run that outlives its screen still produces a complete trace.

`AgentScreen` offers "Build a workflow from this run" at the moment the user has just watched it work, rather than making them find the recording later.

`TraceReviewScreen`'s job is not displaying a trace — it is letting the user **judge a workflow they did not write**. In order of importance it says: what was dropped and why, how durable each step is with a plain-language rationale, and what would stop it running at all, kept visually separate from what is merely worth checking. It also shows the full recorded trace, including the steps the workflow does not use.

The generated workflow arrives on the canvas **unsaved**, with execution state cleared: a generated workflow showing the previous run's green and red marks would be claiming things about steps that never ran.

`RecordedRunsScreen` lists past runs and states what recordings cost in storage. A feature that quietly consumes space is one a user will resent later.

**Verification**

```
pnpm turbo run typecheck lint test build     60/60 tasks, 1002 TypeScript tests
                                             (902 in packages, 100 in the app)
pnpm format:check                            clean
pnpm install --frozen-lockfile               clean
cd android && gradle ktlintCheck testDebugUnitTest   483 tests, 8 modules, clean
npx react-native bundle --dev false          succeeds
```

CI runs `33148607526` (Android) and `33148607576` (TypeScript) are green, including both APKs and instrumentation on API 26 and 34.

**The scenario test records the nine-step WhatsApp run exactly as `ai-agent` emits it**, then generates and checks. That construction is what gives it value: if `toolExecuted` ever loses a field, the test fails rather than the recorder silently producing a poorer trace. It proves nine steps collapse to six, the label-tapped step generates a `resourceId`, both typed values become named variables, and **no coordinates appear anywhere in the output**.

Also added `apps/mobile/src/test/renderWithTheme.tsx`, needed because `useTheme` throws outside `ThemeProvider` by design — a component silently falling back to default colours would be worse than a loud failure.

**Files**

```
packages/execution-recorder/src/{schema,recorder,generator,replay}.ts
packages/execution-recorder/src/scenario.test.ts        the WhatsApp run end to end
apps/mobile/src/features/recorder/{traceStorage,useTraceWorkflow}.ts
apps/mobile/src/features/recorder/{TraceReviewScreen,RecordedRunsScreen}.tsx
apps/mobile/src/features/agent/useAgentRun.ts           records every run
android/storage/src/main/kotlin/.../{TraceEntity,TraceDao,TraceScreenshotStore}.kt
android/storage/src/main/kotlin/.../AutomationDatabase.kt   migration 1→2
```

**Commit:** `b10c4a3`

### Not yet verified on a real device

- **Replaying a generated workflow**, which is the half of the definition of done that hardware owns. Everything up to the tool call is proven against a recorded trace.
- **Screenshots are not yet captured per step.** The path field, the directory, and the cleanup all exist; wiring `takeScreenshot` into the recording loop needs MediaProjection consent and a decision about how often to capture, since a screenshot per step at full resolution is a real storage cost.

### Deliberately deferred

- **No screenshot per step yet** — see above. The trace carries `uiTreeBefore`, which is what generation actually needs; screenshots are for the user's benefit when reviewing.
- **No trace-to-trace diffing.** Comparing two runs of the same goal would be a good way to find the fragile step, but it needs several recordings of the same task to be useful.
- **The generator produces a straight chain.** A trace where the agent recovered from a failure contains the information for a condition node, but inferring one would be guessing at intent the user never expressed.
- **Vision fallback still not wired.** Unchanged from Phase 7: the plumbing exists, and it needs a vision-capable model plus a cost decision.

---

## Phase 8 — Configure-With-AI Floating Overlay (complete)

Select a step, tap **Configure with AI**, switch to WhatsApp, type "Return true if the Send button is visible" — and the condition node fills itself in. **Milestone M4 closes here.**

### Why it is a real window

The overlay is a `WindowManager` window hosting its own React root, not a React Native modal. That is the entire feature: **a modal disappears the moment the user switches to the app they are configuring against**, which is precisely when the toolset is needed. Only `SYSTEM_ALERT_WINDOW` survives leaving the app.

So there are now **two React roots in one process**, registered separately in `index.js` and mounted by Kotlin into different windows. The overlay shares no component tree with the app, which forces two things:

- **The bound node id crosses as an initial prop.** Not through a store or an event — there is no shared React context to read from. Passing it at mount means the overlay can never render without knowing which node it is configuring.
- **Shared state comes from the Zustand store module both roots import.** Which is exactly how a store living outside React is supposed to work (ADR 0003): a config the overlay produces lands in the canvas store, and the node editor updates itself with no navigation and no message passing.

### The new architecture caught a real bug

`OverlayReactHost` was first written against `ReactRootView.startReactApplication`. That does not work here: this app runs `newArchEnabled=true`, and **under bridgeless there is no `ReactInstanceManager`** to start a root view against. It compiles against the old API and fails at runtime.

Rewritten to use `ReactHost.createSurface`. Its return is nullable, and rather than throwing inside `WindowManager.addView` — which would leave a half-created overlay the user cannot dismiss — a null host returns an empty container that still closes.

`gradle :app:compileDebugKotlin` is what found this, because ktlint and unit tests do not compile the app module.

### Typed failures, because the UI must respond differently

`OverlayManager` now returns `OverlayResult` rather than a boolean. Three failures need three responses, and a boolean collapses them into "it didn't work":

| Failure             | What the UI does                       |
| ------------------- | -------------------------------------- |
| `PERMISSION_DENIED` | offers a deep link to Android settings |
| `NO_BOUND_NODE`     | nothing — it is a programming error    |
| `WINDOW_REJECTED`   | reports it, without blaming the user   |
| `NOT_SHOWING`       | nothing to do                          |

`OverlayState` was added as a consistent snapshot. Reading `isShowing` and then `boundNodeId` separately invites a state that never existed, since the user can dismiss the overlay between the two reads.

### Two window flags that decide whether this works at all

- **`FLAG_ALT_FOCUSABLE_IM` paired with `FLAG_NOT_FOCUSABLE`.** `NOT_FOCUSABLE` is what stops the overlay stealing touches meant for the app underneath — but on its own it also means the soft keyboard never opens for the overlay's own text field, so the user could never type the instruction the whole feature exists to accept.
- **`SOFT_INPUT_ADJUST_RESIZE` rather than pan.** Panning slides the toolset off screen when the keyboard opens, which is exactly when it needs to be visible.

Neither fails loudly. Both would present as "the overlay is broken".

### The model contract already existed

Everything on the prompt side was built in Phase 7: `buildNodeConfigContext` assembles the `Data_Models` payload, and `parseStructured` distinguishes "no JSON" from "wrong shape". So this phase is the window plus the UI, not a second prompt pipeline — which is what the early investment was for.

The one new piece is **`configJsonSchemaFor`**, which derives the model's schema from `describeSchema` — the same field descriptors that drive the node editor's form. One source, two consumers: what the user sees as a form and what the model is told to produce cannot silently diverge from the Zod schema that validates both.

Output is validated against **the node's own `configSchema`**, the same schema the executor applies, so a shape failure cannot move to run time. Two attempts; the second carries the validation error as a correction.

The proposal is **offered, not applied**. The user is standing in another app and cannot see the node, so it arrives with a one-line summary ("Checks element exists for 'Send'") and Apply/Discard. A silent write would leave them unable to tell whether anything happened, let alone whether it was right.

### Test Action never performs the action

Testing a `click` resolves the element via `findElement` rather than tapping it; testing `typeText` checks the field is there rather than typing into it. **A "test" that sent a message would be indefensible** — the user is checking a configuration, not asking to act.

It tests the AI's pending proposal in preference to the saved config, since that is the point of testing before accepting. `argumentsFor` reads both the direct `selector` and a condition node's nested one, so the very node type the phase's definition of done names does not silently find nothing.

### Smaller decisions

- **The compact set is a fixed four** — Ask, Element, Screen, Node — rather than the first four declared, because those are the ones that matter. Choosing a tool the compact layout does not show expands automatically instead of making the user press the eye toggle first.
- **The coordinate inspector's real job is getting the user _off_ a coordinate.** It probes the point, finds a real element there if one exists, and upgrades the selection. Every element row states its durability, for the same reason the standalone screen inspector does (ADR 0009).
- **Every device call goes through `invokeTool`**, the same by-name dispatch the agent and the workflow engine use. Nothing here reimplements a capability.
- **Screenshots stay paths.** An image in JS state would cross the bridge as base64 and defeat the by-reference design.
- **The overlay hides on `invalidate()`.** A `WindowManager` window is owned by the system, not the activity, so a reload would otherwise leave an orphaned overlay nothing can dismiss.
- **`onOverlayDismissed` exists** because the window can be closed from inside itself or torn down with the React context; without it the app's button would keep claiming the toolset is open.

**Verification**

```
pnpm turbo run typecheck lint test build     60/60 tasks, 1069 TypeScript tests
pnpm format:check                            clean
pnpm install --frozen-lockfile               clean
cd android && gradle ktlintCheck testDebugUnitTest   498 tests, 8 modules, clean
gradle :overlays:assembleDebug                       clean
cd apps/mobile/android && gradle :app:compileDebugKotlin   clean
npx react-native bundle --dev false          succeeds, both roots registered
```

CI runs `33158531604` (Android) and `33158531545` (TypeScript) are green.

**Two real issues were found by the new tests**, not by review: `bind()` reset on every remount, discarding the user's screen reading on a re-render; and the Ask AI button duplicated the tool tab's accessibility label, so a screen reader announced "Ask AI" twice with no way to tell them apart.

**A CI failure worth recording — the assemble trap, second form.** The first push failed both instrumentation jobs: `OverlayManagerInstrumentedTest` still asserted on booleans after the switch to `OverlayResult`. **Neither ktlint nor unit tests compile the `androidTest` source set** — only `assembleDebugAndroidTest` does. Phase 6 hit the same shape of problem with the app module. Both source sets need an explicit assemble to be checked at all.

**Files**

```
android/overlays/src/main/kotlin/.../{OverlayState,FakeOverlayManager}.kt
android/overlays/src/main/kotlin/.../{OverlayManager,WindowManagerOverlayManager}.kt
apps/mobile/android/app/src/main/kotlin/.../overlay/{OverlayReactHost,OverlayModule}.kt
packages/native-automation/src/overlay.ts        the only place TS touches the window
apps/mobile/src/overlay/OverlayRoot.tsx          the second React root
apps/mobile/src/features/overlay/{overlayStore,configJsonSchema}.ts
apps/mobile/src/features/overlay/{useAskAi,useOverlayTools,useOverlayLauncher}.ts
apps/mobile/src/features/overlay/ConfigureOverlay.tsx
```

**Commits:** `370c45a`, `91e50af`

### Not yet verified on a real device

The definition of done needs hardware: open the overlay on a condition node, switch to WhatsApp, type the instruction, and get `{ condition: { type: "element_exists", selector: { text: "Send" } } }` back. That needs `SYSTEM_ALERT_WINDOW` granted by hand and a real provider key. Everything up to the model call is covered by tests, including that exact config passing the condition node's schema.

Also unverified on device: whether the compact overlay is genuinely usable one-handed, and whether the keyboard flags behave as intended on a manufacturer skin.

### Deliberately deferred

- **The overlay is not draggable yet.** `moveOverlay` exists and clamps correctly, but no gesture is wired to it — the anchored position is reachable, and a drag handle inside a 30%-height window competes with the tool row for space.
- **No screenshot is sent to the model.** The path is captured and named in the prompt, but no image crosses. Same blocker as Phase 7: a vision-capable model and a cost decision.
- **The eye toggle changes which tools are listed, not the window's height in one motion.** `setLayout` resizes the window and the RN content reflows; a synchronised animation would need the two sides to agree on timing.
- **No overlay-driven element picking by tapping the app underneath.** `NOT_FOCUSABLE` means the overlay cannot intercept touches meant for the app, which is deliberate — picking is done from the element list instead.

---

# The plan changed here

Everything above was built under the **phase** plan, and phases 0–9 all shipped green. Device testing then established that **the engines largely work and the product around them does not**: the UI had been built as a six-tab home screen when the product is two separate modes, the agent stopped the moment the user left the app, the overlay crashed on open, and the canvas drew nodes as blank rectangles with a drag that fought its own selection.

So `Development_Plan/` was restructured (commit `b0c1c60`). `phases/` is gone; `steps/` holds **13 numbered steps** that rebuild the product surface on top of the engines, fix what device testing found, and add what the original plan did not anticipate — the mode-based shell, permission onboarding, background execution, OCR, and per-node screen tooling. `03_Issue_Register.md` records every confirmed defect with a stable ID, and each step names the IDs it closes.

Four ADRs came out of that testing: **0011** two modes not tabs, **0012** the agent loop stays in JS kept alive by a foreground service, **0013** perception as a fallback chain, **0014** one loop engine several agents.

**Nothing above this line is edited.** The record of what was built stands; the sections below record the rebuild.

---

## Step 1 — App Shell & Onboarding (complete)

A first launch now shows a welcome screen, then permission setup, then a mode switcher — never the canvas. **Closes A1, A2, A3, A4, A5.**

### Why the tab bar had to go

The old shell was a six-tab switch: Workflows, Agent, Runs, Screen inspector, Status, Provider. Tabs imply the destinations are peers within one interface, but this product is two things that share a device runtime and share nothing else: different navigation, different settings, different sessions, different memory. **Under tabs, "switch modes" has no meaning** and the per-mode settings screens have nowhere to live (ADR 0011).

Two tabs are gone entirely. **Status** exposed internal phase state to the user. **Screen inspector** was worse than useless — run from inside the app it reads _our own_ screen, because the app in the foreground when you press its button is this one. Screen inspection only means anything from an overlay, which is why Step 9 rebuilds it there. `features/inspector/inspectScreen.ts` was kept: its element flattening and selector scoring is exactly what that overlay needs, and `ConfigureOverlay` already imports `strategyDescription` from it.

### A typed route store, not react-navigation (ADR 0015)

This decision had been deferred twice — Phase 6 judged five destinations not worth a navigator, and Phase 8 turned out not to need one either because the overlay became a second React root rather than a route. The shell is now deep enough that it had to be settled.

**The decisive argument is ADR 0011.** The two modes must share no navigation. With one navigator, keeping two parallel stacks honest is a discipline problem; with a discriminated union per mode, an Agent Mode route in Workflow Mode is a **type error**. The rule enforces itself rather than relying on care.

It is also readable from the overlay windows, which are separate React roots and cannot see a navigator's internal tree — and it keeps routing testable without rendering, which is where 27 of the new tests live.

The costs are real and recorded in the ADR: transitions and the Android back button are now ours to build, and there is no deep linking. `back()` is explicit per route and returns whether it consumed the press, **defaulting to letting the system handle it** rather than trapping the user. That is the part most likely to be got wrong, so every branch has a test.

### Preferences in SharedPreferences, not Room

Three scalars decide the first screen: onboarding done, last mode, theme choice. Room would mean a schema migration per preference and a query on the critical path of the first paint. AsyncStorage would be a new dependency for three booleans.

So a new `AppPreferences` / `AppPreferencesModule` pair. `readPreferencesSync` is **the one blocking native call in the app**, and it is justified: the alternative is rendering a placeholder and correcting it, which for the very first screen means briefly showing the welcome screen to someone who finished onboarding weeks ago. The TypeScript side narrows the stored strings so a corrupt value cannot become an invalid mode, and falls back to defaults — meaning onboarding — when the module is absent.

### The rules worth stating

- **Entering a mode always lands on that mode's home, and leaving resets it.** Reopening into a canvas whose workflow may have changed on disk is a bug waiting to happen. `lastMode` is a hint for highlighting the switcher, not a route to restore.
- **The mode switcher is a destination, not a splash screen.** It is where the user returns from either mode, so the two modes are its content and settings is a corner action. The last-used mode is marked so a returning user sees continuity without being routed automatically.
- **The transition animation is informational.** A whole-screen movement — fade plus a 24px rise, decelerating over 260ms, on Reanimated shared values, keyed on the mode so switching replays it. Choosing a mode replaces the entire interface, and without a transition that is indistinguishable from a tab switch, which is precisely the impression ADR 0011 exists to avoid.
- **The trace review route carries an id, not a trace.** "Build a workflow from this run" now crosses from Agent Mode into Workflow Mode, since turning a run into a workflow is that mode's job. Passing the object would push a large payload through shell state, and a trace deleted in between would render as stale content instead of "no longer exists".
- **Neither mode shares a header component.** A shared header is the first thing that quietly re-couples two interfaces meant to be able to diverge.
- **The provider stays root-level.** Both modes' settings link to it rather than embedding it, so it cannot be configured twice and drift.
- **Data management shows what is stored before offering to delete it.** A clear-data button with no indication of what it removes is one nobody can press with confidence. Deletion confirms first.

### Three test-infrastructure fixes, each a real trap

- **`jest.setup.js` now requires gesture-handler's and Skia's own `jestSetup`.** Both install native modules at _import_ time, so any test reaching the canvas — which now includes the shell — died on import rather than on a render.
- **`transformIgnorePatterns` gained `@shopify`**, which ships untranspiled ESM.
- **`renderWithTheme` wraps `SafeAreaProvider` with explicit `initialMetrics`.** Without a frame it renders nothing under Jest, so every query fails against an empty tree — which presents as a broken component rather than a missing measurement.

The `act()` warnings that appeared were **fixed rather than silenced**. The shell subscribes to the store, so a render left mounted between tests gets updated by the next test's `setRoute`; the fix is `cleanup()` in `afterEach` plus an explicit unmount in the one test that switches modes mid-test.

**Verification**

```
pnpm turbo run typecheck lint test build     60/60 tasks, 198 app Jest tests (11 suites)
pnpm format:check                            clean
pnpm install --frozen-lockfile               clean
cd android && gradle ktlintCheck testDebugUnitTest   498 tests, 8 modules, clean
cd apps/mobile/android && gradle :app:compileDebugKotlin   clean
npx react-native bundle --dev false          succeeds
```

`:app:compileDebugKotlin` is what actually verifies the new `AppPreferencesModule` is wired into `AutomationPackage`, since ktlint and unit tests do not compile the app module.

CI runs `33193684749` (Android) and `33193684753` (TypeScript) are green, both APKs and instrumentation on API 26 and 34 included.

**RootScreen is now 82 lines doing three things** — render the route, play the transition, own the Android back button — against 251 lines of tab switch before.

**Files**

```
Development_Plan/decisions/0015-typed-route-store-not-react-navigation.md
apps/mobile/android/app/.../preferences/{AppPreferences,AppPreferencesModule}.kt
apps/mobile/src/features/shell/{shellStore,preferences,modes}.ts
apps/mobile/src/features/shell/{RootScreen,ModeSwitcherScreen,ModeTransition}.tsx
apps/mobile/src/features/shell/{RootSettingsScreen,ModeSettingsFooter}.tsx
apps/mobile/src/features/onboarding/{OnboardingFlow,WelcomeScreen,PermissionSetupScreen}.tsx
apps/mobile/src/features/agent-mode/AgentModeShell.tsx
apps/mobile/src/features/workflow-mode/WorkflowModeShell.tsx
deleted: features/home/*, features/inspector/ScreenInspectorScreen.tsx
```

**Commit:** `aae4af7`

### Deliberately partial, and saying so

- **`PermissionSetupScreen` does not yet block on the required tier.** It lists the five required capabilities with their rationale and embeds the live capability panel, but four of the five have no runtime prompt and the settings round trip is Step 2's work. The screen says as much rather than implying the list is complete.
- **Agent Mode's sessions and tools routes exist in the store but fall through to the chat.** Step 4 adds screens rather than reshaping navigation. Same for Workflow Mode's `loading` route, which Step 6 fills in.
- **The theme choice persists but the system option is the default.** Light and dark work; there is no per-mode theme, and there should not be.

### Not yet verified on a device

- **The blocking preferences read.** `getAllSync` is fast in principle — `SharedPreferences` is in memory after first access — but the cost on a cold start with a slow disk is unmeasured.
- **The transition animation's feel.** 260ms and 24px were chosen by judgement, not by watching it on hardware.
- **The back button through every route.** Every branch has a store test, but `BackHandler` integration itself is only exercised on a device.

---

## Startup crash after Step 1 (fixed)

The Step 1 build **would not open**. Worth its own section because the failure mode is one this project will meet again.

```
Unable to parse @ReactMethod annotation from native module method:
AppPreferences.getAllSync(). Details: Unable to parse JNI signature.
Detected unsupported return class: com.facebook.react.bridge.WritableNativeMap
```

`getAllSync` returned `WritableNativeMap`, the concrete class. React Native's `TurboModuleInteropUtils.convertReturnClassToJniType` validates return types with an **exact class comparison** — `returnClass == WritableMap.class` — so a subclass of a supported type is rejected even though it is assignable to it. Declaring the interface fixes it.

**Why it was fatal rather than a failed call.** Under the new architecture `NativeModules.X` is not a property read: it is a host-object getter that validates the module's whole method table on **first access**. That access happened while `preferences.ts` was being evaluated, during `shellStore`'s module initialisation, before any React error boundary existed. One bad signature therefore killed the app at startup.

**Why nothing caught it.** It compiles cleanly, ktlint does not inspect types, and no test touched the annotation. `:app:compileDebugKotlin` — which Step 1 did run — proves a module compiles and links, **not** that React Native can parse it. Those are different checks.

`ReactMethodSignatureTest` now reproduces RN's validation by reflection, with no React runtime: every `@ReactMethod` on every registered module is checked for a parseable return type, parseable parameter types, `void` when a Promise is present, and a Promise in final position, using the same exact-class sets RN uses. It was verified to fail against the old signature before the fix. This is the app module's first unit test; CI already ran `testDebugUnitTest` there, so no workflow change was needed.

The TypeScript wrapper now looks the module up inside a `try`, so a future signature mistake degrades to "no stored preferences" — which routes the user through onboarding — rather than an app that will not open.

**Commit:** `040a27d`

---

## Step 2 — Permission Engine (complete)

One registry that knows every capability, its tier, its rationale, how to read its state, and how to request it. **Closes E1, E2, E3, E4** and the permission half of B4.

### E1: the cause was none of the three candidates

The step file guessed at a lost activity result, an unheld projection token, or a status read asking whether capture was _currently active_. All three were wrong, and the real cause is more instructive.

`AutomationModule.notReadyStatusJson()` hardcoded `canCaptureScreen = false`, and `getStatus()` falls through to that stub whenever the accessibility service is off. **The consent flow worked correctly the whole time.** The status object simply reported screen capture as unavailable because a _different_ permission was missing — so a user who granted screen recording with accessibility still off was told it had not worked.

Fixed by reading each capability independently: `hasScreenCaptureSession()` is public on the runtime provider and the stub calls it. The lesson generalises: **a status object that lies about one capability because another is absent is worse than no status object at all.**

`AutomationRuntimeProvider` also gained `permissionGate(context)`, because capability state has to be readable when accessibility is **off** — which is exactly when the user is being asked to turn it on.

### Two new required capabilities, and two state reads that lie

**Default assistant role** for more precise screen reading, **usage access** for reliable foreground-app detection. Both are settings-granted, and both have a read that is not what it looks like. Both fail toward a **false positive** — the app believing it holds a permission it does not, which is the worst direction for a permission check to fail in.

- **Usage access is an appop, not a permission.** `PACKAGE_USAGE_STATS` must be declared in the manifest, and once it is, `checkSelfPermission` returns _granted_ whether or not the user ever allowed it. Only `AppOpsManager.unsafeCheckOpNoThrow(OPSTR_GET_USAGE_STATS, …)` reflects reality. `MODE_DEFAULT` means "fall back to the permission check", so it is confirmed rather than assumed either way. Had this been missed, the capability would have read as permanently granted and the feature would have failed at runtime with nothing to explain why.
- **The assistant role has no public API.** Read from the non-public `assistant` secure setting, which holds a `package/ServiceClass` string. The check is a **prefix match on the package**, not the whole component, so renaming our own service cannot silently revoke the capability.

### Tiers and grant mechanisms, replacing one boolean

`requiresSystemSettingsScreen` conflated four genuinely different flows. Now explicit, because the mechanism decides how the UI must behave:

| Mechanism         | Resolves with a result? | What the UI must do                                       |
| ----------------- | ----------------------- | --------------------------------------------------------- |
| `runtime_prompt`  | yes, via callback       | dialog, await, button says "Allow"                        |
| `settings_screen` | **no, none at all**     | deep-link, re-read on resume, button says "Open settings" |
| `session_consent` | only for this session   | request per session; granted is never permanent           |
| `install_time`    | n/a                     | nothing to request                                        |

The second row shapes the code. **Four of the five required capabilities are settings-granted**, so nothing can await them: `requestCapability` resolves with `settings_opened` rather than a boolean, and the app carries an `AppState` resume listener. Without that listener the user grants accessibility, returns, and the app still says it is off — the single most likely way this feature would appear broken.

### The registry and its boundary

`CapabilityRegistry` pairs each capability with its live state and its request mechanism. It holds **no Android types**, so it is unit-testable off-device, and it **describes** a request as a `CapabilityRequest` rather than performing one — launching an intent needs an Activity, which belongs to the React Native layer.

All rationale copy stays in Kotlin next to the capability, via an exhaustive `when` that will not compile if a capability has none. A screen writing its own explanation could describe a permission differently from the rationale the permission model requires, and the two would drift.

### Onboarding is now a real gate

Continue is disabled until every required capability is granted, and it **names what is still missing** — a greyed-out button with no explanation is the most frustrating thing an onboarding flow can do. Optional capabilities are listed and skippable: making someone grant contacts to reach the app they downloaded is precisely what the permission model exists to prevent.

`CapabilityRow` words its button from the grant mechanism. "Open settings" rather than "Allow", because pressing it allows nothing.

`PermissionsOverview` replaces the panel Step 1 left in root settings, which reported **three capabilities out of nine** — so the app could tell a user everything was fine while a permission it needed was missing.

### Just-in-time

The node palette requests a capability **after** adding the node, not before: asking first would mean a user who declines never gets the step they asked for, and they may be granting it in Settings at that moment. Nodes whose permission is missing are marked in the palette, so it is visible before a workflow is built around them rather than when the run stops.

`nodeCapabilities.ts` maps node type to capability in the **app** layer, not on the node definitions — a publishable node package should not carry Android permission ids.

### A zustand v5 trap

A selector returning `state.capabilities.filter(...)` creates a new array on every call, and v5 compares snapshots with `Object.is`. Subscribing to one re-renders forever, which presents as the app or the test runner **simply hanging, with no error**. Fixed by `useCapabilityViews.ts`: subscribe to the stable array, derive with `useMemo`. The plain selectors remain for tests and non-React callers, where calling them once is safe.

**Verification**

```
pnpm turbo run typecheck lint test build     60/60 tasks, 225 app Jest tests (13 suites)
pnpm format:check                            clean
pnpm install --frozen-lockfile               clean
cd android && gradle ktlintCheck testDebugUnitTest   537 tests, 9 modules, clean
cd apps/mobile/android && gradle :app:testDebugUnitTest   clean
npx react-native bundle --dev false          succeeds
```

CI runs `33233728079` (Android) and `33233728231` (TypeScript) green, all five Android jobs included.

**Files**

```
android/tools/.../SensitiveCapability.kt        tiers + grant mechanisms + ASSISTANT, USAGE_ACCESS
android/tools/.../AndroidPermissionGate.kt      appop and secure-setting reads
android/tools/.../CapabilityRegistry.kt         state + CapabilityRequest, no Android types
android/tools/.../PermissionRationale.kt        copy for the two new capabilities
apps/mobile/android/.../permissions/PermissionsModule.kt
apps/mobile/android/.../bridge/AutomationRuntimeProvider.kt   E1 fix + permissionGate()
apps/mobile/android/.../bridge/AutomationModule.kt            E1 fix in the status stub
apps/mobile/src/features/permissions/*          typed view, store, hooks, CapabilityRow, overview
apps/mobile/src/features/onboarding/PermissionSetupScreen.tsx  now a real gate
```

**Commit:** `27d04ec`

### Deliberately left

- **Screen capture keeps its own consent path.** `requestCapability` reports `session_consent` rather than duplicating the MediaProjection flow, which needs the activity-result plumbing `AutomationModule` already owns. One consent path is worth more than a uniform API here.
- **Tools management is mechanism-only.** Step 4 builds the page; the `useCapability` hook it needs exists and is tested.
- **`AutomationStatusPanel` still exists** and is still used by both modes' settings. It is narrower than the overview but it is the thing that reports the accessibility service and offers capture consent, so removing it belongs with Step 3's work on the service.

### Not yet verified on a device

- **The settings round trip, for each of the four settings-granted capabilities.** The deep links are correct by the docs; whether each lands on the right page across manufacturer skins is unknown.
- **The appop read for usage access**, which cannot be exercised off-device.
- **The assistant-role secure setting**, which varies by OEM and may be absent entirely on some devices.
- **Whether the resume listener fires reliably** after a settings visit that killed the activity.

---

## Device-testing pass after Step 2

The Step 2 build was installed and walked through. **Tests 1 and 3–8 passed** — first launch, the mode switcher, the back button through every route, both modes' settings, revocation being noticed without a restart, and the just-in-time permission on adding a node. Two defects came out of it, both now fixed.

### The app was missing from the assistant picker

Tapping **Open settings** on the default-assistant capability landed on the right Settings page, the list was correct, and **our app was not in it**.

Android builds "Default digital assistant app" from **installed voice-interaction services**, not from apps holding or requesting `BIND_VOICE_INTERACTION`. An app with no such service can never be chosen, and nothing reports the omission — so the capability was unreachable by construction. Step 2 wired the request and the state read correctly and neither could ever have succeeded.

`android/assistant` now declares the three services the platform requires, and all three are required:

- `AutomationVoiceInteractionService` — what the system binds, and what puts the app in the picker.
- a **session service** — a voice-interaction service whose metadata names none fails to parse.
- a **recognition service** — `VoiceInteractionServiceInfo` insists on one in the same package **even for an assistant that does no speech recognition**. A missing one makes the whole service fail to parse and the app vanish from the picker with nothing logged.

`supportsAssist="true"` is the attribute that actually matters; without it the system treats it as a voice service only and still does not list it.

The services do **almost nothing**, deliberately. The role is held for one reason: as the active assistant the app can be shown structured screen context the system does not otherwise expose. Automation still runs through the accessibility service. So the session **closes itself immediately** rather than presenting a UI — an assistant UI would hijack the assist gesture, and long-pressing home should keep doing whatever the user expects. No hotword, no microphone, no audio permission.

The state read also improved: `RoleManager.isRoleHeld(ROLE_ASSISTANT)` from API 29, falling back to the secure setting below that.

**Commit:** `5edb6de`

### The theme buttons did nothing

Light and dark worked, but only when the OS changed. **There are two styling systems and the preference reached one of them.**

`ThemeProvider` feeds `useTheme()`, for Skia and other imperative APIs that cannot use classNames — that was correct. But `className` colours resolve through NativeWind, which chooses between the light and dark CSS-variable blocks in `global.css` by evaluating `@media (prefers-color-scheme: dark)` against **its own** `colorScheme` observable. That observable follows the OS until something calls `colorScheme.set`, and nothing did.

Since essentially every visible colour comes from a className, setting only the prop changed almost nothing. The store was right and the UI ignored it.

Both are now set from one value. `OverlayRoot` had the same bug in a worse form — it hardcoded `<ThemeProvider>` with no preference at all, so the overlay would have followed the OS while the app followed the user, most visibly when floating over another app.

The test asserts `colorScheme.set` was called. Asserting the store updated would have passed while the bug was live.

**Commit:** `52d45ff`

### Also fixed: the debug APK would not open

Not a defect — a debug build fetches its JS from Metro at runtime, and the release APK has the bundle baked in. Recorded because it will come up again: use the release artifact for device testing, or `adb reverse tcp:8081 tcp:8081` with Metro running.

---

## Step 3 — Background Execution & Agent Status Overlay (complete)

**Closes B1 and B2.** B1 was the most serious defect in the product: the agent read the screen, planned, started executing, opened the target app — and stopped, because our app went to background. An automation tool that cannot act while another app is in front is not an automation tool.

### The cause was ownership, not the loop

`useAgentRun` held the run in `useState`/`useRef` and unmounted with `controllerRef.current?.abort()`.

Defensible in isolation — a run whose screen is gone has nothing left to narrate — but it makes **the run's lifetime the screen's lifetime**, and the agent exists to work while the user is elsewhere. The loop was never the problem; it was owned by the wrong thing.

Run state moved out of React entirely into `runController.ts`, a module (**ADR 0016**, refining 0012). `useAgentRun` is now ~70 lines that subscribe and nothing else: no ownership, and deliberately **no cleanup**.

Three consequences, each with a matching decision:

- **Both React roots see one run.** The overlay is a separate root and imports the same module, so a run started in the chat appears in the overlay with nothing passed between them.
- **Exits must be exhaustive**, since a run can now outlive every screen showing it. Every path — success, failure, abort, and the early return when no provider key is set — routes through one `finish`. That is the invariant: a notification outliving the work tells the user their phone is being driven when it is not.
- **The single-run rule moved into the controller.** With ownership in a component, a second run needed two mounted screens; now it needs two calls. `start` refuses rather than replacing, because replacing would leave the first loop running with nothing tracking it.

### The assumption, and why the app measures it

Everything rests on JS continuing to execute under a foreground service while backgrounded. It should hold — RN runs JS on its own thread, and a foreground service keeps the process out of the states where Doze applies — but **expectation is not verification**, and manufacturer skins vary.

`backgroundProbe` records the worst wall-clock gap between one-second ticks during a run, and Agent Mode settings reports it in a sentence. **Wall clock rather than tick count**, because a throttled timer still fires eventually; the question is how much time passed. The final gap is measured at stop as well as per tick — a process frozen when the run ended has no tick left to record the interesting gap.

If a device suspends the process the app says so, rather than the user concluding the agent is unreliable and nobody learning why.

### The status overlay

A narrow strip on the **right edge**, vertically centred. Right because on-screen content is left-aligned in the languages this ships in first, so it covers less of what the user is reading; centred so it misses the app's toolbar, which is usually where the controls the agent is about to press are.

`AgentOverlayGeometry` is a **separate class** from `OverlayGeometry`, not a parameter on it. A right-edge strip and a bottom-anchored panel share no arithmetic, and merging them would produce a class made of `if` branches.

Collapsed it answers two questions: what is it doing, and how do I stop it. Expanded it adds the event log — **newest first here, oldest first in the chat**, because on a floating strip the current step is what matters while in the chat the history is the point.

The follow-up box **queues rather than injects, and says so**. The loop builds the model's context per step and has no mid-run input point; inventing one means changing the loop, which is Step 4's work. An input box that silently did something other than what it looked like would be worse than one that explains itself. A queued instruction only auto-starts if the run ended naturally — after an explicit stop, starting something else is the opposite of what the user pressed.

### Stop from three places, one implementation

Chat and overlay call `stopRun` directly. The notification is the interesting path: its action is delivered to the service, and **a service cannot reach JavaScript**. So the service broadcasts **before** `stopSelf` — order matters, because killing the service alone would leave the loop running unthrottled with no notification left to stop it from.

`listenForExternalStop()` is wired in `index.js` rather than a component, because the notification is most useful precisely when nothing is mounted.

The broadcast is package-scoped and the receiver `NOT_EXPORTED` from API 33, so no other app can stop the user's automation. Registered against the React context rather than held statically, which would outlive a reload and deliver a stop into a dead context.

### Two overlays that must never coexist

`OverlayExclusivity` arbitrates: **last-one-wins**, claimed rather than negotiated. The reason is honesty rather than layout — the status overlay carries a stop button, and with a toolset panel also floating it would not be clear what that button stops. Refusing the second would mean telling a user they cannot see their running agent because a panel from the other mode is open.

`release` is guarded on ownership, which prevents the ordering bug where an evicted overlay's late `hide()` clears the claim of the one that replaced it.

It holds lambdas rather than manager references, so it depends on neither implementation — which is what lets two React Native modules that cannot see each other share one rule.

### The awkward cases

| Case                               | Behaviour, and why                                                                                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run ends while expanded            | The overlay collapses itself, so the last thing seen is the outcome rather than a chat box for finished work                                                                 |
| Overlay permission revoked mid-run | `showAgentOverlay` never throws and reports whether it appeared; the run continues without a strip, because the automation is the point                                      |
| Process killed                     | `START_NOT_STICKY`, deliberately — a user who did not see a run start cannot know why their phone is being driven                                                            |
| Stale window                       | The overlay compares its bound run id against the controller's and says the panel belongs to a finished run, rather than offering a stop button for work never seen to start |

**Verification**

```
pnpm turbo run typecheck lint test build     60/60 tasks, 268 app Jest tests (16 suites)
pnpm format:check                            clean
pnpm install --frozen-lockfile               clean
cd android && gradle ktlintCheck testDebugUnitTest   566 tests, 10 modules, clean
cd apps/mobile/android && gradle :app:testDebugUnitTest   clean
npx react-native bundle --dev false          succeeds with the third root registered
```

CI runs `33243497410` (Android) and `33243497411` (TypeScript) green.

The load-bearing tests: a run keeps going when every subscriber has gone (B1 directly), a subscriber that throws does not abandon the run, the service and overlay are stopped even on the provider-misconfigured early return, and the probe measures its final gap at stop.

**Two Jest traps hit:** `jest.mock` factories are hoisted, so a variable they reference must be named `mock*` or it reads as uninitialised. And `finish` awaits twice, so a three-flush settle asserted on a half-finished teardown — reported as "the service was never stopped", which sends you looking at the wrong code. A `neverFinishes()` helper using a 60s `setTimeout` also kept Jest's worker alive after the suite; replaced with a promise that never settles.

**Files**

```
Development_Plan/decisions/0016-run-controller-is-a-module-not-a-component.md
apps/mobile/src/features/agent/runController.ts       the run, outside React
apps/mobile/src/features/agent/runService.ts          foreground service wrapper
apps/mobile/src/features/agent/backgroundProbe.ts     the assumption, measured
apps/mobile/src/features/agent/agentOverlay.ts        non-throwing overlay bridge
apps/mobile/src/features/agent-overlay/AgentStatusOverlay.tsx
apps/mobile/src/overlay/AgentOverlayRoot.tsx          third React root
apps/mobile/src/features/agent-mode/BackgroundExecutionCard.tsx
android/overlays/.../AgentOverlayGeometry.kt          right-edge strip geometry
android/overlays/.../AgentStatusOverlayManager.kt     bound to a run id
android/overlays/.../OverlayExclusivity.kt            one overlay at a time
apps/mobile/android/.../agentoverlay/AgentOverlayModule.kt
apps/mobile/android/.../agentoverlay/AgentOverlayReactHost.kt
android/automation/.../AutomationForegroundService.kt  + ACTION_STOP_BROADCAST
```

**Commit:** `26232ed`

### Deliberately left

- **The follow-up box queues; it does not interleave.** Genuinely injecting an instruction mid-run means giving the loop an input point, which is Step 4's session work. The UI states what it does rather than implying more.
- **No session history.** One run at a time, and starting a new one replaces the last. Step 4 adds sessions.
- **The overlay cannot be dragged yet.** `moveTo` exists on the manager and is tested, but nothing calls it — a drag handle on a floating window needs gesture wiring inside a second React root, and it is not what B1 was about.

### Not yet verified on a device — and this is the step where it matters most

- **That a run genuinely continues with another app in front.** Everything is built for it and nothing proves it. This is the single check that decides whether Step 3 achieved its purpose.
- **What the probe reports on real hardware**, especially on a skin with aggressive battery management.
- **That the overlay window appears, and stays on top of a third-party app.**
- **Stop from the notification**, which crosses service → broadcast → module → JS and cannot be exercised off-device.
- **That the two overlays evict each other correctly** when a run starts while the toolset is open.

---

## Remaining

**Steps 1, 2 and 3 are done; Steps 4–13 remain.** The plan is `Development_Plan/steps/`, and `03_Issue_Register.md` is the checklist — a step is not finished while one of its issue IDs survives.

**Next is Step 4 — Agent Mode.** The engine works and the run now survives backgrounding; what is missing is the product around it. Closes B3, B4 and B6:

- **Chat sessions with history.** Today there is one run and starting another replaces it. Sessions need persistence, a list, and a way back into a past conversation.
- **A tools page.** The user should see which device tools the agent may use and be able to turn any of them off — with the permission mechanism from Step 2 behind each toggle.
- **Multiple providers.** One provider is configured today; the registry needs to hold several and let the user choose per mode.

Step 4 also owns the piece Step 3 deliberately left: **a mid-run input point in the loop**, so the overlay's follow-up box can interleave rather than queue. That is a change to `runAgent`'s context assembly, which is why it was not smuggled into a step about lifetimes.

Then Step 5 (OCR and the perception chain), Step 6 (Workflow Mode shell), and on through `01_Roadmap.md`.

**Phase 10's work is now Step 12**, and what it inherits is unchanged: `tool-sdk` is the single source of tool definitions and the MCP tool list must be **generated** from `allToolDefinitions()` rather than restated; `invokeTool` is the one dispatch, so MCP becomes its fourth caller rather than a new path to the device; `validateToolCall` already rejects bad arguments, which matters most for external input. What Step 12 must decide rather than inherit: local-only and authenticated by default, how a token is issued and stored, and what happens when an external caller asks for a destructive tool — the `impact` field on every definition exists for that question. Step 12 also adds the **MCP client** direction, which the original plan never covered (B5).

Distribution is the other half of Step 12: `node-sdk`, `workflow-schema`, `core-nodes`, and `android-nodes` are already shaped for publishing (`main` at `dist`, a `react-native` field for Metro), and `node-sdk/AUTHORING.md` documents third-party node authoring. What remains is the npm mechanics and a real end-to-end test with a mock published package.

Carry-forward notes:

- **`AutomationRuntime` is the contract to preserve.** Method names match `DeviceTool.toolName`, `@mobile-automation/tool-sdk`, and the TS wrapper, with parity tests on both sides. Adding a tool means editing both sides in one commit.
- **The bridge is the only crossing.** `packages/native-automation` is where TypeScript meets Kotlin. Nothing else should import `NativeModules`, and nothing in `packages/` may import from `apps/mobile` (enforced by ESLint).
- **Credentials never enter JS state.** The API key lives in the Keystore and is read by a function at request time (ADR 0007). The overlay renders model output, so this matters most there — and an MCP server accepting external connections must never expose it either.
- **AI-supplied config is validated before it is applied.** Three places do this now: the recorder's generator, Create-by-AI, and the overlay. MCP is the fourth and the least trusted, since the caller is not even the user.
- **The UI-tree JSON is versioned for a reason.** `UI_TREE_SCHEMA_VERSION` is at **2**; bump it whenever a key changes and update `UiNodeAttribute`, `UI_NODE_ATTRIBUTES`, and the `UiTree` type in `native-automation` together. `UiNodeAttributeParityTest` catches the Kotlin half; nothing yet catches a stale TS list, so keep them in the same commit.
- **Vision is still not wired.** `SelectorResolver` defaults to `UnavailableVisionMatcher`, so the chain reports "vision was not attempted" and stops at coordinates. A provider client, a screenshot path in agent context, a trace that records one per step, and now an overlay that captures one are all present — this needs a vision-capable model and a cost decision, not new code paths.
- **Big payloads cross by reference.** Screenshots are file paths and the UI tree has a compact mode. Neither should become inline base64 — and an MCP response is exactly where someone would be tempted.
- **Packages the RN app imports need a source entrypoint.** Metro does not run Turborepo's build first, so a `dist` entry breaks the release bundle while the debug APK may still pass. Every workspace package now has either a source `main` or a `react-native` field.
- **pnpm strictness.** When adding any React Native tool that Gradle or Metro invokes, declare it explicitly in `apps/mobile/package.json`.
- **Only an assemble compiles what ktlint and unit tests skip.** This has now bitten twice: the app module in Phase 6 (`:storage` and Room) and the `androidTest` source set in Phase 8 (`OverlayResult`). Run `gradle :<module>:assembleDebug` when changing a module's public surface, and `gradle assembleDebugAndroidTest` when changing anything an instrumentation test touches.
- **A component using a themed primitive needs `renderWithTheme`** in tests, and from Step 1 that helper also supplies `SafeAreaProvider` with explicit `initialMetrics` — without a frame it renders nothing under Jest and every query fails against an empty tree.
- **Anything installing a native module at import time needs its Jest setup registered.** Gesture Handler and Skia both do, so `jest.setup.js` requires each one's own `jestSetup`; without them any test that reaches the canvas dies on import rather than on a render. `transformIgnorePatterns` must also list the scope — `@shopify` ships untranspiled ESM.
- **Theme values are duplicated by necessity.** `packages/ui/src/theme/semantic.ts` and `apps/mobile/src/global.css` must change together; a parity test is still worth adding.
- **Navigation is a typed route store, not a navigator** (ADR 0015, Step 1). The two modes each own a route union, which makes an Agent Mode route in Workflow Mode a type error rather than a discipline problem. The costs are ours: transitions, the Android back button, and no deep linking.
- **A `@ReactMethod` return type must be an exact match for one RN supports** (Step 2's predecessor crash). `WritableMap`, not `WritableNativeMap`; the check is `==`, not assignability, and it runs on first access to the module, which makes a mistake a startup crash rather than a failed call. `ReactMethodSignatureTest` in the app module now catches it.
- **Zustand v5 selectors must return a stable reference.** A selector doing `.filter(...)` creates a new array each call, `Object.is` never matches, and the component re-renders forever — presenting as a hang with no error. Subscribe to the array and derive with `useMemo`; see `apps/mobile/src/features/permissions/useCapabilityViews.ts`.
- **`fireEvent.press` is required to trigger a `Pressable` under RNTL.** Reaching for `.props.onPress()` on the found node does nothing, and the test fails claiming the handler was never called.
- **Permission state is never cached** (Step 2). Every read goes to the platform, because the grant flow sends the user to system settings and back — the common case is a permission that changed while the app was in the background.
- **The run lives in a module, not a component** (ADR 0016, Step 3). `runController.ts` owns the `AbortController`; `useAgentRun` subscribes and has **no cleanup**, because an unmount aborting the run is exactly what B1 was. Every exit routes through one `finish`, so the notification and overlay cannot outlive the work.
- **There are three React roots in one process**: the app, the node toolset overlay, and the agent status overlay. They share state only through the store and controller **modules all three import** — never through props or events, since they have no common ancestor. Each also has to set `colorScheme` itself, because any of them can be the first to mount.
- **`jest.mock` factories are hoisted**, so a variable one references must be named `mock*` or it reads as uninitialised. And when asserting on teardown, flush generously: `finish` awaits twice, so a three-flush settle asserted on a half-finished teardown and reported it as "the service was never stopped".
- **A pending timer keeps Jest's worker alive** after a suite ends, surfacing as "a worker process has failed to exit gracefully" — which then hides any real leak. Prefer a promise that never settles over a long `setTimeout` in a test helper.
- **Debug APKs need Metro; use the release artifact for device testing.** A debug build fetches its JS at runtime, so a sideloaded one shows "unable to load script". `adb reverse tcp:8081 tcp:8081` connects it if the debug build is genuinely needed.
- **`isEntirelyBlack` samples a 16×16 grid.** If a real app is ever misreported as secure, that is the tuning knob.
- Local Gradle runs need `ANDROID_HOME` set (`%LOCALAPPDATA%\Android\Sdk` on this machine).
- The Gradle wrapper JAR is deliberately not committed; CI provisions Gradle 8.11.1 via `gradle/actions/setup-gradle`.
- Release signing secrets are still unset, so the release APK remains debug-signed: it verifies but is not distributable.

### Outstanding device verification

Every engine layer needs physical hardware, and none can be automated here — each requires a user to enable the accessibility service, grant screen capture, or allow display over other apps, and no APK is built locally per ADR 0010.

| From                 | What needs checking on a device                                                                                                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kotlin core          | the service reads a third-party app's tree; tap a resolved element, swipe, type, capture a screenshot                                                                                                                                                                  |
| Bridge               | `automation.getUiTree()` and `automation.click(selector)` from JS drive that same device                                                                                                                                                                               |
| Workflow engine      | a workflow runs end to end: `RN → JSON → engine → registry → executor → tool runtime → device`                                                                                                                                                                         |
| Canvas               | node text renders, drag behaves, 60fps with dozens of nodes, a workflow survives a restart                                                                                                                                                                             |
| Agent                | the WhatsApp scenario with a real provider key, **continuing while another app is in front**                                                                                                                                                                           |
| Overlay              | the toolset stays on top in WhatsApp and returns a valid condition config                                                                                                                                                                                              |
| Recorder             | replaying a generated workflow reproduces the recorded outcome                                                                                                                                                                                                         |
| Shell (Step 1)       | onboarding on a fresh install, the back button through every route, the transition's feel                                                                                                                                                                              |
| Permissions (Step 2) | the settings round trip for all four settings-granted capabilities across OEM skins; the usage-access appop read; the assistant secure setting; whether resume fires after a settings visit killed the activity                                                        |
| Background (Step 3)  | **that a run continues with another app in front** — the check that decides whether Step 3 worked; what the probe reports on an aggressive OEM skin; the status overlay appearing and staying on top; stop from the notification; the two overlays evicting each other |

**Step 13 runs this as one session, in an order where each stage feeds the next so a failure localises itself:** onboarding → the agent outside the app → OCR on a tree-less screen → the recorded trace → generation → running the workflow from the canvas → the node toolset overlay → a force-stop persistence check.

**The release artifact is the one to sideload**, not `app-debug` — a debug build fetches its JS from Metro and shows "unable to load script" when installed on its own.

The gap is narrowing but still the largest risk in the project. Two rounds of device testing have now happened, and **both produced defects that no amount of unit testing would have found**: a capability that could never be granted because the app was absent from the picker it linked to, and a theme preference applied to one of two independent styling systems. That is the argument for testing each step on hardware as it lands rather than saving it all for Step 13.

### Deliberately out of scope

Recorded so these read as decisions rather than oversights.

_Phase 2:_

- **Reading current media state** ("what is playing") and **media file access** — both need permissions the Phase 2 table does not authorise. The `media` tool is playback control only.
- **Absolute volume** — `adjustVolume` nudges by one step, since setting a level outright needs `MODIFY_AUDIO_SETTINGS` and overrides the user's choice.

_Phase 3:_

- **Generated codegen bindings** — the interop layer already serves the module to `TurboModuleRegistry.get`, and TypeScript is fully typed by the spec.
- **JSI hot paths** — no measured bottleneck yet, since large payloads already cross by reference.
- **An emitter for `ExecutionProgressEvent`** — the native channel exists but is unused: the workflow engine's own event bus reaches the UI directly in-process, so bridging the two would add a hop for nothing. It stays for a future native-initiated run.

_Phases 4+5:_

- **RN wiring** — the engine is headless by design; the app gains a screen that runs a workflow in Phase 6.
- **Workflow persistence** — SQLite storage belongs with Phase 6, where there is a UI to save from.
- **Parallel branches** — execution is sequential because there is only one screen to drive. The loader permits a fan-out shape; the executor follows the first edge.

_Phase 6:_

- **react-navigation** — the shell is a tab switch plus modal routes. Six destinations, one a full-bleed canvas, did not justify a navigator; Phase 8 then turned out to need a separate React root rather than a route, so the decision was settled by not making it.
- **Multi-select, copy/paste, and undo** — each is a real feature rather than polish, and none is needed to build and run a workflow.
- **A variables editor** — variables are read and displayed during a run, but declaring them by hand comes with the Input-node work.
- **A bundled font for the canvas** — Skia's text primitive is adequate; a font file is a size cost worth weighing separately.

_Phase 7:_

- **Streaming completions** — the loop needs a whole tool call before it can act, so streaming would only make the "thinking" text appear sooner.
- **Vision in the model context** — the screenshot path is carried but no image is sent. Needs a vision-capable provider and a cost decision.
- **Foreground service during an agent run** — a run dies if the user leaves the app. `startAutomationService` exists; this is now the most valuable remaining reliability fix, because a run that dies also loses its recording.

_Phase 9:_

- **No screenshot captured per step** — the path field, the directory, and the cleanup all exist. Wiring `takeScreenshot` into the recording loop needs MediaProjection consent and a decision about capture frequency, since a full-resolution image per step is a real storage cost. Generation does not need them; they are for the user reviewing a trace.
- **No trace-to-trace diffing** — comparing two runs of the same goal would be a good way to find the fragile step, but it needs several recordings of the same task to be useful.
- **The generator produces a straight chain** — a trace where the agent recovered contains the information for a condition node, but inferring one would be guessing at intent the user never expressed.
- **No replay-on-device validation** — `checkReplay` is a pre-flight check by design. Actually running the generated workflow and comparing outcomes is the device-verification item.

_Phase 8:_

- **The overlay is not draggable** — `moveOverlay` exists and clamps correctly, but no gesture is wired to it. A drag handle inside a 30%-height window competes with the tool row for space, and the anchored position is already thumb-reachable.
- **No screenshot sent to the model** — captured and named in the prompt, but no image crosses. Same blocker as Phase 7.
- **No element picking by tapping the app underneath** — `FLAG_NOT_FOCUSABLE` is what stops the overlay stealing touches meant for the app, which is deliberate. Picking is done from the element list instead.
- **The eye toggle resizes the window and reflows the content separately** — a synchronised animation would need the Kotlin and RN sides to agree on timing for little gain.
