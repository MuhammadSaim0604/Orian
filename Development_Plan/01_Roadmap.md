# 01 — Roadmap

Phases are ordered so each unblocks the next. Every phase has its own file under `phases/` with detailed tasks and a definition of done.

## Milestones

| Milestone | Phases | Outcome |
|-----------|--------|---------|
| **M1 — Skeleton** | 0–1 | Monorepo, tooling, CI, empty RN app boots. |
| **M2 — Device control** | 2–3 | Kotlin automation core works; RN can call it via Turbo Modules. |
| **M3 — Workflows** | 4–6 | Node SDK, workflow engine, and visual builder run a manual workflow on-device. |
| **M4 — Intelligence** | 7–9 | AI agent executes goals; Configure-with-AI overlay; execution recording → generated workflows. |
| **M5 — Platform** | 10 | MCP server, third-party node distribution, polish, hardening. |

## Phase sequence

```
Phase 0  Foundation & decisions
Phase 1  Monorepo & tooling (pnpm + Turborepo, ESLint/Prettier/ktlint, CI)
Phase 2  Android automation core (Kotlin: accessibility, gestures, screen, tools)
Phase 3  Native bridge (Turbo Modules / JSI to RN)
Phase 4  Node SDK & workflow schema (TS + Zod)
Phase 5  Workflow engine (DAG execution, registry, executor)
Phase 6  Workflow builder UI (Skia canvas, node editor, Zustand)
Phase 7  AI agent engine (loop, planner, tools, memory)
Phase 8  Configure-with-AI floating overlay
Phase 9  Execution recorder & workflow generation
Phase 10 MCP server, node distribution, polish
```

## Dependency graph

```
P0 → P1 → P2 → P3 → P6
           └→ P4 → P5 → P6
                       └→ P9
P4 → P7 → P8
P7 → P9
P2/P7 → P10
```

## Cross-cutting workstreams (run continuously)

- **Testing** — unit + instrumentation from Phase 1 onward (load the `testing-quality` skill).
- **Theming** — centralized theme + NativeWind established in Phase 1, applied everywhere (load the `theme-and-styling-nativewind` skill).
- **Prompt engineering** — the prompt engine is used by Phases 7, 8, 9 (load the `prompt-engine` skill).
- **Security & permissions** — Accessibility, overlay, and foreground-service permissions are sensitive; document and gate them per phase.
