# ADR 0006 - Zod for workflow, node, and tool schemas

**Status:** Accepted

## Context

Three kinds of untrusted data enter the system: workflow JSON (possibly hand-edited or generated), third-party node packages installed from npm, and AI model output. All three must be validated before use, and all three also need static TypeScript types.

## Decision

Use **Zod** as the single validation layer, with types derived via `z.infer`.

- `packages/workflow-schema` defines `Workflow`, `Node`, `Edge`, `Selector`, and shared config primitives.
- Each node package contributes its own **config schema**; the registry merges them.
- Each tool in `tool-sdk` declares an **args schema**, reused by both the agent and the MCP server.
- AI output (tool calls, node configurations) is validated against the relevant schema and repaired or re-prompted on failure - never executed unvalidated.

## Consequences

- **Positive:** one definition yields runtime validation and static types; invalid workflows and malformed model output are rejected with actionable errors.
- **Positive:** third-party nodes can be validated at registration time rather than crashing at execution time.
- **Negative:** schemas add runtime weight and must be kept in sync with node implementations.
- **Rule that follows:** the model must return structured, schema-conforming output - never prose that gets parsed loosely.
