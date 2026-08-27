# @mobile-automation/native-automation

The typed bridge between TypeScript and the Kotlin Automation Runtime.

This is the **only** place TypeScript talks to the native automation layer. Everything above it - `android-nodes`, `ai-agent`, `screen-inspector`, the workflow engine - depends on this package rather than reaching for `NativeModules` itself, so the boundary stays inspectable and typed (`conventions/Coding_Conventions.md`).

## Shape

```
src/
  spec/NativeAutomation.ts     Turbo Module codegen spec - the raw native surface
  types.ts                     selectors, resolved elements, screenshots, UI trees
  errors.ts                    AutomationError union + mapping from Kotlin codes
  events.ts                    event channel payloads (UI tree, execution progress)
  automation.ts                the friendly API consumers actually call
  index.ts                     barrel
```

## Two layers, on purpose

The codegen spec is constrained by what React Native's codegen understands: no unions, no discriminated results, and objects limited to primitives and arrays. Writing the whole API at that level would push those constraints onto every caller.

So the spec stays deliberately plain - JSON strings at the boundary for anything structured - and `automation.ts` wraps it in the API the rest of the product uses: real types, `Promise<T>` that rejects with a typed error, and no JSON handling anywhere else.

## Errors

Kotlin returns `ToolResult`, never throwing. The bridge rejects with an `AutomationError` carrying the Kotlin error code, so callers can branch on `isRetryable` and `needsUserAction` exactly as the Kotlin side does:

```ts
try {
  await automation.click({ resourceId: 'send_button' });
} catch (error) {
  if (isAutomationError(error) && error.needsUserAction) {
    // prompt for accessibility or screen-capture consent
  }
}
```

## Large payloads cross by reference

Screenshots are returned as file paths, never inline base64, and the UI tree has a compact serialization mode. Copying megabytes across the bridge would block the JS thread on every capture.
