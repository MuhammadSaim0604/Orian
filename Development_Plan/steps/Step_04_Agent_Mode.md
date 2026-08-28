# Step 4 — Agent Mode

**Milestone:** M7 — Agent Mode. **Closes:** B3, B4, B6, and the agent half of A5. **Depends on:** Step 3.

## Goal

Make Agent Mode a real chat product: sessions with their own memory, a provider registry with model discovery, and a tools page where every capability is visible and controllable.

## What is wrong today

Agent Mode is one text box and an event list. There is no session list, no history, and memory does not survive a run. The user cannot see which tools exist, cannot disable one, and cannot grant a tool's permission from where the tool is named. Provider configuration is a single base URL and a hand-typed model string, on a tab of its own.

## Deliverables

- **Chat interface** with a session sidebar. Each session keeps its own message history, memory, and context.
- **Session persistence** — Room-backed, so sessions survive a restart. Messages, tool calls, and results.
- **Provider registry** — several OpenAI-compatible providers, each with base URL, key, and a model list **fetched from `/models`**. One provider is active; the registry lives in root settings and is shared with Workflow Mode.
- **Tools management page** — every tool with a toggle, its description, its permission state, and its recent activity. Toggling on requests the permission if needed.
- **Agent Mode settings** — model selection, run bounds (max steps, timeout), whether to record traces, and the two fixed actions from Step 1.
- Per-session memory wired to the existing `packages/ai-agent` memory rather than a second implementation.

## Tasks

1. Session store and Room persistence: create, rename, delete, list newest first. A session holds messages; a run belongs to a session.
2. Chat UI: message list, streaming-ish progress from agent events, tool calls rendered as structured rows rather than raw JSON, and a composer. Reuse `AgentEventRow`.
3. Sidebar: sessions, new session, delete with confirmation.
4. Wire the run controller from Step 3 so a run belongs to a session and its events land in that session's history.
5. Per-session memory: `packages/ai-agent`'s memory module already derives stuck/replan signals — give it the session's history rather than starting empty each run.
6. Provider registry: schema, Room storage for non-secret fields, **keys in the Keystore only**. Add, edit, delete, set active.
7. Model discovery: `GET {baseUrl}/models`, cached, with a manual entry fallback for providers that do not implement it. Never leave the user unable to proceed because discovery failed.
8. Tools management: list from `tool-sdk`'s definitions, per-tool toggle persisted, permission state from Step 2's registry, and the tool's `impact` shown so the user can see which tools act rather than read.
9. Filter the agent's advertised tool list by what is enabled. A disabled tool must not be offered to the model — otherwise it will call it and fail.
10. Agent Mode settings screen, ending with _switch mode_ and _back to switcher_.

## Definition of done

- Sessions can be created, listed, reopened with full history, and deleted; they survive a restart.
- A run's events appear in its session and are still there after leaving and returning.
- Memory is per session — a second run in the same session knows what the first did.
- Two providers can be configured and switched between; models are discovered from `/models`.
- A provider key is never rendered, logged, or placed in a prompt.
- Every tool appears with a toggle; disabling one removes it from what the model is offered.
- Toggling a permission-requiring tool on requests the permission.
- Agent Mode settings offers both fixed actions.

## Notes for the implementer

- **The key stays in the Keystore.** `getSettings` returns `hasApiKey`, never the value, and the provider takes a function read at request time. This is already the pattern — do not weaken it for the convenience of an edit form.
- Tool toggles must reach the **prompt**, not just the UI. A tool the model is told about but which is disabled produces a confusing failure mid-run.
- Model discovery will fail against some providers. Treat manual entry as a first-class path, not an error state.
- Do not build a second memory implementation. `packages/ai-agent`'s memory already exists and is tested; this step gives it a longer-lived store.
- Rendering tool calls as structured rows rather than JSON is what makes the chat readable. The information is already in the event.

## Skills to load

- `rn-ui-builder-zustand`
- `ai-agent-builder`
- `prompt-engine`
- `theme-and-styling-nativewind`
- `testing-quality`
