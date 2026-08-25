---
name: ai-agent-builder
description: Build the autonomous AI agent loop, tool interface, memory, replanning, and structured output handling. Use when building the agent runtime, the Create-by-AI workflow builder, or the Configure-with-AI overlay.
---

# Skill: AI Agent Builder

## When to use

You are building the autonomous AI agent — its loop, tool interface, memory, replanning, and structured output handling. Also used for the "Create by AI" workflow builder and the Configure-with-AI overlay. Used in Phases 7, 8, and 9.

## Principles

- **Two engines, one runtime.** The agent is separate from the workflow engine but calls the identical Android Tool Runtime functions.
- **Perception = screenshot + UI tree.** The model sees the screen through a serialized UI tree and (when needed) a screenshot.
- **Structured tool calls only.** The model never "acts" via prose. Every action is a validated tool call; every config output is validated against a schema.
- **Chat Completions only (v1).** Support any OpenAI-compatible provider via configurable base URL/model/key.
- **Fail safe.** Malformed model output is validated, repaired, or retried — it never crashes the loop or fires an unvalidated action.

## The agent loop

```
Goal → Plan → Observe → Choose Tool → Execute → Observe → Replan → … → Done
```

### Procedure

1. **Define tools in `tool-sdk`.** Each tool: `name`, `description`, `args` schema (Zod), `returns`. This same definition feeds the MCP server, so keep it the single source of truth.
2. **Provider client.** Implement a Chat Completions client with streaming, retries, and tool/function-calling support. Config: base URL, model, key (from secure storage).
3. **Build context** (via `prompt-engine`): goal, current observation (UI tree + optional screenshot), memory (prior steps/results), and available tools.
4. **Request an action.** Ask the model for the next tool call (or `done`). Parse and validate against the tool's args schema.
5. **Execute** via the native bridge; capture the result and the new observation.
6. **Update memory**; decide whether to continue, replan, or finish.
7. **Replan** when an action fails, the screen is unexpected, or progress stalls.
8. **Termination**: `done` signal, max-steps guard, or unrecoverable failure — always bounded.

## Memory

- Keep a rolling record of observations and results.
- Summarize/trim old steps to stay within context limits (delegate summarization to the model or a heuristic).
- Store the full trace via the Execution Recorder (Phase 9) for workflow generation.

## Structured output & safety

- Enforce tool-call schemas; reject and re-prompt on invalid output.
- Never execute an action whose args failed validation.
- Bound the loop (max steps, timeouts) so it cannot run away.
- Confirm or gate destructive device actions per product policy.

## Flagship test

"Send Robert a WhatsApp message that I'll be late tomorrow" — the agent opens WhatsApp, finds Robert (search or scroll), opens the chat, types, and sends, recovering if a step's screen differs from expected.

## Checklist

- [ ] Tools defined once in `tool-sdk`, shared with MCP.
- [ ] Chat Completions client is provider-agnostic and configurable.
- [ ] Loop validates every tool call before executing.
- [ ] Perception feeds UI tree (+ screenshot) into context.
- [ ] Memory summarizes to respect context limits.
- [ ] Loop is bounded (max steps / timeout) and replans on failure.
- [ ] Full trace recorded for workflow generation.
- [ ] Flagship WhatsApp scenario passes on a device.
