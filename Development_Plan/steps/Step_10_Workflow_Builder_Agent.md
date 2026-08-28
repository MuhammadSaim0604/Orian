# Step 10 — Workflow Builder Agent

**Milestone:** M9 — Intelligence quality. **Closes:** D1, D2, D3. **Depends on:** Step 6, Step 8.

## Goal

Turn Create-with-AI into a real agent: a chat interface with its own sessions, its own tools, and the same loop engine as Agent Mode — but isolated from it, and aimed at producing workflows rather than driving the phone.

## What is wrong today

**D3 — it is not an agent.** `useWorkflowGeneration` is a single completion call with a retry. The plan calls for an agent with sessions, memory, and its own tool set.

**D1 — no feedback.** Submitting a prompt turns the button into "thinking" and shows nothing, then jumps to the canvas seconds later. The user cannot tell whether anything is happening or why it took that long.

**D2 — the output is broken.** What lands on the canvas is "full of errors". Generation validates the document against `WorkflowSchema`, so either that validation is passing things it should not, or per-node config validation is not happening, or the model is producing a plausible graph whose semantics are wrong — a condition wired to nothing, a loop with no body, a selector for a screen the workflow never reaches.

## The isolation rule

This agent shares the **loop engine, prompt engine, and provider registry** with Agent Mode. It shares **nothing else**: separate sessions, separate memory, separate tools.

Its tools are about building, not driving: list available node types, inspect a node's schema, add a node, connect nodes, set a config, validate the workflow, read the current graph. It should **not** have `click` or `swipe` — building a workflow is not the same as performing it, and an agent with both will perform when it should compose.

## Deliverables

- **A chat interface** with a session sidebar, mirroring Agent Mode's shape so the app feels coherent.
- **A builder tool set** in `tool-sdk` or a sibling: node discovery, schema inspection, graph mutation, validation.
- **The same agent loop**, `runAgent` from `packages/ai-agent`, with a different tool set and a different system prompt.
- **Visible progress**: each tool call shown as it happens, so the user watches the workflow being assembled.
- **Incremental construction** — the agent builds the graph node by node through tools rather than emitting one JSON document.
- **Validation before hand-off**: the graph must load and every node's config must satisfy its own schema before the canvas opens.
- **A repair loop**: a validation failure goes back to the agent as a correction rather than to the user as an error.

## Tasks

1. Decide incremental-vs-single-document and record it. **Incremental is strongly preferred** and is most of the fix for D2: a single JSON document is validated once at the end, and a model asked for twelve nodes at once gets some of them wrong. Tool-by-tool construction validates each node as it is added, so the failure is caught while it is still one node's problem.
2. Define the builder tools with Zod args, mirroring how device tools are defined.
3. Implement them against the canvas store so the user watches the graph appear.
4. System prompt for workflow construction: the available node types, the shape of a valid graph, and the rules that matter — a condition needs both branches wired, a loop needs a body, a selector needs something that can locate an element.
5. Session store and persistence, separate from Agent Mode's.
6. Chat UI reusing Agent Mode's components where the shapes genuinely match.
7. Validation gate: run the loader and every node's config schema before opening the canvas.
8. Repair loop: feed the validation error back as a correction, bounded, then report honestly if it still fails.
9. Keep the workflow **unsaved** when it reaches the canvas. A generated workflow looks authoritative and the user did not write it.
10. Delete `useWorkflowGeneration` once the agent replaces it, or reduce it to a fast path for trivial requests — but do not leave two generation paths that can diverge.

## Definition of done

- Create-with-AI opens a chat with a session sidebar.
- Sessions persist and are separate from Agent Mode's.
- The agent's tool calls are visible as it works.
- The graph appears on the canvas incrementally, or the chat says why it cannot.
- **A generated workflow loads valid and every node's config satisfies its own schema.**
- A validation failure is repaired by the agent, or reported plainly — never dumped on the canvas as a broken graph.
- The workflow arrives unsaved.
- The builder agent cannot perform device actions.
- The same `runAgent` drives both this and Agent Mode.

## Notes for the implementer

- **Incremental construction is the fix for D2.** A single document fails whole; a per-node build fails one node at a time and can be corrected in place.
- **No device tools here.** An agent with `click` available will use it, and "build me a workflow" will become "do the thing once".
- Do not fork the loop. `runAgent` takes its tools and prompts as inputs; that is the seam, and using it is what keeps one agent implementation.
- Watching the graph assemble is most of the answer to D1. Progress is not a spinner, it is the work becoming visible.
- Validating against `WorkflowSchema` alone is not enough — it checks the document shape, not each node's own config. Both, always.

## Skills to load

- `ai-agent-builder`
- `prompt-engine`
- `rn-ui-builder-zustand`
- `node-sdk-author`
- `testing-quality`
