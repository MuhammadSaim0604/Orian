---
name: prompt-engine
description: Build prompt templates, context assembly, and structured-output parsing for the agent, Configure-with-AI overlay, and workflow generation. Use when creating or editing prompts and model context builders.
---

# Skill: Prompt Engine

## When to use

You are building or extending prompt templates, context assembly, or structured-output parsing. Used by the AI agent (Phase 7), the Configure-with-AI overlay (Phase 8), and workflow generation (Phase 9). The plan explicitly calls for a "proper prompt creation engine for everything" — this is that engine.

## Principles

- **One engine, many use-cases.** Agent planning, tool selection, node configuration, and workflow generation all go through `packages/prompt-engine` — no ad-hoc string concatenation scattered across the codebase.
- **Templates are versioned and testable.** A prompt is data (template + inputs), not inline strings.
- **Structured output, always.** Prompts request schema-conforming JSON; a parser validates it with Zod and repairs/re-prompts on failure.
- **Context assembly is explicit.** Building the model context (UI tree, screenshot, node context, memory, tools) is a first-class, tested function — not improvised per call site.

## Structure

```
packages/prompt-engine/
├── templates/         # named, versioned prompt templates
├── context/           # context builders (agent, node-config, generation)
├── parsers/           # structured-output parsers + Zod validation
└── index.ts
```

## Procedure

### 1. Template model
A template declares required inputs and renders a message array for Chat Completions. Keep system/developer/user roles explicit. Version templates so changes are traceable.

### 2. Context builders
- **Agent context**: goal, current observation (UI tree + optional screenshot), memory, available tools.
- **Node-config context**: the payload from `../architecture/Data_Models.md` — `{ node, screen, uiTree, screenshot, availableTools }`.
- **Generation context**: an execution trace to be compiled into a workflow.
Each builder trims/summarizes to respect token limits and redacts secrets.

### 3. Structured output
- Every prompt that drives an action or config requests JSON matching a Zod schema.
- The parser validates; on failure it either repairs (if trivially fixable) or re-prompts with the validation error.
- Example (Configure-with-AI): user says "Return true if the Send button is visible" → output `{ condition: { type: "element_exists", selector: { text: "Send" } } }`, validated against the condition node schema.

### 4. Tool-call prompts
For the agent, encode the tool schemas (from `tool-sdk`) into the prompt / function-calling spec so the model picks a valid tool with valid args.

### 5. Safety
- Never inject secrets (provider keys) into prompts.
- Treat screen content and model output as untrusted; validate before acting.
- Keep prompts provider-agnostic (Chat Completions compatible).

## Checklist

- [ ] All prompts go through the engine; no scattered string building.
- [ ] Templates are named, versioned, and unit-tested.
- [ ] Context builders exist for agent, node-config, and generation, with token-limit handling.
- [ ] Structured outputs validated with Zod; repair/re-prompt on failure.
- [ ] Tool schemas encoded for the agent's tool calls.
- [ ] Secrets never enter prompts; outputs validated before acting.
