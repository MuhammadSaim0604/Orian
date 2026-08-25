# Phase 8 — Configure-With-AI Floating Overlay

**Milestone:** M4 — Intelligence. **Depends on:** Phases 2 (overlay), 6 (node editor), 7 (agent). **Unblocks:** richer node config.

## Goal

Implement the per-node floating toolset overlay. Bound to a specific node ID, it lets the user navigate to a live screen, inspect it, and ask the AI to produce a **structured node configuration** that the editor applies.

## Deliverables

- Floating overlay (Kotlin overlay window hosting RN content) that stays on top of other apps.
- Compact layout: a few tools visible + a **"more/eye" toggle** to reveal the rest without covering the screen.
- Tools: Current Node, Screen, UI Tree, Screenshot, Element Inspector, Coordinate Inspector, Test Action, Ask AI, More Tools.
- Automatic node context passed to the AI (see payload in `../architecture/Data_Models.md`): `{ node, screen, uiTree, screenshot, availableTools }`.
- AI returns a **structured config** validated against the node's schema; the node editor updates itself.
- "Test Action" runs the tool live and shows the result before committing.

## Tasks

1. Build the overlay host and RN content rendering inside it.
2. Bind the overlay to the active node ID so context is automatic.
3. Implement the compact/expanded (eye) layout.
4. Implement each inspector tool against the native bridge.
5. Wire "Ask AI": assemble context via prompt-engine → Chat Completions → parse structured config → validate → apply to node.
6. Implement "Test Action" dry-run.
7. Handle the user navigating to a target app while the overlay persists.

## Definition of done

- On an If/Condition node, the user opens the overlay, goes to WhatsApp, and types "Return true if the Send button is visible." The AI returns `{ condition: { type: "element_exists", selector: { text: "Send" } } }` and the node updates.
- The overlay never fully covers the screen; the eye toggle works.
- The AI always receives the correct node context automatically.

## Skills to load

These skills are already installed in your AI agent. Load them before starting this phase:

- `ai-agent-builder`
- `prompt-engine`
- `rn-ui-builder-zustand`
- `kotlin-native-module`
