# Phase 1 — Monorepo & Tooling

**Milestone:** M1 — Skeleton. **Depends on:** Phase 0. **Unblocks:** Phases 2–6.

## Goal

Stand up the pnpm + Turborepo monorepo, the Android Gradle project, shared tooling, CI, and an RN app that boots to a blank themed screen.

## Deliverables

- `pnpm-workspace.yaml`, root `package.json`, `turbo.json` with `build`/`lint`/`test`/`typecheck` pipelines.
- Empty but wired packages per `../architecture/Monorepo_Structure.md`: `node-sdk`, `core-nodes`, `android-nodes`, `workflow-engine`, `workflow-schema`, `ai-agent`, `prompt-engine`, `tool-sdk`, `mcp-server`, `execution-recorder`, `screen-inspector`, `shared-types`, `ui`.
- `apps/mobile` React Native app that builds and launches.
- `android/` Gradle modules stubbed: `accessibility`, `automation`, `gestures`, `screen`, `overlays`, `tools`.
- ESLint + Prettier (TS) and ktlint (Kotlin) configured and passing.
- Base testing harness: Vitest/Jest for TS, JUnit for Kotlin (load the `testing-quality` skill).
- NativeWind + centralized theme scaffolded in `packages/ui` (load the `theme-and-styling-nativewind` skill).
- GitHub Actions CI: install → typecheck → lint → test → build for both TS and Android.

## Tasks

1. Initialize pnpm workspace and Turborepo; verify caching and `^build` ordering.
2. Create each package with `package.json`, `tsconfig`, and a placeholder export.
3. Bootstrap the RN app; confirm it runs on emulator and device.
4. Wire Gradle multi-module Android build and connect it to the RN app.
5. Configure ESLint/Prettier/ktlint and a pre-commit hook.
6. Configure `shared-types` and a base `tsconfig` others extend.
7. Set up NativeWind, theme tokens, and a `ThemeProvider` in `packages/ui`.
8. Write CI workflow; ensure it is green.

## Definition of done

- `pnpm install && pnpm turbo run build lint test typecheck` passes locally and in CI.
- The RN app launches showing a themed placeholder screen.
- ktlint and Gradle build pass for the stub Android modules.

## Skills to load

These skills are already installed in your AI agent. Load them before starting this phase:

- `monorepo-master`
- `theme-and-styling-nativewind`
- `testing-quality`
