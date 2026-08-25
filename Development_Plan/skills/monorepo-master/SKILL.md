---
name: monorepo-master
description: Structure and maintain the pnpm + Turborepo + Gradle monorepo, including packages, build/test pipelines, dependency direction, and npm publishing. Use when adding packages or wiring build/CI tooling.
---

# Skill: Monorepo Master (pnpm + Turborepo + Gradle)

## When to use

You are structuring or maintaining the repository: adding packages, wiring build/test pipelines, managing dependencies across TS and Kotlin, or setting up publishing/CI. Used in Phases 1, 4, and 10.

## Principles

- **TS ecosystem in pnpm/Turborepo; Android in Gradle.** One repo, two build systems, one CI. Do not force Kotlin into the JS toolchain or vice versa.
- **Strict dependency direction.** `shared-types` and `node-sdk` sit at the bottom; nothing depends "upward" toward `apps/mobile`.
- **Cache-friendly tasks.** Turborepo pipelines with correct `dependsOn` so builds are incremental and cacheable.
- **Publishable vs private is explicit.** Public packages target npm; the app and native modules do not publish.

## Layout

See `../architecture/Monorepo_Structure.md` for the full tree. Summary: `apps/mobile`, `packages/*` (TS), `android/*` (Kotlin modules), `tests/`, root `turbo.json` / `pnpm-workspace.yaml` / lint configs.

## Procedure

### 1. Workspace setup
- `pnpm-workspace.yaml` includes `apps/*` and `packages/*`.
- Root `package.json` holds shared devDeps and scripts that delegate to Turbo.
- A base `tsconfig.base.json` that each package extends; use TS project references or path aliases consistently.

### 2. Turborepo pipelines
Define in `turbo.json`: `build` (`dependsOn: ["^build"]`), `lint`, `test`, `typecheck`. Declare `outputs` for caching (e.g., `dist/**`). Keep tasks pure so caching is safe.

### 3. Package conventions
Each package: `package.json` (name scoped `@your-sdk/*`), `tsconfig.json`, `src/`, `dist/` (built), tests colocated, and a clear public `exports` field.

### 4. Dependency hygiene
- Internal deps use `workspace:*`.
- Pin external deps to exact versions.
- Enforce the dependency direction; a lint rule or review gate prevents upward imports.

### 5. Android + Gradle integration
- `android/` is a Gradle multi-module project; the RN app's Android build consumes those modules.
- CI runs the Gradle build and ktlint separately from the Turbo tasks.

### 6. Publishing (public packages)
- Mark private packages `"private": true`.
- Public packages (`node-sdk`, `core-nodes`, `android-nodes`, `workflow-schema`, `tool-sdk`, `mcp-server`) get build + publish scripts.
- Use changesets (or equivalent) for versioning and changelogs; publish from CI.

### 7. CI (GitHub Actions)
Install → `turbo run typecheck lint test build` → Gradle build + ktlint → (on release) publish npm packages and build the app.

## Checklist

- [ ] `pnpm install && pnpm turbo run build lint test typecheck` is green.
- [ ] Turbo caching works (`^build` ordering, declared outputs).
- [ ] Dependency direction enforced; no upward imports.
- [ ] Internal deps use `workspace:*`; external deps pinned.
- [ ] Gradle multi-module build wired into the app and CI.
- [ ] Private vs publishable packages clearly marked.
- [ ] CI runs both toolchains and publishes public packages on release.
