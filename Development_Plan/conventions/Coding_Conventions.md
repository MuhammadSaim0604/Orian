# Coding Conventions

Binding conventions for this repository. Reviews enforce them; lint enforces what it can.

## Language boundary (the most important rule)

- **React Native + TypeScript** is the product/UI layer.
- **Kotlin** is the Android OS-integration layer.
- Never implement deep automation in TypeScript. Never put product UI logic in Kotlin.
- The only crossing point is the typed Turbo Module bridge.

## Repository layout

```
apps/mobile        RN app (private, never published)
packages/*         TypeScript packages (some published to npm)
android/*          Kotlin Gradle modules (never published)
tests/             cross-package / e2e tests
Development_Plan/  the authoritative plan
```

## Naming

| Thing | Convention | Example |
|-------|-----------|---------|
| Package name | scoped, kebab-case | `@mobile-automation/workflow-engine` |
| Directory | kebab-case | `packages/execution-recorder` |
| TS file (module) | kebab-case | `selector-resolver.ts` |
| TS file (React component) | PascalCase | `NodeInspector.tsx` |
| Type / interface / class | PascalCase | `ExecutionStep`, `NodeDefinition` |
| Function / variable | camelCase | `resolveSelector`, `uiTree` |
| Constant (module-level, fixed) | SCREAMING_SNAKE_CASE | `MAX_AGENT_STEPS` |
| Zod schema | PascalCase + `Schema` | `WorkflowSchema` |
| Inferred type from schema | PascalCase, no suffix | `type Workflow = z.infer<typeof WorkflowSchema>` |
| Kotlin class / file | PascalCase | `GestureEngine.kt` |
| Kotlin function / property | camelCase | `dispatchSwipe` |
| Gradle module | kebab-case | `android/screen-capture` |
| Test file | mirror source + `.test.ts` | `selector-resolver.test.ts` |

## TypeScript rules

- `strict` is on everywhere. No `any` without a written justification comment.
- Every package exports through a single `src/index.ts` barrel; deep imports into another package are forbidden.
- Derive types from Zod schemas (`z.infer`) rather than declaring them twice.
- Prefer `type` for object shapes, `interface` only when declaration merging or class implementation is needed.
- No default exports in packages (named exports only) so re-exports stay explicit. React components in the app may use default exports.
- Async functions return `Promise<T>`; never fire-and-forget a promise without handling rejection.

## Dependency direction (enforced)

```
shared-types, node-sdk        <- bottom, depend on nothing internal
workflow-schema               <- shared-types
tool-sdk                      <- shared-types
core-nodes, android-nodes     <- node-sdk, tool-sdk, shared-types
workflow-engine               <- node-sdk, workflow-schema, shared-types
prompt-engine                 <- shared-types
ai-agent                      <- prompt-engine, tool-sdk, shared-types
mcp-server                    <- tool-sdk, shared-types
execution-recorder            <- workflow-schema, shared-types
screen-inspector              <- shared-types
ui                            <- (RN only, no engine imports)
apps/mobile                   <- top, may import anything
```

- **Nothing may import from `apps/mobile`.** The engine must stay runnable outside React Native.
- Internal dependencies use `workspace:*`.
- External dependencies are **pinned to exact versions** (no `^` or `~`).

## React / RN conventions

- Group by **feature**, not by file type: a feature owns its `components/`, `hooks/`, `store.ts`, `types.ts`.
- One Zustand store per domain; subscribe with narrow selectors.
- No hardcoded colors, spacing, or font sizes - use semantic theme classes.
- Every interactive element needs an accessibility label and an adequate hit area.

## Kotlin conventions

- ktlint governs formatting; do not hand-fight it.
- One responsibility per Gradle module.
- Recycle `AccessibilityNodeInfo` instances; never leak them.
- Native methods exposed to RN return promises and map exceptions to typed error codes.
- No blocking work on the main thread.

## Error handling

- Validate untrusted input at the boundary (workflow JSON, third-party nodes, model output) with Zod.
- Fail with actionable messages that name the node id, tool, or field at fault.
- Never swallow an error silently; log or propagate.
- Never log secrets, tokens, or full provider payloads containing keys.

## Testing

- Unit-test pure logic (schemas, engine, resolver, agent loop) with mocked boundaries.
- Instrumentation-test device behaviour that cannot be unit-tested.
- Mock the AI provider so agent tests are deterministic and offline.
- A feature is not done until its tests pass in CI.

## Commit style

Conventional Commits:

```
<type>(<scope>): <subject>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `build`, `perf`.
Scope is the package or area: `workflow-engine`, `android-accessibility`, `ui`, `ci`, `plan`.

Examples:

```
feat(workflow-engine): add loop node iteration with variable scope
fix(android-gestures): recycle node info after swipe dispatch
ci: build debug and release APKs on pull request
```

Subject is imperative, lower-case, no trailing period, under ~70 characters.

## Branches and CI

- Work on `main` for scaffolding phases; use `feat/<scope>-<short-desc>` branches for larger feature work.
- After every meaningful chunk: commit, push, then verify the GitHub Actions run with `gh` and fix failures before continuing.
- **Never build the APK locally.** All Android builds and tests run in CI.
