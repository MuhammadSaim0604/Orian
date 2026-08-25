# Mobile Automation Platform

An n8n-style **mobile automation platform** for Android. It reads the screen, performs gestures, and drives any installed app - with two automation layers sharing one device runtime:

1. **AI Agent** - give it a goal in plain language ("Send Robert a WhatsApp message that I'll be late") and it plans, observes the screen, chooses tools, executes, and replans.
2. **Workflow Engine** - a visual node-based builder on a smooth mobile canvas, with logic nodes and a Node SDK publishable to npm so anyone can write custom nodes.

> **Status: early scaffolding.** Phases 0-1 (decisions, monorepo, tooling, CI) are in progress. The Android automation core and both engines are not built yet. See `tracking.md` for exactly what exists.

## Core principle

**React Native + TypeScript is the product layer. Kotlin is the Android OS-integration layer.** Deep automation is never implemented in React Native. The two meet at a typed Turbo Module bridge.

## Stack

| Layer                   | Technology                                                 |
| ----------------------- | ---------------------------------------------------------- |
| Product UI              | React Native + TypeScript                                  |
| Android automation core | Kotlin (AccessibilityService, gestures, capture, overlays) |
| Native bridge           | Turbo Modules / JSI                                        |
| Canvas                  | Skia + Reanimated + Gesture Handler                        |
| UI state                | Zustand                                                    |
| Styling                 | NativeWind + centralized design tokens                     |
| Validation              | Zod                                                        |
| Local persistence       | SQLite / Room                                              |
| AI provider             | OpenAI-compatible Chat Completions                         |
| Monorepo                | pnpm + Turborepo (TS) and Gradle (Android)                 |
| Testing                 | Vitest / Jest + JUnit + Android instrumentation            |
| Lint / format           | ESLint + Prettier + ktlint                                 |
| CI/CD                   | GitHub Actions                                             |

## Repository layout

```
apps/mobile          React Native app (product layer)
packages/*           TypeScript packages (node SDK, engines, schemas, UI)
android/*            Kotlin Gradle modules (automation core)
tests/               cross-package / e2e tests
Development_Plan/    the authoritative plan: architecture, phases, ADRs, conventions
plan_in_user_words/  original idea in the owner's words (background only)
tracking.md          what is implemented, which phase is done, what remains
```

## Getting started

Requires **Node 22 LTS**, **pnpm 9** (via Corepack), and **JDK 21** for the Android side.

```bash
corepack enable
pnpm install

pnpm turbo run typecheck
pnpm turbo run lint
pnpm turbo run test
pnpm turbo run build
```

Single package or single test:

```bash
pnpm turbo run test --filter=@mobile-automation/workflow-schema
pnpm --filter @mobile-automation/workflow-schema vitest run -t "rejects an invalid workflow"
```

## Building the app

**APKs are built only in CI.** Debug and release APKs are produced by GitHub Actions and uploaded as artifacts - see `.github/workflows/`. Do not run local Gradle assemble tasks (ADR 0010).

```bash
gh run list --limit 5
gh run watch <run-id>
gh run view <run-id> --log-failed
```

## Documentation

- `Development_Plan/README.md` - plan index
- `Development_Plan/00_Overview.md` - vision, scope, glossary
- `Development_Plan/01_Roadmap.md` - phases and milestones
- `Development_Plan/architecture/` - system architecture, monorepo structure, data models
- `Development_Plan/decisions/` - architecture decision records
- `Development_Plan/conventions/` - coding conventions, permission model, pinned versions
- `Development_Plan/phases/` - Phase 0 through Phase 10, executed in order

## Permissions and privacy

This app uses high-trust Android capabilities: Accessibility, overlay windows, a foreground service, screen capture, and contacts. Every one is requested with an explicit rationale, gated behind user opt-in, and revocable. Screen content is processed on-device and leaves the device only when the user invokes an AI feature, and only to the provider they configured. AI provider keys live in Android secure storage and are never logged. Details: `Development_Plan/conventions/Permission_Model.md`.

## License

MIT - see [LICENSE](LICENSE).
