# Phase 5 — Workflow Engine

**Milestone:** M3 — Workflows. **Depends on:** Phase 4. **Unblocks:** Phases 6, 9.

## Goal

Implement the RN-independent workflow engine that executes a workflow JSON by walking the DAG, resolving nodes via the registry, and calling the Android Tool Runtime.

## Deliverables

- `packages/workflow-engine`: DAG resolver, node executor, condition branching, loops, variable scope, and error/retry policy honoring `executionPolicy`.
- Execution context passing inputs/outputs between nodes and exposing variables.
- Execution events (node started/succeeded/failed) streamed for the debugger/logs UI.
- Deterministic execution order and cycle detection.

## Tasks

1. Implement graph loading + validation (uses `workflow-schema`).
2. Implement the executor: topological/branch-aware traversal with `Condition` true/false edges and `Loop` iteration.
3. Implement variable store and input/output resolution between nodes.
4. Implement retry/timeout/onError per node.
5. Emit structured execution events.
6. Integration test: a manual workflow (OpenApp → FindElement → Click → TypeText) runs on a device.

## Definition of done

- `RN → Workflow JSON → Engine → Registry → Executor → Android Tool Runtime` executes end-to-end on a device.
- Conditions branch correctly; loops iterate; variables carry across nodes.
- Failures are reported with the failing node and reason.

## Related skills

- `../skills/node-sdk-author/SKILL.md`
- `../skills/testing-quality/SKILL.md`
