# Phase 4 — Node SDK & Workflow Schema

**Milestone:** M3 — Workflows. **Depends on:** Phase 1 (and Phase 3 for android-nodes runtime). **Unblocks:** Phases 5, 7.

## Goal

Define the generic, device-agnostic node system and the Zod-validated workflow schema, then implement the first node packages. This is the n8n-style extensibility foundation.

## Deliverables

- `packages/node-sdk`: base `Node` abstraction, port/handle model, node registration API, executor contract, and a node manifest format.
- `packages/workflow-schema`: Zod schemas for `Workflow`, `Node`, `Edge`, `Selector`, and per-type config (see `../architecture/Data_Models.md`).
- `packages/core-nodes`: `InputNode, ActionNode, ConditionNode, LoopNode, VariableNode, TransformNode, TriggerNode`.
- `packages/android-nodes`: `OpenApp, Click, LongPress, Swipe, TypeText, ReadScreen, FindElement, WaitForElement, GetUiTree, TakeScreenshot, PressBack, PressHome, Notification, Contact, Clipboard, …` wired to the native bridge.
- Node **discovery/registration** so `npm install`ed packages (`@your-sdk/android-nodes`, `@developer/custom-nodes`) register into the Node Registry.

## Tasks

1. Design the base `Node` class/interface: metadata, inputs, outputs, config schema, `execute(context)`.
2. Define the node manifest (name, type, version, config schema ref, icon).
3. Implement Zod schemas and derive types with `z.infer`.
4. Implement core nodes with unit tests.
5. Implement android-nodes calling the Turbo Module wrappers.
6. Implement package discovery + validation + registry population.
7. Document how third parties author and publish a node package.

## Definition of done

- A workflow JSON validates against the schema; invalid JSON is rejected with clear errors.
- Core and Android nodes are registered and individually executable in tests.
- A mock third-party node package is discovered and registered.

## Skills to load

These skills are already installed in your AI agent. Load them before starting this phase:

- `node-sdk-author`
- `monorepo-master`
- `testing-quality`
