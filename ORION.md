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

The repo is **plan-only** — there is no source code yet. Root contains `.gitignore`, `IMPORTANT_RULES.txt`, `ORION.md`, `Development_Plan/`, `plan_in_user_words/`, `.orion/`. `Development_Plan/` holds the root docs, `architecture/`, and `phases/`. Phase 0 (decisions) is captured by the plan docs; **Phase 1 (monorepo scaffold, tooling, CI) has not been started**, so none of the commands below exist yet. Create them as part of Phase 1, then treat this section as stale and update it.

## Commands (target state, per Phase 1)

TypeScript side is pnpm + Turborepo from the repo root:

```powershell
pnpm install
pnpm turbo run build          # respects ^build dependency ordering
pnpm turbo run lint
pnpm turbo run test
pnpm turbo run typecheck
pnpm turbo run test --filter=@mobile-automation/workflow-engine   # single package
```

Single test file / single test (Vitest for libraries, Jest for the RN app):

```powershell
pnpm --filter <package> vitest run src/foo.test.ts
pnpm --filter <package> vitest run -t "resolves selector by resourceId"
pnpm --filter mobile jest path/to/File.test.tsx -t "renders"
```

Kotlin side is Gradle, **CI only** — never run the assemble tasks locally:

```powershell
./gradlew ktlintCheck
./gradlew :android:accessibility:testDebugUnitTest    # JUnit, one module
./gradlew connectedDebugAndroidTest                   # instrumentation, CI/device
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

**Execution recording is first-class.** During an agent run the recorder captures per step: screenshot, UI hierarchy, package, activity, action, coordinates, nodeId, selected element, selector, timestamp, result. `ExecutionTrace = ExecutionStep[]` compiles into a reusable `Workflow`.

**Configure-with-AI overlay** is a native Kotlin overlay window hosting RN content, bound to a node ID. It sends the model node config + screen package/activity + UI tree + screenshot + available tools, and the model must return a **structured node configuration** validated by that node's Zod schema — never prose.

**MCP is a boundary, not a feature.** `External AI → MCP → Agent Tool Gateway → Android Tool Runtime → Device`. Local-only and authenticated by default.

### Dependency direction

`shared-types` and `node-sdk` sit at the bottom; nothing may depend upward toward `apps/mobile`.

```
apps/mobile → ui, workflow-engine, ai-agent, execution-recorder, screen-inspector → android/* (native)
workflow-engine → node-sdk, workflow-schema, shared-types
core-nodes / android-nodes → node-sdk, tool-sdk, shared-types
ai-agent → prompt-engine, tool-sdk, shared-types
mcp-server → tool-sdk, shared-types
```

## Phase execution

Execute `Development_Plan/phases/` strictly in order; each file has goals, deliverables, and a definition of done. Do not skip ahead.

| Phase | Scope | Milestone |
|-------|-------|-----------|
| 0 | Foundation & decisions | M1 Skeleton |
| 1 | Monorepo & tooling (pnpm/Turborepo, lint, tests, CI) | M1 |
| 2 | Android automation core in Kotlin — hardest layer | M2 Device control |
| 3 | Native bridge (Turbo Modules / JSI) | M2 |
| 4 | Node SDK & Zod workflow schema | M3 Workflows |
| 5 | Workflow engine (DAG, registry, executor) | M3 |
| 6 | Workflow builder UI (Skia canvas, Zustand) | M3 |
| 7 | AI agent engine (loop, planner, memory) | M4 Intelligence |
| 8 | Configure-with-AI floating overlay | M4 |
| 9 | Execution recorder & workflow generation | M4 |
| 10 | MCP server, node distribution, polish | M5 Platform |

Cross-cutting from Phase 1 onward: testing, centralized theming, prompt engineering (7–9), and permission gating.

## Skills

The subsystem playbooks are **already installed in your AI agent** — they are not files in this repository. Load the matching skill before starting that subsystem: `monorepo-master` (phases 1, 4, 10), `theme-and-styling-nativewind` (1, 6, 8), `testing-quality` (all), `kotlin-native-module` (2, 3, 8), `node-sdk-author` (4, 5, 9), `rn-ui-builder-zustand` (6, 8), `ai-agent-builder` (7, 8, 9), `prompt-engine` (7, 8, 9), `mcp-server` (10). Each phase file also lists its skills under "Skills to load".

## Sensitive surface

`AccessibilityService`, `SYSTEM_ALERT_WINDOW`, foreground service, MediaProjection screen capture, and contacts are high-trust permissions — request each with explicit rationale and user opt-in, and gate per phase. AI provider keys go in Android secure storage, never plain SQLite, never logged. Accessibility-driven automation has Play Store policy implications; sideload-vs-Play distribution is an open question flagged in Phase 0.
