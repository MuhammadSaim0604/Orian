# ADR 0002 - pnpm workspaces + Turborepo

**Status:** Accepted

## Context

The repository holds one RN app, thirteen TypeScript packages (several published to npm), and a multi-module Kotlin Gradle project. We need fast, cache-friendly, dependency-aware builds and strict control over internal dependency direction.

## Decision

Use **pnpm workspaces** for dependency management and **Turborepo** for task orchestration on the TS side. Android keeps its own **Gradle** multi-module build. One repository, one CI, two build systems.

Turborepo pipelines: `build` (with `dependsOn: ["^build"]`), `lint`, `test`, `typecheck`, with declared outputs so caching is safe.

## Consequences

- **Positive:** pnpm's strict, content-addressed store avoids phantom dependencies - important when packages must not import upward toward `apps/mobile`.
- **Positive:** the `workspace:*` protocol makes internal linking explicit; Turborepo caching keeps CI fast.
- **Negative:** contributors need pnpm (pinned via `packageManager` + Corepack) rather than npm or yarn.
- **Rule that follows:** do not force Kotlin into the JS toolchain or vice versa.
