# Tracking

Living record of what has been implemented, which phase is complete, and what remains. Updated after every phase (per `IMPORTANT_RULES.txt` rule 6).

Authoritative plan: `Development_Plan/`. Phases execute strictly in order.

---

## Status

| Phase | Scope                                                | Milestone         | Status       |
| ----- | ---------------------------------------------------- | ----------------- | ------------ |
| 0     | Foundation & decisions                               | M1 Skeleton       | **Complete** |
| 1     | Monorepo & tooling (pnpm/Turborepo, lint, tests, CI) | M1 Skeleton       | **Complete** |
| 2     | Android automation core in Kotlin                    | M2 Device control | Not started  |
| 3     | Native bridge (Turbo Modules / JSI)                  | M2 Device control | Not started  |
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

_Theme system_ (`packages/ui`) — raw tokens → semantic tokens per scheme → assembled theme → `ThemeProvider`/`useTheme`, plus a Tailwind preset (`tailwind.preset.cjs`) so semantic classes exist. Nine tests cover scheme parity and resolution.

_RN app_ (`apps/mobile`) — RN 0.76.6, NativeWind 4, Zustand available, Metro configured for the pnpm monorepo (symlinks, workspace watch folders), Babel with NativeWind + Reanimated, Jest with `@testing-library/react-native`, and a themed placeholder screen showing phase status using only semantic classes.

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
```

61 TypeScript/RN tests pass (60 Vitest across 13 packages + 3 Jest in the app). **No APK was built locally** — that is CI-only per ADR 0010, so the Gradle builds and the 22 Kotlin JUnit tests are verified by GitHub Actions, not from here.

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

---

## Remaining

Phases 2–10, in order. Next up is **Phase 2 — Android automation core**: the AccessibilityService, UI tree parser, gesture engine, MediaProjection capture, overlay host, foreground service, the Android tool layer, and the selector resolver implementing the full priority chain. It is the hardest layer and everything above it depends on it.

Carry-forward notes:

- The Gradle wrapper JAR is deliberately not committed; CI provisions Gradle 8.11.1 via `gradle/actions/setup-gradle`. A wrapper JAR can be added later if local Gradle invocation is ever wanted for non-assemble tasks.
- Release signing expects `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` repository secrets. Without them the release APK is debug-signed and not distributable.
- The Kotlin modules under `android/` are a standalone Gradle build in Phase 1. They are wired into the app when the Turbo Module bridge is built in Phase 3.
