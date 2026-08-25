# 00 — Overview

## Vision

A professional **mobile automation platform** for Android — think n8n, but the "integrations" are the phone itself. It reads the screen (screenshot + Accessibility UI tree), performs gestures, and drives any installed app. Users automate through two layers built on one shared Android runtime.

## The two automation layers

### Layer 1 — AI Agent
Natural-language goal → autonomous execution.

- Example: *"Send message to Robert on WhatsApp that I'll be late tomorrow."*
- The agent plans fast, opens the app via Android APIs, searches/scrolls for Robert, opens the chat, types and sends.
- Runs an **agent loop**: Goal → Plan → Observe → Choose Tool → Execute → Observe → Replan → Done.
- Perceives the screen as **screenshot + Android UI tree**.
- Has a full **tool set**: screen, gestures, contacts, alarms, schedules, intents, clipboard, notifications, app management, etc.
- Exposes those tools over an **MCP server** so external agents can drive the phone.
- Currently supports **Chat Completions**-compatible providers only.

### Layer 2 — Workflow Engine
Visual, node-based automation like n8n, with a smooth mobile canvas.

- Nodes and logic nodes (If, Loop, Variable, Transform, Trigger, Action).
- Three creation modes:
  1. **Manual** — drag nodes, wire edges, configure by hand.
  2. **Create by AI** — describe the automation; the AI picks and configures nodes.
  3. **Configure with AI (per node)** — a floating toolset overlay tied to a specific node ID lets the AI analyze a live screen and produce a structured node config.
- A **Node SDK** lets first-party and third-party nodes be published to and installed from npm (`npm install @your-sdk/android-nodes`, `npm install @developer/custom-nodes`). The app discovers and registers them, exactly like n8n.

## Signature features

### Execution recording → workflow generation
When the AI executes a goal, an **Execution Recorder** captures a rich trace per step: screenshot, UI hierarchy, package, activity, action, coordinates, node ID, selected element, selector, timestamp, result. The recorded **Execution Trace** is then compiled into a **reusable workflow**. Targets are stored richly (not just coordinates) so replay is robust:

Selector priority: `resourceId → accessibility semantics → text/contentDescription → structural UI selector → relative position → coordinates → screenshot/vision fallback`.

### "Configure with AI" floating toolset
A floating overlay bound to the current node ID. It shows a few tools plus a "more/eye" button to reveal the rest without covering the screen. It gives the AI automatic node context (node id/type/config, screen package/activity, UI tree, screenshot, available tools). The AI returns a **structured node configuration**, not prose — the node editor updates itself.

## Scope for v1

- Android only.
- Chat Completions-compatible AI providers only.
- Both automation layers, sharing one Android Tool Runtime.
- Node SDK publishable to npm; third-party node discovery.
- MCP server exposing the Android tool set.

## Non-goals for v1

- iOS.
- Non-Chat-Completions provider protocols.
- Cloud execution of workflows (workflows run on-device).

## Glossary

| Term | Meaning |
|------|---------|
| **Automation Runtime** | The shared execution layer both engines call into. |
| **Android Tool Layer** | Kotlin implementations of device capabilities (contacts, apps, screenshots, intents…). |
| **Accessibility layer** | UI tree parsing + gesture dispatch via `AccessibilityService`. |
| **Node** | A unit in a workflow (Action, Condition, Loop, etc.). |
| **Node Registry** | Runtime catalog of installed node types. |
| **Execution Trace** | Ordered rich record of what happened during an AI run. |
| **Selector** | Robust description of a UI target with fallbacks. |
| **MCP** | Model Context Protocol server exposing device tools to external agents. |
| **Turbo Module** | RN's typed native module system used to bridge to Kotlin. |
