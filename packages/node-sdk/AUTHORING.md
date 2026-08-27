# Authoring a node package

Third-party packages extend this app the way n8n community nodes extend n8n: you publish a package to npm, the user installs it, and the app discovers, validates, and registers what it provides.

This document is the contract. If your package follows it, the app will load it; if it does not, the app will refuse it with a reason.

## What a node is

A node is a plain object, not a class to extend. You export it and the app registers it.

```ts
import { defineNode } from '@mobile-automation/node-sdk';
import { z } from 'zod';

export const scrapeTableNode = defineNode({
  type: 'scrapeTable',
  version: '1.0.0',
  kind: 'action',

  display: {
    label: 'Scrape Table',
    description: 'Reads a table from the screen into a list',
    icon: 'table',
    category: 'Data',
  },

  configSchema: z.object({
    headerRow: z.boolean().default(true),
    maxRows: z.number().int().positive().max(500).default(50),
  }),

  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [{ handle: 'next', label: 'Next' }],

  requiresDevice: true,

  execute: async (context) => {
    const tree = await context.tools.invoke('getUiTree', { compact: true });
    const rows = readRows(tree, context.config.maxRows);

    return {
      outputs: { result: rows },
      summary: `read ${rows.length} rows`,
    };
  },
});
```

`defineNode` does nothing at run time. It exists so TypeScript infers your config type from `configSchema`, which means `context.config` is typed inside `execute` and a schema change surfaces as an error in your node rather than at a call site.

## The seven kinds

Every node declares a `kind`, which tells the engine how it behaves:

| Kind        | Behaviour                                        |
| ----------- | ------------------------------------------------ |
| `trigger`   | starts a workflow                                |
| `input`     | contributes a value collected before the run     |
| `action`    | does something and continues                     |
| `condition` | picks one of two named outputs                   |
| `loop`      | repeats the nodes connected to its `body` output |
| `variable`  | writes to the variable store                     |
| `transform` | reshapes a value without touching the device     |

Most third-party nodes are `action`. Choose `condition` or `loop` only if you genuinely control flow — see _Branching and looping_ below.

## Config is validated for you

`configSchema` is a Zod schema and it is the only description of your config. The app uses it three ways:

- The workflow **fails to load** if a node's config does not satisfy it, naming the field. Nothing runs.
- The builder UI **generates a form** from it, so a good schema is a good editing experience.
- The Configure-with-AI overlay makes the model **return config validated against it**, never prose.

Be specific. `z.number()` produces a number field; `z.number().int().positive().max(500)` produces one that cannot be set to something your node will choke on.

## What `execute` receives

```ts
type ExecutionContext<TConfig> = {
  nodeId: string;
  config: TConfig; // already validated
  inputs: Record<string, JsonValue>; // what upstream nodes published
  variables: VariableStore;
  tools: ToolInvoker; // device tools, by name
  signal: AbortSignal;
  log: (message: string) => void;
  attempt: number; // 0 on the first try
};
```

Some deliberate omissions. You cannot see the graph, reach other nodes, or decide what runs next — that is the engine's job, and a node that could do those things would make execution order impossible to reason about.

`tools` is an interface, not the native bridge. That is what lets your package be tested with a fake and run without a phone attached.

## What `execute` returns

```ts
type NodeResult = {
  outputs?: Record<string, JsonValue>; // published on your output handles
  branch?: { handle: string }; // which output to follow
  repeat?: boolean; // ask to be re-entered
  summary?: string; // one line for the execution log
};
```

Publish a single value as `outputs.result` — that is the key the engine hoists onto the next node's input handle, and what a config referring to your node's output will read.

## Failing well

Throw `NodeExecutionError`. The engine reads two flags off it:

```ts
import { NodeExecutionError } from '@mobile-automation/node-sdk';

throw new NodeExecutionError(context.nodeId, 'scrapeTable', 'no table on this screen', {
  retryable: false, // repeating this will not help
  needsUserAction: true, // but the user can fix it
  detail: { screen: 'com.example/MainActivity' },
});
```

- **`retryable`** defaults to `true`, matching the common case of a transient device condition. Set it `false` when repeating cannot possibly succeed — the engine will then skip the retry budget and report immediately.
- **`needsUserAction`** is separate from retryable. A missing permission will never resolve itself, but the user can grant it, so the UI should prompt rather than merely report failure.

Getting these right matters more than it looks: they are the difference between a workflow that recovers from a slow screen and one that taps twenty times at something that will never appear.

## Branching and looping

A **condition** returns which handle to follow:

```ts
outputs: [
  { handle: 'true', label: 'True' },
  { handle: 'false', label: 'False' },
],
execute: async (context) => ({ branch: { handle: matched ? 'true' : 'false' } }),
```

A **loop** returns `repeat: true` and keeps **no state of its own** between calls. Store the iteration counter in the variable store, namespaced by `context.nodeId`:

```ts
outputs: [
  { handle: 'body', label: 'Each iteration' },
  { handle: 'done', label: 'Done' },
],
execute: async (context) => {
  const key = `__loop_${context.nodeId}_index`;
  const index = (context.variables.get(key) as number | undefined) ?? 0;

  if (index >= context.config.iterations) {
    context.variables.set(key, 0);   // reset, so re-entry starts fresh
    return { branch: { handle: 'done' } };
  }

  context.variables.set(key, index + 1);
  return { branch: { handle: 'body' }, repeat: true, outputs: { index } };
},
```

Private state would be wrong the moment an outer loop re-entered your node, or the workflow was paused and resumed. **Always bound your loop** — a workflow drives someone's phone, and one that never terminates keeps tapping.

Note that the loop body flows _forward_ to a dead end; you do not draw an edge back to the loop node. The engine returns to the innermost loop when it runs out of successors, which keeps the graph acyclic so cycle detection stays meaningful.

## The manifest

Declare your nodes under `mobileAutomation` in `package.json`:

```json
{
  "name": "@developer/custom-nodes",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "peerDependencies": {
    "@mobile-automation/node-sdk": "^1.0.0"
  },
  "mobileAutomation": {
    "sdkVersion": "1.0.0",
    "nodes": [
      {
        "type": "scrapeTable",
        "version": "1.0.0",
        "kind": "action",
        "label": "Scrape Table",
        "description": "Reads a table from the screen into a list",
        "icon": "table",
        "category": "Data",
        "requiresDevice": true
      }
    ]
  }
}
```

The manifest is not redundant with your exports, and the app checks both directions:

- A node **declared but not exported** means a broken package, reported at install time.
- A node **exported but not declared** is refused outright. It would otherwise execute without appearing in the manifest the user was shown.
- `version`, `kind`, and `requiresDevice` must match your definitions exactly.

**The app reads and validates your manifest before it loads any of your code.** A node package can tap on someone's banking app, so a package that lies about what it provides, targets an incompatible SDK, or is simply broken is rejected without ever executing. Declare `requiresDevice` honestly — it is what lets the app request permissions before a run rather than failing mid-task.

`sdkVersion` is a compatibility gate, matched on the major version. A package built for SDK 1 keeps working as the app adds optional context fields; one built for SDK 2 is refused with a clear message rather than left to discover a missing field halfway through driving a phone.

## Node type naming

Your node types are namespaced automatically as `@developer/custom-nodes:scrapeTable`, so you cannot collide with a built-in or with another package. Use a plain identifier for `type` and let the app qualify it.

## Testing

The SDK ships the test helpers, so you need no device and no emulator:

```ts
import {
  createRecordingToolInvoker,
  createTestContext,
  executeNode,
} from '@mobile-automation/node-sdk';

it('reads rows from the screen', async () => {
  const tools = createRecordingToolInvoker({
    getUiTree: () => ({
      root: {
        children: [
          /* ... */
        ],
      },
    }),
  });

  const result = await executeNode(scrapeTableNode, {
    ...createTestContext({ config: {}, tools }),
    config: { headerRow: true, maxRows: 10 },
  });

  expect(result.outputs?.result).toHaveLength(3);
  expect(tools.calls[0]?.tool).toBe('getUiTree');
});
```

`executeNode` validates config before running, exactly as the engine does, so a test that passes invalid config fails the same way production would. `createRecordingToolInvoker` throws for any tool you did not stub, so a test cannot silently pass while asserting nothing.

## Available device tools

Invoke by name through `context.tools`. The vocabulary is shared with the AI agent and the MCP server:

`click`, `longPress`, `swipe`, `typeText`, `findElement`, `waitForElement`, `getUiTree`, `takeScreenshot`, `pressBack`, `pressHome`, `openApp`, `openAppByName`, `listApps`, `getCurrentScreen`, `getContacts`, `findContacts`, `createAlarm`, `readClipboard`, `writeClipboard`, `sendNotification`, `launchIntent`, `getSystemSetting`, `controlMedia`, `adjustVolume`

Prefer selectors over coordinates. Every tool that targets an element takes a selector carrying several clues — `resourceId`, accessibility semantics, text, structural path — and the native resolver walks them strongest-first. A node that stores raw coordinates produces a workflow that breaks on the next app update.

## Publishing

1. Build to `dist/`, with `main` and `types` pointing at it.
2. Declare `@mobile-automation/node-sdk` as a **peer** dependency, not a regular one — two copies of the SDK in one app would mean two registries.
3. Publish to npm.
4. The user installs it, and the app discovers it on next launch.

## Checklist

- [ ] Every node exported and declared in the manifest, with matching `version`, `kind`, and `requiresDevice`.
- [ ] `configSchema` is specific enough to generate a usable form.
- [ ] Failures throw `NodeExecutionError` with honest `retryable` and `needsUserAction`.
- [ ] Loops are bounded and keep their counter in the variable store.
- [ ] Element targeting uses selectors, not coordinates.
- [ ] The SDK is a peer dependency.
- [ ] Tests cover the failure paths, not only the happy one.
