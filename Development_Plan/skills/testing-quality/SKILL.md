---
name: testing-quality
description: Set up and write tests and linting across TypeScript (Vitest/Jest) and Kotlin (JUnit + Android instrumentation), plus ESLint/Prettier/ktlint. Use when adding tests or configuring quality tooling and CI.
---

# Skill: Testing & Quality

## When to use

Every phase. Set up the harness in Phase 1; write tests alongside features throughout. The plan explicitly requires "proper unit testing means a fully professional monorepo."

## Principles

- **Test the layer with the right tool.** TS/JS with Vitest or Jest; Kotlin with JUnit; on-device behavior with Android instrumentation tests.
- **Schemas and pure logic get unit tests; device behavior gets instrumentation.** Don't try to unit-test Accessibility — use instrumentation on an emulator/device.
- **Tests run in CI on every change** across both toolchains.
- **Lint and format are part of quality**: ESLint + Prettier (TS), ktlint (Kotlin).

## What to test where

| Subsystem | Test type |
|-----------|-----------|
| `workflow-schema` (Zod) | Unit: valid/invalid workflows rejected/accepted |
| `node-sdk`, `core-nodes` | Unit: each node's `execute` with mocked context |
| `android-nodes` | Unit with mocked bridge; instrumentation for real device calls |
| `workflow-engine` | Unit: branching, loops, variables, retry; integration on device |
| `ai-agent` | Unit: loop with mocked provider + mocked tools; scenario tests |
| `prompt-engine` | Unit: template rendering + structured-output parsing/repair |
| `mcp-server` | Unit: auth enforcement, arg validation; integration with a test client |
| Kotlin `android/*` | JUnit for logic; instrumentation for Accessibility/gestures/capture |
| Selector resolver | Unit + instrumentation across the priority chain |
| RN UI / canvas | Component tests; manual/e2e for gesture-heavy canvas |

## Procedure

1. **TS harness**: configure Vitest (or Jest) at the workspace root; each package runs its own tests via Turbo `test`.
2. **Kotlin harness**: JUnit for module logic; Android instrumentation tests for device-dependent code, run on an emulator in CI.
3. **Mock the provider** for agent tests so they are deterministic and offline; keep a small set of live scenario tests behind a flag.
4. **Mock the native bridge** for `android-nodes`/agent unit tests; verify the real bridge with instrumentation.
5. **CI**: `turbo run typecheck lint test` + Gradle `test`/`connectedAndroidTest` + ktlint. Fail the build on any failure.
6. **Coverage** where meaningful; prioritize the engine, schema, selector resolver, and agent loop.

## Definition of done for any feature

- Unit tests cover the new logic and pass.
- Device-dependent parts have instrumentation coverage where feasible.
- Lint/format clean on both toolchains.
- CI green.

## Checklist

- [ ] Vitest/Jest configured; per-package tests via Turbo.
- [ ] JUnit + Android instrumentation configured and running in CI.
- [ ] Provider and native bridge are mockable for deterministic unit tests.
- [ ] Engine, schema, selector resolver, and agent loop are well covered.
- [ ] ESLint + Prettier + ktlint enforced in CI.
- [ ] Build fails on any test/lint failure.
