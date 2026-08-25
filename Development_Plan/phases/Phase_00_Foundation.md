# Phase 0 — Foundation & Decisions

**Milestone:** M1 — Skeleton. **Depends on:** nothing. **Unblocks:** Phase 1.

## Goal

Lock the decisions and produce the empty repository so every later phase builds on a shared foundation. No feature code yet.

## Deliverables

- Finalized tech-stack decision record (this plan's stack table) committed to the repo.
- Product scope + non-goals agreed (see `00_Overview.md`).
- Target Android versions and minimum SDK chosen; device/emulator matrix defined.
- List of required sensitive permissions with rationale: `AccessibilityService`, `SYSTEM_ALERT_WINDOW`, foreground service, screen capture (MediaProjection), contacts, alarms.
- Chosen AI provider contract: OpenAI-compatible **Chat Completions** only.
- Repository created with license, `.gitignore`, `.editorconfig`, and a top-level `README`.

## Tasks

1. Write a short ADR (architecture decision record) for: RN+Kotlin over Flutter/RN-only; pnpm+Turborepo; Zustand; NativeWind; SQLite/Room; Zod.
2. Define coding conventions (naming, folder layout, commit style).
3. Define the permission model and user opt-in flow at a high level.
4. Pick versions: Node LTS, pnpm, React Native, Kotlin, Gradle, JDK.

## Definition of done

- Repo exists and clones cleanly.
- Decisions are written down and reviewable.
- No ambiguity remains about stack or scope for Phase 1.

## Risks

- Accessibility-based automation may violate some app ToS and Play Store policies — note distribution strategy (sideload vs Play) early.
