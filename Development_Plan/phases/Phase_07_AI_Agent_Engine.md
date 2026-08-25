# Phase 7 — AI Agent Engine

**Milestone:** M4 — Intelligence. **Depends on:** Phases 3, 4. **Unblocks:** Phases 8, 9, 10.

## Goal

Build the autonomous AI Agent that takes a natural-language goal and drives the device: plan, observe, choose tool, execute, replan. Separate from the workflow engine but sharing the Android Tool Runtime.

## Deliverables

- `packages/ai-agent`: agent loop (`Goal → Plan → Observe → Choose Tool → Execute → Observe → Replan → Done`), planner, memory, tool selection.
- `packages/tool-sdk`: typed tool definitions shared by the agent and the MCP server.
- Perception: screenshot + serialized UI tree fed into the model context.
- Chat Completions provider client (OpenAI-compatible), configurable base URL/model/key.
- Uses `packages/prompt-engine` for all prompts, context assembly, and structured output parsing.
- Agent UI in the app: enter a goal, watch steps, stop/resume.

## Tasks

1. Define the tool schema in `tool-sdk` (name, description, args schema, returns) covering the full Android tool surface.
2. Implement the Chat Completions client with retry/streaming.
3. Implement the loop: build context → request plan/tool call → validate against tool schema → execute via native bridge → observe → repeat.
4. Implement memory (observations, prior results) and replanning triggers.
5. Enforce structured tool-call output (Zod-validated); reject/repair malformed calls.
6. Build the Agent UI and stream progress.
7. Test the flagship scenario: "Send Robert a WhatsApp message that I'll be late tomorrow."

## Definition of done

- The agent completes the WhatsApp scenario on a device: opens app, finds Robert, types, sends.
- Malformed model output never crashes the loop — it is validated and repaired or retried.
- Provider is swappable via config; only Chat Completions is required.

## Related skills

- `../skills/ai-agent-builder/SKILL.md`
- `../skills/prompt-engine/SKILL.md`
- `../skills/testing-quality/SKILL.md`
