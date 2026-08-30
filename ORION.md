# ORION.md

This file provides guidance to kilo Code when working with code in this repository.

## Non-negotiable rules

From `IMPORTANT_RULES.txt` — these override convenience in every case:

1. **Never touch `.orion/`.** It is unrelated tooling. Do not read, edit, or list it.
2. **Never build the APK locally on this machine.** No `gradlew assemble*`, no `react-native run-android`, no local emulator builds.
3. **All builds and tests run through GitHub Actions.** CI must build and test both the debug and release APKs.
4. **After every meaningful chunk of work: commit, push, then verify CI with `gh`.** Watch the run, read failing logs, fix before moving on.
5. **Maintain `tracking.md` at the repo root.** After each step record what was implemented, which files changed, which step is done, and which remain. Read it first for what previous agents completed — and **never rewrite its history**; only append.
6. `plan_in_user_words/` is background context only — the original idea plus the later corrections in the user's words. The authoritative plan is `Development_Plan/`.
7. For Specific work load specific skill that needed.
8. Before creating any files and logics make sure to analyze the existing directory structures and files so that if any file already present then you should not rewrite it and also if you write any thing then because of monorepo project make sure to properly hold functions and code logics to properly link and properly create files and logics....

Environment is Windows; the user works in PowerShell/cmd. Git remote: `https://github.com/MuhammadSaim0604/Orian.git`.

## Current repository state

**The engines are built. The product around them is being rebuilt.**

Phases 0-9 shipped with CI green on `main`: a pnpm + Turborepo monorepo (15 packages), nine Kotlin Gradle modules under `android/`, a typed native bridge, the node system, the workflow engine, the AI agent, the execution recorder, a Skia canvas, and a first Configure-with-AI overlay. Roughly 1069 TypeScript tests and 498 Kotlin unit tests.

Device testing then established that **the engines largely work and the product surface does not**. The UI was built as a six-tab home screen when the product is two separate modes; the agent stops the moment the user leaves the app; the overlay crashes; the canvas renders nodes as blank rectangles and its drag fights its selection.

So **the plan is no longer organised by phases.** `Development_Plan/` is now organised as **13 numbered steps** that rebuild the product on top of the engines, fix what device testing found, and add what was missing — the mode-based shell, permission onboarding, background execution, OCR, and per-node screen tooling.

Read in this order before starting work:

1. `Development_Plan/README.md` — where the project stands and how the plan is organised.
2. `Development_Plan/03_Issue_Register.md` — every confirmed defect, with IDs. Steps close specific IDs.
3. `Development_Plan/00_Overview.md` — the two-mode product shape, which the current code does not implement.
4. `tracking.md` — the living record of what exists and what was deliberately deferred.
5. The step file you are about to work on, under `Development_Plan/steps/`.

The commands below are real and current.

## Commands

TypeScript side is pnpm + Turborepo from the repo root. **`pnpm` is not on this machine's PATH** - prepend the shim directory first, or use `corepack pnpm`:

```powershell
set "PATH=%USERPROFILE%\.local\bin;%PATH%"    # cmd; Turborepo needs a real pnpm binary on PATH

pnpm install
pnpm turbo run build          # respects ^build dependency ordering
pnpm turbo run lint
pnpm turbo run test
pnpm turbo run typecheck
pnpm turbo run test --filter=@mobile-automation/workflow-engine   # single package
pnpm format:check
```

Single test file / single test (Vitest for libraries, Jest for the RN app):

```powershell
pnpm --filter <package> vitest run src/foo.test.ts
pnpm --filter <package> vitest run -t "resolves selector by resourceId"
pnpm --filter mobile jest path/to/File.test.tsx -t "renders"
```

Kotlin side is Gradle. Unit tests and lint run locally; **assemble tasks never do** (ADR 0010). Local runs need `ANDROID_HOME`, and there is no committed wrapper JAR, so use the `gradle` on PATH:

```powershell
cd android
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
gradle ktlintCheck
gradle ktlintFormat                        # auto-fix layout rather than editing by hand
gradle testDebugUnitTest                   # all modules
gradle :accessibility:testDebugUnitTest    # one module
gradle assembleDebugAndroidTest            # compiles instrumentation tests without running them
```

CI verification loop after pushing:

```powershell
gh run list --limit 5
gh run watch <run-id>
gh run view <run-id> --log-failed
```

## Architecture

Full detail lives in `Development_Plan/architecture/`. The essentials that span multiple files:

**Two modes, one runtime.** The app is **Agent Mode** and **Workflow Mode**, chosen from a mode switcher after onboarding — not tabs in one shell (ADR 0011). Each mode owns its navigation, settings, sessions, and memory. They share the Android tool runtime, the agent loop engine, the prompt engine, and the provider registry, and share no UI at all. **The current code still implements the old tabbed shell; Step 1 replaces it.**

**Two engines, one runtime.** An **AI Agent Engine** (natural-language goal → plan → observe → choose tool → execute → replan) and a **Workflow Engine** (n8n-style node DAG) are independent and must never merge. Both call the identical **Android Tool Runtime** (`click`, `swipe`, `typeText`, `findElement`, `getUiTree`, `takeScreenshot`, `runOcr`, `openApp`, `getContacts`, `createAlarm`, …) by name through `invokeTool`. Every consumer — the agent, the engine, the overlays, the MCP server — uses that one dispatch. There is no second path to the device.

**One loop engine, several agents.** `runAgent` takes its tools and prompts as inputs, so Agent Mode's agent and Workflow Mode's builder agent are the same engine with different configurations (ADR 0014). The builder agent deliberately has **no device tools**: an agent with `click` available turns "build me a workflow" into "do the thing once".

**The agent loop runs in JavaScript, kept alive by a foreground service** (ADR 0012). The service keeps the process alive; it does not become the agent. Run state lives in `apps/mobile/src/features/agent/runController.ts` — **a module, not a React component** (ADR 0016), so no unmount can abort a run. That was issue B1: `useAgentRun` used to abort on unmount, making the run's lifetime the screen's lifetime. `useAgentRun` is now a subscription with no cleanup, and every exit from a run routes through one `finish` so the notification and the overlay cannot outlive the work.

**The foreground service is not enough to keep JS running, and this cost a device round trip.** RN's `JavaTimerManager` clears the timer choreographer callback in `onHostPause`, so `setTimeout` and `setInterval` stop firing **entirely** while backgrounded — the loop froze mid-run with the service active. `clearFrameCallback` skips the removal while a `HeadlessJsTask` is active, so `RunKeepAliveModule` holds one open for the duration of a run. The task does no work: it is a lifetime, not a worker, and running the agent inside it would create a second JS context with its own copy of the controller's module state. `backgroundProbe` measures whether it worked on a given device and `timersHeld` warns the user when it did not.

**Language boundary is the core principle.** React Native + TypeScript is the product/UI layer; Kotlin is the Android OS-integration layer (AccessibilityService, gesture engine, screen capture, UI tree parser, overlay manager, foreground service). Never implement deep automation in React Native. The bridge is Turbo Modules / JSI with a typed promise-based API.

**Workflow definition is RN-independent.** A workflow is plain JSON (`metadata`, `variables[]`, `nodes[]`, `edges[]`) validated by Zod. Execution flow: `RN → Workflow JSON → Workflow Engine → Node Registry → Node Executor → Android Tool Runtime`. Nothing in the engine may import from `apps/mobile`.

**Generic core, Android as a package.** Node types (`input`, `action`, `condition`, `loop`, `variable`, `transform`, `trigger`) are device-agnostic in `core-nodes`; device capabilities live in `android-nodes`. Third-party packages declaring a node manifest are discovered from npm, validated against `workflow-schema`, and registered — the n8n community-node model.

**Selectors, not coordinates.** Every recorded target keeps a priority chain: `resourceId → accessibility semantics → text/contentDescription → structural UI selector → relative position → OCR text → coordinates → vision`. This is what makes replay robust; coordinates are a last resort.

**Perception is a fallback chain** (ADR 0013). Accessibility tree first — fastest, richest, real selectors. Then **OCR**, on-device, returning text with bounding boxes. Then **vision**, a screenshot to a vision-capable model. Some apps expose almost nothing through Accessibility, which is why the chain exists rather than a single source. OCR sits above raw coordinates because a text match survives layout shifts and is checkable; it sits below a tree text match because OCR misreads characters, so fuzzy matching is mandatory. OCR runs **on-device only** — a cloud service would break the promise that screen content leaves the phone only for the configured provider.

**Execution recording is first-class.** During an agent run the recorder captures per step: screenshot path, UI hierarchy, package, activity, action, coordinates, nodeId, selected element, selector, timestamp, result. `ExecutionTrace = ExecutionStep[]` compiles into a reusable `Workflow` **deterministically** - no model involved, since the trace already says what happened. The generator's real work is choosing a more durable selector than the agent used, from the element the resolver matched.

**Two overlays, both real windows, never both visible.** The **agent status overlay** (Agent Mode) is a narrow right-edge strip showing the running agent's task with a stop button, expanding into a compact chat; its geometry is `AgentOverlayGeometry` and it binds to a **run id**. The **node toolset overlay** (Workflow Mode) is a wide bottom-anchored panel bound to a **node id**, letting the user configure it against a live screen — it sends the model node config + screen package/activity + UI tree + OCR text + screenshot + available tools, and the model must return a **structured node configuration** validated by that node's Zod schema, never prose. Separate geometry classes rather than one parameterised class, because a right-edge strip and a bottom panel share no arithmetic. Both are `WindowManager` windows rather than modals because a modal dies the moment the user switches to the app in question, which is exactly when both are needed. `OverlayExclusivity` enforces one-at-a-time on a last-one-wins basis: two floating windows would leave the status overlay's stop button ambiguous. There are now **three React roots in one process** — app, toolset, status overlay — each with its bound id as an initial prop, sharing state only through the store and controller modules all three import.

**MCP is bidirectional.** As a server: `External AI → MCP → Agent Tool Gateway → Android Tool Runtime → Device`, local-only and authenticated by default, tool list generated from `allToolDefinitions()` rather than restated. As a client: external MCP servers' tools merge into Agent Mode's tool set, marked as external.

### Dependency direction

`shared-types` and `node-sdk` sit at the bottom; nothing may depend upward toward `apps/mobile`.

```
apps/mobile → ui, workflow-engine, core-nodes, android-nodes, node-sdk, ai-agent,
              prompt-engine, execution-recorder, screen-inspector, native-automation
native-automation → android/bridge → android/automation → the capability modules
apps/mobile/android/app → android/bridge, android/storage, android/overlays
workflow-engine → node-sdk, workflow-schema, shared-types
core-nodes / android-nodes → node-sdk, tool-sdk, shared-types
android-nodes (runtime) → native-automation
ai-agent → prompt-engine, tool-sdk, shared-types
prompt-engine → tool-sdk, shared-types
execution-recorder → workflow-schema, shared-types
mcp-server → tool-sdk, shared-types
```

`execution-recorder` deliberately does **not** depend on `ai-agent`. It takes a plain object shaped like `toolExecuted`, so it can be tested without the agent and the dependency does not run upward toward the loop.

`android/overlays` is depended on by the app module **directly**, not through `:automation`. The automation runtime does not draw windows, and routing the dependency through it would make every consumer of the runtime pull in the overlay layer. It now holds both overlays' geometry plus `OverlayExclusivity`, which arbitrates between them by holding lambdas rather than manager references — so it depends on neither implementation, which is what lets two React Native modules that cannot see each other share one rule.

`android/assistant` (Step 2) is **declaration-only**: three voice-interaction services and a manifest, with no runtime caller. It exists because Android builds the digital-assistant picker from installed voice-interaction services, so an app that merely requests the role never appears in the list. Depended on directly by the app module for the same reason as `:overlays` — nothing in the runtime calls into it.

`android/storage` keeps Room behind `WorkflowStore`, its only public type. Reaching past it makes the app module need Room on its own classpath — which is how the Phase 6 CI failure happened.

`android/ocr` (Step 5) depends on `screen` for the bitmap and **must not depend on `accessibility`** — OCR is an independent way of seeing, and coupling the two would make the fallback chain circular.

`packages/native-automation` is the **only** place TypeScript touches the native layer. Nothing else may import `NativeModules`; ESLint enforces the no-upward-import rule. `invokeTool` there is the by-name tool dispatch shared by the agent, the workflow engine, the overlays, and the MCP server.

### Three contracts that are duplicated on purpose

Each is restated in two places so a parity test can catch drift. Changing one side alone should fail the build — that is the point, though the third has no test yet.

- **Tool names.** `DeviceTool` (`android/automation`) and `TOOL_NAMES` (`packages/tool-sdk`). If they drift, the AI can name a tool it cannot call.
- **UI-tree keys.** `UiNodeAttribute`/`UiTreeAttribute` (`android/accessibility`) and `UI_NODE_ATTRIBUTES`/`UI_TREE_ATTRIBUTES` (`packages/screen-inspector`). Bump `UI_TREE_SCHEMA_VERSION` (currently 2) on any key change. A Kotlin test catches the Kotlin half; **nothing catches a stale TS list** (issue G7), so edit both in one commit until Step 5 adds the test.
- **Node/tool maps.** `NODE_TO_TOOL` (`packages/android-nodes`) and `TOOL_TO_NODE` (`packages/execution-recorder`) are inverse maps in different packages with **no parity test** (issue G8). If a tool is added to one and not the other, a recorded step silently produces no node, reported as "no workflow step exists for this action yet" — which reads like a known limitation rather than a bug. Step 11 adds the test.

### Traps that have already cost time

- **pnpm's strict layout breaks RN tooling.** Anything Gradle or Metro invokes must be declared explicitly in `apps/mobile/package.json` — the RN gradle-plugin, codegen, community CLI, and the babel JSX transform all had to be added after CI failures.
- **Workspace packages the app imports must be source-entry.** Metro does not run Turborepo's build first, so a package pointing at `dist/` breaks the release bundle **while the debug APK still passes** — a misleading green. Two working shapes: `main` at `./src/index.ts` (for private packages like `ui`, `native-automation`, `ai-agent`), or keep `main` at `dist` and add a `"react-native": "./src/index.ts"` field so Metro reads source while Node and vitest read dist (for publishable packages like `node-sdk`, `core-nodes`, `android-nodes`). Verify with `npx react-native bundle --dev false`.
- **Only an assemble compiles the app module.** ktlint and unit tests do not, so a broken dependency between `apps/mobile/android/app` and an `android/` module passes locally and fails in CI — this cost a round trip with `:storage` and Room. The `androidTest` source set has the same problem: it is compiled only by `assembleDebugAndroidTest`, which cost a second round trip in Phase 8. When changing a module's public surface run `gradle :<module>:assembleDebug`, and when changing anything an instrumentation test touches run `gradle assembleDebugAndroidTest`.
- **`org.json` is stubbed in Android JVM unit tests**, returning default values. Kotlin code that must be unit-testable off-device cannot use it; `android/bridge` and `android/storage` hand-roll their JSON for this reason.
- **Provider credentials never enter JS state.** The API key lives in the Android Keystore; `getSettings` returns `hasApiKey` rather than the value, and the TS provider takes `apiKey` as a function read at request time. Never render it, log it, or put it in a prompt.
- **Gesture Handler has three easily-missed wiring requirements**: imported first in `index.js`, `MainActivity.onCreate` passing `null` to `super`, and a `flex: 1` `GestureHandlerRootView`. Each fails silently or obscurely rather than with a useful error.
- **Every `WindowManager` call must be on the UI thread.** `addView` binds the resulting `ViewRootImpl` to the *calling* thread, and a `@ReactMethod` runs on the native modules thread — so React's later mounts from the UI thread throw `CalledFromWrongThreadException`. It presents as an overlay whose buttons do nothing and which crashes after a few interactions, not as an obvious threading error. Both overlay managers take an injected `runOnUiThread` for this reason.
- **Overlay sizes are dp, not px.** `WindowManager.LayoutParams` takes physical pixels, so a constant written as `168` is 56dp on a 3x screen — the agent strip rendered at a third of its intended size with an unusable stop button, and every geometry test still passed because they only asserted it stayed on screen. `Density` converts, and `hasUsableControls` asserts the thing that actually broke.
- **`FLAG_NOT_FOCUSABLE` means no view inside the window can be focused**, so a text input in a floating window is dead. `FLAG_ALT_FOCUSABLE_IM` does not rescue it — that only governs IME behaviour once a window already has focus. Drop the flag while expanded and restore it when collapsed.
- **`startForegroundService` posts `onStartCommand` to the main thread, so nothing on that thread may wait for it.** A `Thread.sleep` poll from `onActivityResult` blocks the very message it is waiting for; and stopping a start that never completed kills the process with `ForegroundServiceDidNotStartInTimeException`. The service must report its own readiness by callback, and `stop` is safe only once it is genuinely in the foreground.

## What phases 0-9 built (historical)

The previous plan was organised into phases 0-10 and all of 0-9 shipped. `Development_Plan/02_What_Was_Built.md` is the one-page record; `tracking.md` has the detail and the reasoning. In brief: phase 1 the monorepo and CI, phase 2 the Kotlin automation core, phase 3 the native bridge, phases 4-5 the node system and workflow engine, phase 6 the canvas and builder UI, phase 7 the AI agent, phase 8 the first Configure-with-AI overlay, phase 9 the execution recorder and generator.

That work is why the steps below are a product rebuild rather than a rewrite: the engines exist and are tested. Do not resurrect the phase structure — the step files supersede it.

## Step execution

Each file in `Development_Plan/steps/` has a goal, what is wrong today, deliverables, tasks, and a definition of done. Read the step file before starting it, and honour its definition of done rather than declaring the step finished when the code compiles. Every step names the issue IDs from `03_Issue_Register.md` that it closes; a step is not done while one of its issues survives.

| Step | Scope | Closes |
| --- | --- | --- |
| **1** | App shell & onboarding — welcome, mode switcher, root settings, delete the dead tabs | A1–A5 |
| **2** | Permission engine — required vs optional, rationale, just-in-time, capability status | E1–E4 |
| **3** | Background execution — foreground service + agent status overlay | B1, B2 |
| **4** | Agent Mode — chat sessions, provider registry, tools management | B3, B4, B6 |
| **5** | OCR & perception chain — on-device OCR tool + node; wire the vision fallback | F1, F2, G7 |
| **6** | Workflow Mode shell — workflow list, loading screen, mode settings | A6 |
| **7** | Canvas rebuild — node text, drag vs selection, zoom controls | C1, C2, C3, G2 |
| **8** | Node editor & palette — searchable palette, form fixes, permission-aware nodes | C4 |
| **9** | Node toolset overlay — fix the crash, restrict to screen-targeting nodes | C5, C6 |
| **10** | Workflow builder agent — isolated sessions, chat UI, a real loop | D1, D2, D3 |
| **11** | Generation & recorder quality — valid generated workflows, per-step screenshots | G4, G8 |
| **12** | MCP server & clients, npm distribution | B5 |
| **13** | Device verification & hardening | G1, G3, G5, G6 |

Order matters and the reasoning is in `01_Roadmap.md`. The three that are easiest to get wrong: **Step 1 first** because everything needs somewhere to live; **Step 3 before Step 4** because an agent that dies when the user leaves the app makes Agent Mode untestable; **Step 9 after Steps 7 and 8** because the toolset writes into the node editor, and fixing it against a broken editor means fixing it twice.

**Do not rewrite the engines.** The Kotlin core, the bridge, the node system, the workflow engine, the agent loop, the prompt engine, and the recorder are sound. Extend them where a step needs a new capability. What is being rebuilt is the **product surface**: screens, navigation, canvas interaction, and the overlays.

**Hardening is continuous.** Permission UX, error recovery, foreground-service reliability, and performance belong to whichever step introduces the surface. Step 13 is the device sweep and release readiness, not a dumping ground.

Milestones: M6 = steps 1-3, M7 = 4-5, M8 = 6-9, M9 = 10-11, M10 = 12-13.

### Outstanding device verification

Almost nothing has been proven against hardware — every layer is tested against fakes, and the device testing that has happened is what produced the issue register. Step 13 runs the whole chain in one session, in an order where each stage feeds the next so a failure localises itself: onboarding → agent outside the app → OCR on a tree-less screen → the recorded trace → generation → running the workflow from the canvas → the toolset overlay → a force-stop persistence check. See the table in `tracking.md`.

## Skills

The subsystem playbooks are **already installed in your AI agent** — they are not files in this repository. Load the matching skill before starting that subsystem: `monorepo-master` (steps 5, 12), `theme-and-styling-nativewind` (1, 4, 6, 7, 8, 9), `testing-quality` (all), `kotlin-native-module` (2, 3, 5, 9), `node-sdk-author` (5, 8, 11, 12), `rn-ui-builder-zustand` (1, 4, 6, 7, 8, 9, 10), `ai-agent-builder` (4, 9, 10, 11), `prompt-engine` (4, 5, 9, 10, 11), `mcp-server` (12). Each step file also lists its skills under "Skills to load".

## Sensitive surface

`AccessibilityService`, `SYSTEM_ALERT_WINDOW`, the default assistant role, usage access, foreground service, MediaProjection screen capture, and contacts are high-trust permissions. `conventions/Permission_Model.md` now splits them into a **required** tier granted during onboarding and an **optional** tier requested at the moment of need — request each with explicit rationale and user opt-in, never fake a grant, and never automate the settings screen.

OCR runs **on-device only**. Screen content leaves the phone only for the provider the user configured, and only for a vision call they triggered.

AI provider keys go in Android secure storage, never plain SQLite, never logged, never in a prompt, and never reachable over MCP. Accessibility-driven automation has Play Store policy implications; sideload-vs-Play distribution is still open and is decided in Step 13.
