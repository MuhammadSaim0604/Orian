# Tracking

Living record of what has been implemented, which phase is complete, and what remains. Updated after every phase (per `IMPORTANT_RULES.txt` rule 6).

Authoritative plan: `Development_Plan/`. Phase order was agreed with the user and **deviates from the plan's strict numeric sequence** for the remaining work - see `ORION.md`. The roadmap's own dependency graph permits it.

Last updated: after Phase 6, with both CI workflows green on `main` (Android CI run `33143486251`, TypeScript CI run `33143486309`).

---

## Status

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
| 9     | Execution recorder & workflow generation             | M4 Intelligence   | Next         |
| 8     | Configure-with-AI floating overlay                   | M4 Intelligence   | Not started  |
| 10    | MCP server, node distribution, polish                | M5 Platform       | Not started  |

Rows below Phase 5 are listed in **execution order**, not numeric order. **Milestone M3 is complete**, and M4 needs only 9 and 8.

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

## Remaining

Order agreed with the user, deviating from the plan's numeric sequence (`ORION.md` records the rationale per phase). **Milestone M3 is complete.** Next is **Phase 9 — the execution recorder, workflow generator, and review UI**: capture what the agent does, compile a trace into a workflow, and let the user review it before saving.

Phase 9 is deliberately positioned after 6 because the review screen needs the canvas, which now exists. The two seams it consumes are already built and tested — `toolExecuted` from the agent and `ToolInvoker` from the engine — so it should not need to reopen either engine.

Then: 8 (overlay), 10 (MCP + publishing).

Carry-forward notes:

- **`AutomationRuntime` is the contract to preserve.** Method names match `DeviceTool.toolName`, `@mobile-automation/tool-sdk`, and the TS wrapper, with parity tests on both sides. Adding a tool means editing both sides in one commit.
- **The bridge is the only crossing.** `packages/native-automation` is where TypeScript meets Kotlin. Nothing else should import `NativeModules`, and nothing in `packages/` may import from `apps/mobile` (enforced by ESLint). `invokeTool` in that package is the by-name dispatch the agent, the workflow engine, and the MCP server all use.
- **`toolExecuted` already carries everything an `ExecutionStep` needs** — screen identity, the UI tree before, the resolved element and which strategy matched, the result or error, and the screen after — for failures as richly as successes. Phase 9's recorder should consume it rather than adding capture points.
- **Reuse `buildGenerationContext`.** Create-by-AI already calls it with an empty `steps` array; Phase 9 passes a real trace to the same builder. The prompt already tells the model to collapse observation steps, keep waits, and prefer recorded selectors over coordinates.
- **Node config schemas are the AI's output contract.** Phase 8's overlay must return config validated against the node's own `configSchema`, never prose. `buildNodeConfigContext`, `describeSchema`, and `parseStructured` all exist, so that phase is UI plus the native overlay window.
- **`describeSchema` is how any node becomes editable.** A node type the UI has never seen still gets a form. Phase 8's overlay should render config through the same path rather than building a second one.
- **The UI-tree JSON is versioned for a reason.** `UI_TREE_SCHEMA_VERSION` is at **2**; bump it whenever a key changes and update `UiNodeAttribute`, `UI_NODE_ATTRIBUTES`, and the `UiTree` type in `native-automation` together. `UiNodeAttributeParityTest` catches the Kotlin half; nothing yet catches a stale TS list, so keep them in the same commit.
- **Vision is still not wired.** `SelectorResolver` defaults to `UnavailableVisionMatcher`, so the chain reports "vision was not attempted" and stops at coordinates. The plumbing is all present — a provider client and a screenshot path in context — so this needs a vision-capable model and a cost decision, not new code paths.
- **Big payloads cross by reference.** Screenshots are file paths and the UI tree has a compact mode. Neither should become inline base64. Phase 9 will store screenshots on the filesystem with DB references (ADR 0005), and orphaned files need a cleanup story.
- **Packages the RN app imports need a source entrypoint.** Metro does not run Turborepo's build first, so a `dist` entry breaks the release bundle while the debug APK may still pass. Every workspace package now has either a source `main` or a `react-native` field; add one to any new package the app imports.
- **pnpm strictness.** When adding any React Native tool that Gradle or Metro invokes, declare it explicitly in `apps/mobile/package.json`. Skia and Gesture Handler both autolinked cleanly, but three Phase 1 CI failures were undeclared transitive dependencies.
- **Only an assemble compiles the app module.** ktlint and unit tests do not, so a broken dependency between the app and an `android/` module passes locally and fails in CI — which is exactly what happened with `:storage`. Run `gradle :<module>:assembleDebug` when changing a module's public surface.
- **Theme values are duplicated by necessity.** `packages/ui/src/theme/semantic.ts` and `apps/mobile/src/global.css` must change together; a parity test is still worth adding.
- **Navigation is still an open decision.** The shell is a tab switch plus one modal route. Phase 8's overlay is the point at which real routing has to be chosen.
- **`isEntirelyBlack` samples a 16×16 grid.** If a real app is ever misreported as secure, that is the tuning knob.
- Local Gradle runs need `ANDROID_HOME` set (`%LOCALAPPDATA%\Android\Sdk` on this machine).
- The Gradle wrapper JAR is deliberately not committed; CI provisions Gradle 8.11.1 via `gradle/actions/setup-gradle`.
- Release signing secrets are still unset, so the release APK remains debug-signed: it verifies but is not distributable.

### Outstanding device verification

Five phases now have a definition of done that needs physical hardware, and none can be automated here — each requires a user to enable the accessibility service and grant screen capture, and no APK is built locally per ADR 0010.

| Phase | What needs checking on a device                                                                       |
| ----- | ----------------------------------------------------------------------------------------------------- |
| 2     | the service reads a third-party app's tree; tap a resolved element, swipe, type, capture a screenshot |
| 3     | `automation.getUiTree()` and `automation.click(selector)` from JS drive that same device              |
| 5     | a workflow runs end to end: `RN → JSON → engine → registry → executor → tool runtime → device`        |
| 6     | the canvas holds 60fps with dozens of nodes, and a workflow survives a restart                        |
| 7     | the agent completes the WhatsApp scenario with a real provider key                                    |

**The `app-debug` artifact from run `33143486251` is the build to sideload, and it can now clear all five.** Phase 5's check became reachable with this phase: the canvas has a Run button, so building a two-step workflow and running it exercises the whole path.

This is the point at which the backlog is worth clearing rather than growing. A failure on device is currently ambiguous between five unverified layers, and the app is now complete enough that a single session with a phone would settle all of them.

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

- **react-navigation** — the shell is a tab switch plus one modal route. Five destinations, one a full-bleed canvas, did not justify a navigator; Phase 8's overlay is where routing has to be decided.
- **Multi-select, copy/paste, and undo** — each is a real feature rather than polish, and none is needed to build and run a workflow.
- **A variables editor** — variables are read and displayed during a run, but declaring them by hand comes with the Input-node work.
- **A bundled font for the canvas** — Skia's text primitive is adequate; a font file is a size cost worth weighing separately.

_Phase 7:_

- **Streaming completions** — the loop needs a whole tool call before it can act, so streaming would only make the "thinking" text appear sooner.
- **Vision in the model context** — the screenshot path is carried but no image is sent. Needs a vision-capable provider and a cost decision.
- **Foreground service during an agent run** — a run dies if the user leaves the app. `startAutomationService` exists; wiring it belongs with run persistence in Phase 9.
- **Agent run history** — nothing is persisted yet. The recorder in Phase 9 is where a run becomes durable.
