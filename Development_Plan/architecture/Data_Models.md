# Data Models

All TypeScript schemas are defined with **Zod** in `packages/workflow-schema` and `packages/shared-types`, giving both runtime validation and static types (`z.infer`).

## Workflow

```
Workflow
 ├── id
 ├── metadata      { name, description, createdAt, updatedAt, version }
 ├── variables[]   { name, type, defaultValue }
 ├── nodes[]       Node
 └── edges[]       { id, source, sourceHandle, target, targetHandle }
```

## Node

```
Node
 ├── id
 ├── type            "condition" | "action" | "loop" | "variable" | "transform" | "trigger" | "input"
 ├── inputs          { [handle]: portSpec }
 ├── outputs         { [handle]: portSpec }
 ├── config          type-specific object (validated per node type)
 ├── metadata        { label, position {x,y}, packageName }
 └── executionPolicy { retry, timeoutMs, onError }
```

Node config schemas are contributed by each node package and merged into the registry. Example condition config:

```json
{
  "condition": {
    "type": "element_exists",
    "selector": { "text": "Send" }
  }
}
```

## Selector (robust targeting)

The most important model for reliable replay. Stored richly, resolved by priority.

```json
{
  "action": "click",
  "target": {
    "text": "Robert",
    "resourceId": "...",
    "className": "...",
    "contentDescription": "...",
    "bounds": { "left": 100, "top": 700, "right": 900, "bottom": 850 }
  },
  "fallback": { "coordinates": { "x": 421, "y": 832 } },
  "screen": { "package": "...", "activity": "..." }
}
```

**Resolution priority:**
1. `resourceId`
2. accessibility semantics
3. `text` / `contentDescription`
4. structural UI selector
5. relative position
6. coordinates
7. screenshot / vision fallback

## Execution Trace (recorder output)

One entry per executed step during an AI run:

```
ExecutionStep
 ├── screenshot        (ref / base64)
 ├── uiHierarchy       (serialized UI tree)
 ├── package
 ├── activity
 ├── action            click | swipe | typeText | …
 ├── coordinates       { x, y }
 ├── nodeId
 ├── selectedElement   full element info
 ├── selector          Selector (see above)
 ├── timestamp
 └── result            success | failure + detail
```

`ExecutionTrace = ExecutionStep[]` → compiled into a `Workflow` by the generator in `packages/execution-recorder`.

## AI Agent state

```
AgentSession
 ├── goal
 ├── plan[]            planned steps
 ├── memory[]          observations, prior results
 ├── currentObservation { screenshot, uiTree, package, activity }
 ├── toolCalls[]       { tool, args, result }
 └── status            planning | acting | replanning | done | failed
```

## Configure-with-AI context payload

Sent to the model when a user configures a node via the overlay:

```json
{
  "node": { "id": "if_23", "type": "condition", "configuration": {} },
  "screen": { "package": "com.whatsapp", "activity": "..." },
  "uiTree": "...",
  "screenshot": "...",
  "availableTools": []
}
```

The model must return a **structured node configuration** (validated by the node's Zod schema) — never free-form prose.

## Persistence

- Workflows, traces, sessions, and settings persist locally in **SQLite / Room**.
- Large binaries (screenshots) stored on the filesystem with references in the DB.
- AI provider credentials in Android secure storage — never in plain SQLite, never logged.
