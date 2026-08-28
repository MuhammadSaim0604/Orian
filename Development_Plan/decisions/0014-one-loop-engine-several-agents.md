# 0014 — One agent loop engine, several agents

**Status:** accepted

## Context

The product needs two agents. Agent Mode's agent drives the device to achieve a goal. Workflow Mode's builder agent composes a workflow from a description. The first implementation made the second one a single completion call, and its output was unusable — workflows that arrived on the canvas "full of errors".

The temptation is to write a second agent implementation, because the two do different things.

## Decision

**One loop engine, several configurations.** `runAgent` in `packages/ai-agent` takes its tools, prompts, and provider as inputs. Both agents use it, differing only in:

| | Agent Mode | Builder agent |
| --- | --- | --- |
| Tools | device tools | node discovery, schema inspection, graph mutation, validation |
| Prompt | drive the device | compose a workflow |
| Sessions | its own | its own, isolated |
| Memory | its own | its own, isolated |

The builder agent has **no device tools**.

## Consequences

- Two loop implementations would mean two sets of stop conditions, two replanning strategies, and two places where structured output is validated. The seam already exists; using it is what keeps one implementation.
- **The builder agent must not be able to act on the device.** An agent with `click` available will use it, and "build me a workflow" quietly becomes "do the thing once" — leaving the user with no workflow and a changed phone.
- The builder agent constructs the graph **incrementally through tools** rather than emitting one JSON document. This is most of the fix for the broken-generation defect: a single document is validated once at the end and fails whole, while per-node construction validates each node as it is added and fails one node at a time, where it can be corrected.
- Sessions and memory must be genuinely isolated. A builder session that can see device-run history would invite the model to conflate composing with performing.
- Both agents share the provider registry, so the user configures a provider once.
