# 00 — Overview

## Vision

A professional **mobile automation platform** for Android — think n8n, but the "integrations" are the phone itself. It reads the screen (Accessibility UI tree, OCR, and screenshots), performs gestures, and drives any installed app.

## The product shape: two modes, one runtime

The app is not one interface with tabs. It is **two distinct modes**, chosen after onboarding, each with its own interface, settings, sessions, and memory. This is the single largest correction to the original plan: the first implementation built a tabbed home screen, and a tab bar is the wrong shape for two products that share a runtime and share nothing else.

```
Welcome
   ↓
Permission setup   (required permissions, then optional ones the user may skip)
   ↓
Mode switcher ───────────────┬────────────────────────┐
   │  (root settings here)   │                        │
   ↓                         ↓                        ↓
Agent Mode              Workflow Mode            Root settings
  chat + sessions         saved workflows          providers, theme,
  provider config         canvas + builder         data, permissions
  tools management        builder agent
  MCP clients             node toolset overlay
```

Switching modes plays a transition animation and replaces the interface wholesale. Each mode's own settings screen ends with two fixed actions: **switch to the other mode** and **return to the mode switcher**.

### Mode 1 — Agent Mode

A chat product. The user types a goal; the agent executes it on the device.

- **Chat interface** with a sidebar of sessions. Memory and context are **per session**.
- **Provider configuration** — one or more OpenAI-compatible Chat Completions providers, with models discovered from `/models` rather than typed by hand.
- **Tools management** — every tool listed with a toggle. Toggling a tool that needs a permission requests it there and then; a tool whose permission is already granted simply enables. The page also shows per-tool information and status.
- **MCP clients** — connect external MCP servers and see the tools they contribute alongside the built-in ones.
- **Runs outside the app.** A foreground service keeps the loop alive, and a **floating status overlay** on the right edge of the screen shows the current task with a stop button. Tapping it expands a compact chat showing tool calls and reasoning, which accepts new input and is wired to the same session as the in-app chat.

### Mode 2 — Workflow Mode

A builder product. The user composes and runs node graphs.

- **Saved workflows list** as the mode's home, with a real loading screen when opening one.
- **Create** offers _manually_ or _with AI agent_.
- **Manual** opens the canvas: a genuinely touch-first mobile canvas with zoom controls, smooth panning, and drag that never fights with selection.
- **With AI agent** opens a chat window with its own session sidebar. This agent is **isolated** from Agent Mode — separate sessions, memory, and tools — but runs the **same loop engine**. Its job is producing workflows, not driving the phone.
- **Node toolset overlay** — per node, and only for nodes that actually target the screen (click, swipe, type, conditions on screen state, OCR). Opened from the node, it floats over other apps so the user can stand on the real screen and pick elements, read the UI tree, run OCR, test the action, or ask the AI to configure the node.

Both modes share the **AI provider registry**, the **agent loop engine**, the **prompt engine**, and the **Android tool runtime**. They share no UI, no navigation, no sessions, and no settings.

## Perception: three ways to see a screen

The original plan assumed the Accessibility tree was enough. Device testing disproved it — some apps expose almost nothing. Perception is therefore a **fallback chain**, and the AI chooses how far down it needs to go:

1. **Accessibility UI tree** — fastest, richest, yields real selectors. Always tried first.
2. **OCR** — when the tree is empty or the target is not in it, recognise text on a screenshot and return strings with their bounding boxes, giving coordinates good enough to act on.
3. **Screenshot to the model** — when neither works, hand the image to a vision-capable model and let it name the coordinates.

OCR is a first-class subsystem, not a patch: an on-device engine exposed both as an **agent tool** and as a **workflow node** with its own configuration.

## Signature features (unchanged in intent)

### Execution recording → workflow generation

When the agent executes a goal, the recorder captures a rich trace per step: screen identity, UI tree, resolved element, selector, action, result, timestamp, screenshot path. The trace compiles **deterministically** into a reusable workflow, and the generator's real work is choosing a more durable selector than the agent happened to use.

Selector priority: `resourceId → accessibility semantics → text/contentDescription → structural UI selector → relative position → OCR text match → coordinates → vision`.

### Node toolset overlay

A floating window bound to one node id. Compact by default with an eye toggle to reveal the rest, so it never covers the screen being configured. It gives the AI automatic node context (node id/type/config, screen package/activity, UI tree, OCR text, screenshot, available tools) and the AI returns a **structured node configuration**, never prose.

## Scope for v1

- Android only.
- Chat Completions-compatible AI providers only, with multiple providers configurable.
- Both modes, sharing one Android tool runtime and one agent loop engine.
- On-device OCR available to both modes.
- Background execution with a visible status overlay.
- Node SDK publishable to npm; third-party node discovery.
- MCP server exposing the Android tool set, local and authenticated; MCP clients consumable in Agent Mode.

## Non-goals for v1

- iOS.
- Non-Chat-Completions provider protocols.
- Cloud execution of workflows — workflows run on-device.
- Cloud OCR. Text recognition stays on-device; screen content must not leave the phone except to the provider the user configured.

## Glossary

| Term | Meaning |
| --- | --- |
| **Mode** | Agent Mode or Workflow Mode — a whole interface, not a tab. |
| **Mode switcher** | The screen after onboarding that chooses a mode and hosts root settings. |
| **Automation Runtime** | The shared Kotlin execution layer both modes call into. |
| **Android Tool Layer** | Kotlin implementations of device capabilities (contacts, apps, screenshots, intents…). |
| **Perception chain** | Accessibility tree → OCR → vision, tried in that order. |
| **Agent status overlay** | The right-edge floating container showing the running agent's task, expandable to a compact chat. |
| **Node toolset overlay** | The per-node floating toolset for configuring against a live screen. |
| **Node Registry** | Runtime catalog of installed node types. |
| **Execution Trace** | Ordered rich record of what happened during an agent run. |
| **Selector** | Robust description of a UI target with fallbacks. |
| **Session** | One conversation with its own memory, scoped to a mode. |
| **MCP** | Model Context Protocol — both a server we expose and clients we connect. |
