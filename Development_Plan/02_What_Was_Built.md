# 02 — What Was Built (Phases 0–9)

A historical note, kept short on purpose. The plan is no longer organised by phases; this page exists so nobody has to reconstruct what already exists. **`tracking.md` at the repo root is the detailed record** — read it for the reasoning behind each decision.

All ten phases shipped with CI green on `main`. Roughly 1069 TypeScript tests and 498 Kotlin unit tests.

| Phase | What it produced | State |
| --- | --- | --- |
| **0** Foundation | The plan itself, ADRs 0001–0010, conventions, version targets | Superseded by this plan |
| **1** Monorepo & tooling | pnpm + Turborepo, 15 packages, ESLint/Prettier/ktlint, GitHub Actions CI building debug and release APKs, NativeWind + centralized theme | Solid, keep |
| **2** Android automation core | Six Gradle modules: `accessibility` (UiNode model, tree walker, selector resolver, AccessibilityService), `gestures`, `screen` (MediaProjection capture), `overlays`, `tools` (contacts, apps, clipboard, alarms, notifications, intents, media), `automation` (AutomationRuntime, foreground service) | Works; needs OCR added and background reliability proven |
| **3** Native bridge | `packages/native-automation` (typed wrappers, codegen spec, event emitter) ↔ `android/bridge` (AutomationBridge, hand-rolled JSON) | Solid, keep; extend for new capabilities |
| **4** Node SDK & schema | `shared-types`, `workflow-schema` (Zod), `node-sdk` (NodeDefinition, registry, introspection), `core-nodes` (7 generic types), `android-nodes` (21 device nodes) | Solid; needs an OCR node and a search-friendly palette |
| **5** Workflow engine | `packages/workflow-engine` — DAG walk, conditions, loops, variables, retry, event stream | Works; unverified on a device end to end |
| **6** Workflow builder UI | Skia canvas, Zustand stores, schema-driven node forms, execution debugger, screen inspector, Room persistence, tabbed shell | **Largely being rebuilt** — see the issue register |
| **7** AI agent engine | `ai-agent` (provider, memory, loop, events), `prompt-engine`, `tool-sdk`, agent screen, Keystore-backed provider credentials | Engine solid; **cannot run outside the app** |
| **8** Configure-with-AI overlay | `android/overlays` window host, second React root via `ReactHost.createSurface`, overlay store, inspector tools, Test Action, Ask AI returning schema-validated config | **Crashes on open** — the concept is right, the wiring is not |
| **9** Execution recorder & generation | `execution-recorder` (schema, recorder, deterministic generator, replay pre-flight), trace persistence with screenshots by reference, trace review screen | Engine solid; generated workflows are low quality in practice |

## What carried forward well

These are the load-bearing decisions worth protecting through the rebuild:

- **Two engines, one runtime** (ADR 0008). The agent and the workflow engine reach the device only through `AutomationRuntime`, dispatched by name through `invokeTool`. Every new consumer — the overlay, MCP, OCR — joins that path rather than making its own.
- **Selectors over coordinates** (ADR 0009). The resolver's priority chain, the recorder capturing the element that actually matched, and the generator upgrading a text match to a resourceId.
- **Zod as the contract** (ADR 0006). A node's own schema validates its config whether that config came from a human, the generator, or a model.
- **`describeSchema` drives forms.** A node type the UI has never seen still gets an editable form, which is what makes third-party nodes real.
- **Screenshots and trees cross by reference.** Paths and compact modes, never inline base64.
- **Credentials never enter JS state.** The provider key lives in the Android Keystore and is read by a function at request time.

## What the first UI got wrong

One sentence, because the detail belongs in the issue register: it was built as a **tabbed home screen** — workflows, agent, runs, screen inspector, status, provider — when the product is **two separate modes** reached through onboarding and a mode switcher. Several of those tabs (status, screen inspector) should not exist at all, and the ones that should are in the wrong place.

## Still unverified on hardware

Seven phases have definition-of-done items that need a physical device. Nothing in phases 2, 3, 5, 6, 7, 8, or 9 has been proven against real hardware beyond emulator instrumentation — and the device testing that has happened is precisely what produced the issue register. Step 13 closes this out properly.
