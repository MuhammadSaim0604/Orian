---
name: node-sdk-author
description: Design and extend the node system - base SDK, workflow/node Zod schemas, core and Android node packages, third-party node discovery, and the execution-trace-to-workflow generator. Use when building the node SDK or authoring nodes.
---

# Skill: Node SDK Author

## When to use

You are designing or extending the node system: the base SDK, the workflow/node Zod schemas, core and Android node packages, third-party node discovery, or the trace → workflow generator. Used in Phases 4, 5, and 9.

## Principles

- **Generic core, device nodes as packages.** Core node types are device-agnostic (`Input, Action, Condition, Loop, Variable, Transform, Trigger`). Android capabilities live in a separate `android-nodes` package — the n8n core-vs-integration split.
- **Workflow is plain JSON, RN-independent.** `metadata, variables, nodes[], edges[]`. It could run anywhere.
- **Zod is the contract.** Schemas validate at runtime and generate types. Invalid workflows/configs are rejected with clear errors.
- **Extensible like n8n.** Third parties publish node packages to npm; the app discovers, validates, and registers them.

## Base node design (`packages/node-sdk`)

```
interface NodeDefinition {
  type: string
  version: string
  metadata: { label, icon, category }
  configSchema: ZodSchema        // per-node config
  inputs: PortSpec[]
  outputs: PortSpec[]
  execute(ctx: ExecutionContext): Promise<NodeResult>
}
```

- `ExecutionContext` exposes input values, variable store, and the Android Tool Runtime.
- A **node manifest** (name, type, version, config schema ref, icon) lets packages advertise their nodes for discovery.

## Procedure

1. **Schemas first** (`packages/workflow-schema`): define `Workflow`, `Node`, `Edge`, `Selector`, and shared config primitives with Zod. Derive types via `z.infer`. See `../architecture/Data_Models.md`.
2. **Base SDK** (`packages/node-sdk`): `NodeDefinition`, registry API, executor contract, manifest format.
3. **Core nodes** (`packages/core-nodes`): implement the seven generic types with unit tests.
4. **Android nodes** (`packages/android-nodes`): `OpenApp, Click, LongPress, Swipe, TypeText, ReadScreen, FindElement, WaitForElement, GetUiTree, TakeScreenshot, PressBack, PressHome, Notification, Contact, Clipboard, …` — each calls the typed native bridge wrappers.
5. **Registry & discovery**: scan installed packages that declare a node manifest, validate against the schema, register into the Node Registry. Support `npm install @your-sdk/android-nodes` and `@developer/custom-nodes`.
6. **Executor integration**: the workflow engine (Phase 5) resolves each node's `type` via the registry and calls `execute`.
7. **Trace → workflow generator** (Phase 9): map recorded `ExecutionStep`s to nodes/edges, embedding robust selectors with coordinate/vision fallbacks.

## Authoring a third-party node (document this)

1. Create a package exporting one or more `NodeDefinition`s.
2. Declare the node manifest and config Zod schema.
3. Publish to npm.
4. User runs `npm install`; the app discovers and registers it.

## Checklist

- [ ] Workflow/node/edge/selector schemas defined in Zod; types derived.
- [ ] Base `NodeDefinition`, registry, executor contract, and manifest implemented.
- [ ] Seven core nodes implemented and tested.
- [ ] Android nodes call the native bridge, not RN logic.
- [ ] Third-party package discovery + validation + registration works with a mock package.
- [ ] Generator turns an execution trace into a valid, replayable workflow.
