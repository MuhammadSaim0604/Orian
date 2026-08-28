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
│   ├── ocr/                    # On-device text recognition
│   ├── overlays/               # Overlay/floating window manager
│   ├── storage/                # Room: workflows, traces, sessions
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
  → packages/ui, workflow-engine, core-nodes, android-nodes, node-sdk,
    ai-agent, prompt-engine, execution-recorder, screen-inspector, native-automation
  → (native) android/*

workflow-engine → node-sdk, workflow-schema, shared-types
core-nodes / android-nodes → node-sdk, tool-sdk, shared-types
ai-agent → prompt-engine, tool-sdk, shared-types
prompt-engine → tool-sdk, shared-types
execution-recorder → workflow-schema, shared-types
mcp-server → tool-sdk, shared-types
android-nodes (runtime) → android/* via the native bridge
```

No package may depend "upward" toward `apps/mobile`. `shared-types` and `node-sdk` sit at the bottom.

Three boundaries worth stating separately, because breaking one is silent:

- **`packages/native-automation` is the only place TypeScript touches `NativeModules`.** Every other consumer goes through its typed wrappers, and `invokeTool` is the by-name dispatch the agent, the workflow engine, the overlays, and the MCP server all share. There is no second path to the device.
- **`execution-recorder` does not depend on `ai-agent`.** It takes a plain object shaped like the agent's `toolExecuted` event, so it is testable without the agent and the dependency does not run upward toward the loop.
- **`android/overlays` is depended on by the app module directly**, not through `android/automation`. The automation runtime does not draw windows, and routing the dependency through it would make every consumer of the runtime pull in the overlay layer.

## Third-party node distribution

```
npm install @your-sdk/android-nodes
npm install @developer/custom-nodes
```

The app discovers installed packages that declare a node manifest, validates them against `workflow-schema`, and registers them in the Node Registry — the n8n community-node model.

## Metro entrypoints — a trap worth knowing

Metro does not run Turborepo's build first, so a package the RN app imports whose `main` points at `dist/` **breaks the release bundle while the debug APK still passes** — a misleading green. Two working shapes:

- Private, app-only packages (`ui`, `native-automation`, `ai-agent`): `main` at `./src/index.ts`.
- Publishable packages (`node-sdk`, `core-nodes`, `android-nodes`, `workflow-schema`): keep `main` at `./dist` and add a top-level `"react-native": "./src/index.ts"` field, so Metro and Jest read source while Node and vitest read `dist`.

Verify either with `npx react-native bundle --platform android --dev false`.

## Turborepo tasks

Define pipelines in `turbo.json`: `build`, `lint`, `test`, `typecheck`, with correct `dependsOn` (`^build`) so builds respect the dependency graph and cache well. Gradle builds are invoked from the `apps/mobile` Android build and wired into CI separately.

**Only a Gradle assemble compiles some sources.** `ktlintCheck` and `testDebugUnitTest` do not compile `apps/mobile/android/app`, and neither compiles the `androidTest` source set. A broken dependency or a stale instrumentation test therefore passes every local check and fails in CI. When changing a module's public surface run `gradle :<module>:assembleDebug`; when changing anything an instrumentation test touches run `gradle assembleDebugAndroidTest`.
