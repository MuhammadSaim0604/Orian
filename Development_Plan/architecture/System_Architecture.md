# System Architecture

## Mental model

Two engines share one Android capability layer.

```
                     Mobile Automation Platform
                             │
             ┌────────────────┴───────────────┐
             │                               │
       AI Agent Engine                 Workflow Engine
             │                               │
      Agent Loop / Planner             Workflow DAG
      Tool Selection                   Node Execution
      Memory                           Conditions
      Screen Reasoning                 Loops / Variables
      Replanning                       
             │                               │
             └────────────────┬───────────────┘
                             │
                    Automation Runtime
                             │
                 ┌───────────┴───────────┐
          Android Tool Layer       Accessibility
          (contacts, apps,          (UI tree, gestures,
           screenshots, intents,      click, swipe, long
           clipboard, alarms…)        press, text input)
                 └───────────┬───────────┘
                             │
                           Kotlin
```

## Layered view

```
React Native (product layer)
│  Workflow Canvas · Node Editor · AI Floating Toolset · Screen Inspector
│  Workflow Debugger · Execution Logs · Agent UI · Settings
│
│  RN Turbo Modules / JSI
▼
Kotlin (Android OS integration layer)
├── AccessibilityService
├── Gesture Engine
├── Screen Capture
├── UI Tree Parser
├── Android APIs (contacts, alarms, intents…)
├── App Manager
├── Overlay Manager
├── Foreground Service
└── Automation Runtime
```

**Rule:** RN owns product/UI; Kotlin owns deep automation. Do not implement automation in RN.

## Key architectural decisions

1. **Generic node system, Android nodes as a package.** The core node types (`Input, Action, Condition, Loop, Variable, Transform, Trigger`) are device-agnostic. Android capabilities live in a separate `android-nodes` package. This mirrors n8n's core-vs-integration split and keeps the engine portable.

2. **Workflow definition independent of React Native.** A workflow is plain JSON (metadata, variables, nodes[], edges[]). Flow: `RN → Workflow JSON → Workflow Engine → Node Registry → Node Executor → Android Tool Runtime`. The same workflow could run from another environment.

3. **Two engines never merge.** AI Agent and Workflow Engine stay separate but both call the identical `Android Tool Runtime` functions (`click, swipe, findElement, getUiTree, screenshot, typeText, openApp, pressBack, getContacts, createAlarm…`).

4. **Execution recording is a first-class subsystem.** Not an afterthought — it produces the rich traces that workflow generation depends on.

5. **Robust selectors over coordinates.** Every recorded target keeps a priority chain of selectors with a coordinate/vision fallback.

6. **MCP as a clean boundary.** External AI → MCP → Agent Tool Gateway → Android Tool Runtime → Device. External agents use the phone without knowing the internal workflow engine.

## The shared Android Tool Runtime

Both engines depend on one interface. Example tool surface:

```
click(selector)          swipe(from, to)        longPress(selector)
typeText(selector, text) findElement(selector)  waitForElement(selector, timeout)
getUiTree()              takeScreenshot()       pressBack() / pressHome()
openApp(package)         listApps()             getCurrentScreen()
getContacts()            createAlarm(config)     readClipboard() / writeClipboard()
sendNotification(cfg)    launchIntent(intent)    getSystemSetting(key)
```

The TS side sees typed wrappers (via Turbo Modules); Kotlin implements them against Android APIs and the Accessibility layer.

## AI Agent loop

```
Goal → Plan → Observe → Choose Tool → Execute → Observe → Replan → … → Done
```

Perception = screenshot + UI tree. Actions = Android Tool Runtime calls. The loop is driven by a Chat Completions provider through the prompt engine.

## Workflow execution

```
Trigger → Node → Condition ──true─→ Node
                    └─false─→ Node
                 → Loop → Node → Done
```

The engine walks the DAG, resolves each node type against the Node Registry, and invokes the executor which calls the Android Tool Runtime.

## Configure-with-AI overlay

```
Node Editor ──Configure with AI─→ AI Configuration Overlay
   ├─ Current Node        ├─ Element Inspector
   ├─ Screen              ├─ Coordinate Inspector
   ├─ UI Tree             ├─ Test Action
   ├─ Screenshot          ├─ Ask AI
   └─ Available Tools     └─ More Tools (eye toggle)
```

The overlay is a native Kotlin overlay window hosting RN content, bound to a node ID so the AI always knows which node it is configuring. The AI returns a **structured config object**, and the node editor applies it.

## Security & permissions (sensitive)

- `AccessibilityService`, `SYSTEM_ALERT_WINDOW` (overlay), foreground service, screen capture, and contacts are high-trust permissions. Each must be requested with clear rationale and gated behind explicit user opt-in.
- The MCP server exposes device control — it must require authentication and run locally by default. Never expose it to the network without explicit user action.
- AI provider keys are secrets: store in secure storage, never log, never send to third parties beyond the configured provider.
