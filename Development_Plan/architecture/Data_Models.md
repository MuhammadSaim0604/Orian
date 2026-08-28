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
6. **OCR text match** — recognised text plus its bounding box
7. coordinates
8. screenshot / vision fallback

OCR sits above raw coordinates because a text match survives layout shifts and is checkable; it sits below a tree text match because OCR misreads characters.

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
 ├── id
 ├── mode              agent | builder      ← which mode owns it; never shared
 ├── title
 ├── messages[]        { role, content, toolCalls[], timestamp }
 ├── memory[]          observations, prior results
 ├── createdAt / updatedAt
 └── runs[]            AgentRun

AgentRun
 ├── id
 ├── sessionId
 ├── goal
 ├── plan[]            planned steps
 ├── currentObservation { screenshot, uiTree, ocrText, package, activity }
 ├── toolCalls[]       { tool, args, result }
 └── status            planning | acting | replanning | done | failed | stopped
```

Sessions are **scoped to a mode**. Agent Mode's sessions and the workflow builder agent's sessions are stored together but never mixed: a builder session that could see device-run history would invite the model to conflate composing a workflow with performing it.

## OCR result

```
OcrResult
 ├── blocks[]
 │    ├── text
 │    ├── bounds        { left, top, right, bottom }  ← same space as the UI tree
 │    └── confidence
 ├── screenshotPath
 └── capturedAt
```

Bounds must be in the **same coordinate space as the accessibility tree**, or a tap derived from OCR lands in the wrong place. A screenshot may be scaled relative to the tree, so the transform is part of the contract rather than an implementation detail.

## AI provider registry

```
Provider
 ├── id
 ├── label
 ├── baseUrl
 ├── hasApiKey         boolean — never the key itself
 ├── models[]          discovered from GET {baseUrl}/models, cached
 └── defaultModel
```

The registry is **root-level** and shared by both modes, so a provider is configured once. The key lives in the Android Keystore; `hasApiKey` is what crosses to JavaScript, and the provider client takes a function read at request time.

## Node toolset context payload

Sent to the model when a user configures a node via the toolset overlay:

```json
{
  "node": { "id": "if_23", "type": "condition", "configuration": {} },
  "screen": { "package": "com.whatsapp", "activity": "..." },
  "uiTree": "...",
  "ocrText": [{ "text": "Send", "bounds": {} }],
  "screenshot": "/path/to/capture.png",
  "availableTools": [],
  "configJsonSchema": {}
}
```

The model must return a **structured node configuration**, validated against that node's own Zod schema — never free-form prose. `ocrText` is included so the model can target text the accessibility tree does not expose.

## Persistence

- Workflows, traces, sessions, providers, tool toggles, and settings persist locally in **SQLite / Room**.
- Large binaries (screenshots) are stored on the filesystem with **paths** in the DB, never as blobs. A twenty-step trace with inline images would be tens of megabytes in one row.
- A screenshot directory is recorded against its owning trace, so deleting the trace deletes its files. Without that, removing a trace leaves orphaned images nothing ever cleans up.
- Documents (workflows, traces) are stored as **one JSON column**, not decomposed into relational tables. Their schemas are owned by TypeScript and by third-party node packages, so a relational mirror in Kotlin would need a migration every time a node package changed.
- Every schema change ships a **real migration**. There is no destructive fallback: losing a user's saved workflows is not an acceptable upgrade path.
- AI provider credentials live in Android secure storage — never in plain SQLite, never logged, never in a prompt.
