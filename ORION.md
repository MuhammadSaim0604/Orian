# ORION.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Non-negotiable rules

From `IMPORTANT_RULES.txt` — these override convenience in every case:

1. **Never touch `.orion/`.** It is unrelated tooling. Do not read, edit, or list it.
2. **Never build the APK locally on this machine.** No `gradlew assemble*`, no `react-native run-android`, no local emulator builds.
3. **All builds and tests run through GitHub Actions.** CI must build and test both the debug and release APKs.
4. **After every meaningful chunk of work: commit, push, then verify CI with `gh`.** Watch the run, read failing logs, fix before moving on.
5. **Maintain `tracking.md` at the repo root.** After each phase record what was implemented, which files changed, which phase is done, and which phases remain. Also you can read if for what previous ai agent completed.
6. `plan_in_user_words/` is background context only — the original idea in the user's words. The authoritative plan is `Development_Plan/`.
7. For Specific work load specific skill that needed.
8. Before creating any files and logics make sure to analyze the existing directory structures and files so that if any file already present then you should not rewrite it and also if you write any thing then because of monorepo project make sure to properly hold functions and code logics to properly link and properly create files and logics....

Environment is Windows; the user works in PowerShell/cmd. Git remote: `https://github.com/MuhammadSaim0604/Orian.git`.

## Current repository state

Phases 0-7 and 9 are **complete** and CI is green on `main`. Milestone M3 (Workflows) is done and M4 needs only Phase 8. The repo holds a working pnpm + Turborepo monorepo (15 packages), the RN app with a Skia workflow builder, an agent screen, and a trace review screen, eight Kotlin Gradle modules under `android/`, a typed native bridge, the node system and workflow engine, the AI agent, and the execution recorder. `tracking.md` is the living record - read it first to see exactly what exists and what was deliberately deferred.

The commands below are real and current.

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

**Two engines, one runtime.** An **AI Agent Engine** (natural-language goal → plan → observe → choose tool → execute → replan) and a **Workflow Engine** (n8n-style node DAG) are independent and must never merge. Both call the identical **Android Tool Runtime** (`click`, `swipe`, `typeText`, `findElement`, `getUiTree`, `takeScreenshot`, `openApp`, `getContacts`, `createAlarm`, …).

**Language boundary is the core principle.** React Native + TypeScript is the product/UI layer; Kotlin is the Android OS-integration layer (AccessibilityService, gesture engine, screen capture, UI tree parser, overlay manager, foreground service). Never implement deep automation in React Native. The bridge is Turbo Modules / JSI with a typed promise-based API.

**Workflow definition is RN-independent.** A workflow is plain JSON (`metadata`, `variables[]`, `nodes[]`, `edges[]`) validated by Zod. Execution flow: `RN → Workflow JSON → Workflow Engine → Node Registry → Node Executor → Android Tool Runtime`. Nothing in the engine may import from `apps/mobile`.

**Generic core, Android as a package.** Node types (`input`, `action`, `condition`, `loop`, `variable`, `transform`, `trigger`) are device-agnostic in `core-nodes`; device capabilities live in `android-nodes`. Third-party packages declaring a node manifest are discovered from npm, validated against `workflow-schema`, and registered — the n8n community-node model.

**Selectors, not coordinates.** Every recorded target keeps a priority chain: `resourceId → accessibility semantics → text/contentDescription → structural UI selector → relative position → coordinates → screenshot/vision fallback`. This is what makes replay robust; coordinates are a last resort.

**Execution recording is first-class.** During an agent run the recorder captures per step: screenshot path, UI hierarchy, package, activity, action, coordinates, nodeId, selected element, selector, timestamp, result. `ExecutionTrace = ExecutionStep[]` compiles into a reusable `Workflow` **deterministically** - no model involved, since the trace already says what happened. The generator's real work is choosing a more durable selector than the agent used, from the element the resolver matched.

**Configure-with-AI overlay** is a native Kotlin overlay window hosting RN content, bound to a node ID. It sends the model node config + screen package/activity + UI tree + screenshot + available tools, and the model must return a **structured node configuration** validated by that node's Zod schema — never prose.

**MCP is a boundary, not a feature.** `External AI → MCP → Agent Tool Gateway → Android Tool Runtime → Device`. Local-only and authenticated by default.

### Dependency direction

`shared-types` and `node-sdk` sit at the bottom; nothing may depend upward toward `apps/mobile`.

```
apps/mobile → ui, workflow-engine, core-nodes, android-nodes, node-sdk, ai-agent,
              prompt-engine, execution-recorder, screen-inspector, native-automation
native-automation → android/bridge → android/automation → the five capability modules
apps/mobile/android/app → android/bridge, android/storage
workflow-engine → node-sdk, workflow-schema, shared-types
core-nodes / android-nodes → node-sdk, tool-sdk, shared-types
android-nodes (runtime) → native-automation
ai-agent → prompt-engine, tool-sdk, shared-types
prompt-engine → tool-sdk, shared-types
execution-recorder → workflow-schema, shared-types
mcp-server → tool-sdk, shared-types
```

`execution-recorder` deliberately does **not** depend on `ai-agent`. It takes a plain object shaped like `toolExecuted`, so it can be tested without the agent and the dependency does not run upward toward the loop.

`android/storage` keeps Room behind `WorkflowStore`, its only public type. Reaching past it makes the app module need Room on its own classpath — which is how the Phase 6 CI failure happened.

`packages/native-automation` is the **only** place TypeScript touches the native layer. Nothing else may import `NativeModules`; ESLint enforces the no-upward-import rule. `invokeTool` there is the by-name tool dispatch shared by the agent and the MCP server.

### Two contracts that are duplicated on purpose

Both are cross-language, so a parity test on each side restates the other's list. Changing one side alone fails the build — that is the point.

- **Tool names.** `DeviceTool` (`android/automation`) and `TOOL_NAMES` (`packages/tool-sdk`). If they drift, the AI can name a tool it cannot call.
- **UI-tree keys.** `UiNodeAttribute`/`UiTreeAttribute` (`android/accessibility`) and `UI_NODE_ATTRIBUTES`/`UI_TREE_ATTRIBUTES` (`packages/screen-inspector`). Bump `UI_TREE_SCHEMA_VERSION` (currently 2) on any key change. A Kotlin test catches the Kotlin half; nothing catches a stale TS list, so edit both in one commit.

### Traps that have already cost time

- **pnpm's strict layout breaks RN tooling.** Anything Gradle or Metro invokes must be declared explicitly in `apps/mobile/package.json` — the RN gradle-plugin, codegen, community CLI, and the babel JSX transform all had to be added after CI failures.
- **Workspace packages the app imports must be source-entry.** Metro does not run Turborepo's build first, so a package pointing at `dist/` breaks the release bundle **while the debug APK still passes** — a misleading green. Two working shapes: `main` at `./src/index.ts` (for private packages like `ui`, `native-automation`, `ai-agent`), or keep `main` at `dist` and add a `"react-native": "./src/index.ts"` field so Metro reads source while Node and vitest read dist (for publishable packages like `node-sdk`, `core-nodes`, `android-nodes`). Verify with `npx react-native bundle --dev false`.
- **Only an assemble compiles the app module.** ktlint and unit tests do not, so a broken dependency between `apps/mobile/android/app` and an `android/` module passes locally and fails in CI — this cost a round trip with `:storage` and Room. When changing a module's public surface, run `gradle :<module>:assembleDebug`.
- **`org.json` is stubbed in Android JVM unit tests**, returning default values. Kotlin code that must be unit-testable off-device cannot use it; `android/bridge` and `android/storage` hand-roll their JSON for this reason.
- **Provider credentials never enter JS state.** The API key lives in the Android Keystore; `getSettings` returns `hasApiKey` rather than the value, and the TS provider takes `apiKey` as a function read at request time. Never render it, log it, or put it in a prompt.
- **Gesture Handler has three easily-missed wiring requirements**: imported first in `index.js`, `MainActivity.onCreate` passing `null` to `super`, and a `flex: 1` `GestureHandlerRootView`. Each fails silently or obscurely rather than with a useful error.

## Phase execution

Each file in `Development_Plan/phases/` has goals, deliverables, and a definition of done. Read the phase file before starting it, and honour its definition of done rather than declaring the phase finished when the code compiles.

**Phases 0-7 and 9 are complete**, so Milestone M3 is closed and M4 needs only Phase 8. The remaining order below was agreed with the user and **deviates from the plan's strict numeric sequence**; the dependency graph in `01_Roadmap.md` permits it, since Phase 7 needs only 3 and 4, not 5 or 6.

| Order | Phase | Scope | Why here |
| --- | --- | --- | --- |
| 1 | **4 + 5 together** ✅ | Node SDK & Zod schema, then the workflow engine | The executor contract and node config schemas have no consumer until the engine exists; building them apart means guessing the shape and reworking it |
| 2 | **7** ✅ | AI agent engine | Needs only 3 and 4. Pure TS, testable offline with a mocked provider. **Recorder seam built in** - `toolExecuted` carries everything Phase 9 needs, so that phase never reopens the loop |
| 3 | **6** ✅ | Workflow builder UI (Skia canvas, Zustand) | The largest, most iterative phase; kept alone. With 7 done it wired the real "Create by AI" entry point instead of a stub |
| 4 | **9** ✅ | Execution recorder, generator, review UI | The review screen needs 6's canvas, so this follows it |
| 5 | **8** | Configure-with-AI overlay | The hardest integration: needs 2's overlay, 6's node editor, and 7's agent all working - all three now are |
| 6 | **10** | MCP server, npm publishing | MCP is a small self-contained TS unit |

**Hardening is continuous, not a phase.** Permission UX, error recovery, foreground-service reliability, and performance belong to whichever phase introduces the surface. Phase 10 keeps only MCP and distribution.

Milestones for reference: M1 = phases 0-1, M2 = 2-3, M3 = 4-6, M4 = 7-9, M5 = 10.

Cross-cutting from Phase 1 onward: testing, centralized theming, prompt engineering (7-9), and permission gating.

### Outstanding device verification

Phases 2, 3, 5, 6, 7, and 9 all have definition-of-done items that need physical hardware and are **not yet done** - they are covered only by emulator instrumentation and by tests against fakes. One session can now clear all six, because they chain: run the agent (7), which records a trace (9), generate a workflow, run it from the canvas (5), which exercises the bridge (3) and the Kotlin core (2), judging canvas smoothness while doing it (6). See the table in `tracking.md`.

## Skills

The subsystem playbooks are **already installed in your AI agent** — they are not files in this repository. Load the matching skill before starting that subsystem: `monorepo-master` (phases 1, 4, 10), `theme-and-styling-nativewind` (1, 6, 8), `testing-quality` (all), `kotlin-native-module` (2, 3, 8), `node-sdk-author` (4, 5, 9), `rn-ui-builder-zustand` (6, 8), `ai-agent-builder` (7, 8, 9), `prompt-engine` (7, 8, 9), `mcp-server` (10). Each phase file also lists its skills under "Skills to load".
## Sensitive surface

`AccessibilityService`, `SYSTEM_ALERT_WINDOW`, foreground service, MediaProjection screen capture, and contacts are high-trust permissions — request each with explicit rationale and user opt-in, and gate per phase. AI provider keys go in Android secure storage, never plain SQLite, never logged. Accessibility-driven automation has Play Store policy implications; sideload-vs-Play distribution is an open question flagged in Phase 0.
