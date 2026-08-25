# Monorepo Structure

**Tooling:** pnpm workspaces + Turborepo for the TS/JS side; Gradle for Android. One repository, one CI.

```
mobile-automation/
│
├── apps/
│   └── mobile/                 # React Native app (product layer)
│
├── packages/
│   ├── node-sdk/               # Base Node classes, registry, executor contracts (TS)
│   ├── core-nodes/             # Generic nodes: Input/Action/Condition/Loop/Variable/Transform/Trigger
│   ├── android-nodes/          # OpenApp/Click/Swipe/TypeText/ReadScreen/FindElement/…
│   ├── workflow-engine/        # DAG execution, node registry, executor (TS)
│   ├── workflow-schema/        # Zod schemas for workflow/node/edge JSON
│   ├── ai-agent/               # Agent loop, planner, memory, tool selection
│   ├── prompt-engine/          # Prompt templates, context builders, output parsers
│   ├── tool-sdk/               # Typed tool definitions shared by agent + MCP
│   ├── mcp-server/             # MCP server exposing the Android tool set
│   ├── execution-recorder/     # Trace capture + workflow generation
│   ├── screen-inspector/       # UI tree / screenshot inspection helpers
│   ├── shared-types/           # Cross-package TypeScript types
│   └── ui/                     # Reusable RN components, theme, NativeWind config
│
├── android/                    # Native Kotlin subsystems (Gradle modules)
│   ├── accessibility/          # AccessibilityService, UI tree parser
│   ├── automation/             # Automation runtime
│   ├── gestures/               # dispatchGesture wrappers
│   ├── screen/                 # Screen capture
│   ├── overlays/               # Overlay/floating window manager
│   └── tools/                  # Android API tool implementations
│
├── tests/                      # Cross-package / e2e tests
│
├── turbo.json
├── pnpm-workspace.yaml
├── eslint.config.js
├── prettier.config.js
└── package.json
```

## Package ownership & language boundary

| Area | Language | Published to npm? |
|------|----------|-------------------|
| `packages/*` | TypeScript | `node-sdk`, `core-nodes`, `android-nodes`, `workflow-schema`, `tool-sdk`, `mcp-server` → yes |
| `apps/mobile` | TypeScript (RN) | no |
| `android/*` | Kotlin | no (consumed by the RN app as native modules) |

**Do not force everything into TypeScript.** The npm ecosystem is TS; the Android runtime is Kotlin.

## Dependency direction

```
apps/mobile
  → packages/ui, workflow-engine, ai-agent, execution-recorder, screen-inspector
  → (native) android/*

workflow-engine → node-sdk, workflow-schema, shared-types
core-nodes / android-nodes → node-sdk, tool-sdk, shared-types
ai-agent → prompt-engine, tool-sdk, shared-types
mcp-server → tool-sdk, shared-types
android-nodes (runtime) → android/* via the native bridge
```

No package may depend "upward" toward `apps/mobile`. `shared-types` and `node-sdk` sit at the bottom.

## Third-party node distribution

```
npm install @your-sdk/android-nodes
npm install @developer/custom-nodes
```

The app discovers installed packages that declare a node manifest, validates them against `workflow-schema`, and registers them in the Node Registry — the n8n community-node model.

## Turborepo tasks

Define pipelines in `turbo.json`: `build`, `lint`, `test`, `typecheck`, with correct `dependsOn` (`^build`) so builds respect the dependency graph and cache well. Gradle builds are invoked from the `apps/mobile` Android build and wired into CI separately.
