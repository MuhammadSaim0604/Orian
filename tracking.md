# Tracking

Living record of what has been implemented, which phase is complete, and what remains. Updated after every phase (per `IMPORTANT_RULES.txt` rule 6).

Authoritative plan: `Development_Plan/`. Phases execute strictly in order.

Last updated: after Phase 3, with both CI workflows green on `main` (Android CI run `33067139054`, TypeScript CI run `33067139071`).

---

## Status

| Phase | Scope                                                | Milestone         | Status       |
| ----- | ---------------------------------------------------- | ----------------- | ------------ |
| 0     | Foundation & decisions                               | M1 Skeleton       | **Complete** |
| 1     | Monorepo & tooling (pnpm/Turborepo, lint, tests, CI) | M1 Skeleton       | **Complete** |
| 2     | Android automation core in Kotlin                    | M2 Device control | **Complete** |
| 3     | Native bridge (Turbo Modules / JSI)                  | M2 Device control | **Complete** |
| 4     | Node SDK & Zod workflow schema                       | M3 Workflows      | Not started  |
| 5     | Workflow engine (DAG, registry, executor)            | M3 Workflows      | Not started  |
| 6     | Workflow builder UI (Skia canvas, Zustand)           | M3 Workflows      | Not started  |
| 7     | AI agent engine (loop, planner, memory)              | M4 Intelligence   | Not started  |
| 8     | Configure-with-AI floating overlay                   | M4 Intelligence   | Not started  |
| 9     | Execution recorder & workflow generation             | M4 Intelligence   | Not started  |
| 10    | MCP server, node distribution, polish                | M5 Platform       | Not started  |

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

## Remaining

Phases 4–10, in order. Next is **Phase 4 — Node SDK & Zod workflow schema**: the base node classes, registry and executor contracts, and the Zod schemas for the workflow/node/edge JSON. It is pure TypeScript with no device dependency, so it can be built and tested without a phone.

Carry-forward notes:

- **`AutomationRuntime` is the contract to preserve.** Method names match `DeviceTool.toolName`, `@mobile-automation/tool-sdk`, and now the TS wrapper, with parity tests on both sides. `android-nodes` should call the wrapper rather than inventing its own surface, or the AI will be able to name tools it cannot call.
- **The bridge is the only crossing.** `packages/native-automation` is where TypeScript meets Kotlin. Nothing else should import `NativeModules`, and nothing in `packages/` may import from `apps/mobile` (enforced by ESLint).
- **The UI-tree JSON is versioned for a reason.** `UI_TREE_SCHEMA_VERSION` is at **2**; bump it whenever a key changes and update `UiNodeAttribute`, `UI_NODE_ATTRIBUTES`, and the `UiTree` type in `native-automation` together. `UiNodeAttributeParityTest` catches the Kotlin half; nothing yet catches a stale TS list, so keep them in the same commit.
- **Vision needs a provider before it does anything.** `SelectorResolver` defaults to `UnavailableVisionMatcher`, so today the chain reports "vision was not attempted" and stops at coordinates. A real `VisionMatcher` needs a screenshot plus a model call, making it Phase 7 work; wiring one in is the only remaining step to complete the chain at runtime.
- **Big payloads cross by reference.** Screenshots are file paths and the UI tree has a compact mode. Neither should become inline base64.
- **Workspace packages the RN app imports must be source-entry.** Metro does not run Turborepo's build first, so a package pointing at `dist/` breaks the release bundle while the debug APK may still pass — a misleading signal that cost a CI round trip in Phase 3. Follow `packages/ui` and `packages/native-automation`: `private: true`, `main` at `./src/index.ts`, `build` emitting declarations only, and no `.js` extensions on relative imports.
- **pnpm strictness.** When adding any React Native tool that Gradle or Metro invokes, declare it explicitly in `apps/mobile/package.json`; three Phase 1 CI failures were undeclared transitive dependencies.
- **Theme values are duplicated by necessity.** `packages/ui/src/theme/semantic.ts` and `apps/mobile/src/global.css` must change together; a parity test is worth adding in Phase 6.
- **`isEntirelyBlack` samples a 16×16 grid.** If a real app is ever misreported as secure, that is the tuning knob.
- Local Gradle runs need `ANDROID_HOME` set (`%LOCALAPPDATA%\Android\Sdk` on this machine).
- The Gradle wrapper JAR is deliberately not committed; CI provisions Gradle 8.11.1 via `gradle/actions/setup-gradle`.
- Release signing secrets are still unset, so the release APK remains debug-signed: it verifies but is not distributable.

### Outstanding device verification

Both M2 phases have a definition of done that needs physical hardware, and neither can be automated here — each requires a user to enable the accessibility service and grant screen capture, and no APK is built locally per ADR 0010.

| Phase | What needs checking on a device                                                                       |
| ----- | ----------------------------------------------------------------------------------------------------- |
| 2     | the service reads a third-party app's tree; tap a resolved element, swipe, type, capture a screenshot |
| 3     | `automation.getUiTree()` and `automation.click(selector)` from JS drive that same device              |

**The `app-debug` artifact from run `33067139054` is the build to sideload for both.** Until then, device-dependent paths are covered only by emulator instrumentation and by unit tests of the logic around them.

### Deliberately out of scope

Recorded so these read as decisions rather than oversights.

_Phase 2:_

- **Reading current media state** ("what is playing") and **media file access** — both need permissions the Phase 2 table does not authorise. The `media` tool is playback control only.
- **Absolute volume** — `adjustVolume` nudges by one step, since setting a level outright needs `MODIFY_AUDIO_SETTINGS` and overrides the user's choice.

_Phase 3:_

- **Generated codegen bindings** — the interop layer already serves the module to `TurboModuleRegistry.get`, and TypeScript is fully typed by the spec.
- **JSI hot paths** — no measured bottleneck yet, since large payloads already cross by reference.
- **An emitter for `ExecutionProgressEvent`** — the channel exists; nothing produces progress until there is an engine to report from.
