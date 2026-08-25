# Phase 9 — Execution Recorder & Workflow Generation

**Milestone:** M4 — Intelligence. **Depends on:** Phases 5, 7. **Unblocks:** the "AI builds a reusable workflow" feature.

## Goal

Make execution recording a first-class subsystem: while the AI executes a goal, capture a rich trace per step, then compile the trace into a robust, reusable workflow.

## Deliverables

- `packages/execution-recorder`: hooks into agent tool execution to record each `ExecutionStep` (screenshot, UI hierarchy, package, activity, action, coordinates, node id, selected element, selector, timestamp, result — see `../architecture/Data_Models.md`).
- Trace storage (SQLite + filesystem for screenshots).
- **Workflow generator**: `ExecutionTrace → Workflow` mapping each step to nodes with robust selectors and coordinate/vision fallbacks.
- Review UI: user inspects the generated workflow, edits, and saves.
- Replay validation: run the generated workflow and confirm it reproduces the outcome.

## Tasks

1. Instrument the agent loop to emit a recorder event on every tool execution.
2. Capture rich targets (full element info + selector priority chain), not just coordinates.
3. Persist traces; link screenshots by reference.
4. Implement the generator: collapse observation/action pairs into workflow nodes and edges.
5. Build the trace → workflow review screen.
6. Validate by replaying the generated workflow.

## Definition of done

- Running the WhatsApp goal through the agent produces a saved trace and a generated workflow.
- Replaying the generated workflow reproduces the action using selectors (not raw coordinates) where possible.
- The user can review and edit the generated workflow before saving.

## Related skills

- `../skills/ai-agent-builder/SKILL.md`
- `../skills/node-sdk-author/SKILL.md`
- `../skills/testing-quality/SKILL.md`
