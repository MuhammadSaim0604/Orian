# ADR 0001 - React Native + Kotlin, not Flutter or RN-only

**Status:** Accepted

## Context

The product is an Android automation platform with a visual workflow builder attached. The hardest part is not the canvas - it is deep Android integration: `AccessibilityService`, `AccessibilityNodeInfo`, `dispatchGesture()`, screenshots, UI hierarchy, foreground services, notification APIs, overlay windows, intents, package launching, permissions, device information, contacts, alarms, clipboard, media, assistant APIs, system settings, and background execution.

Three options were considered:

1. **Flutter only** - strong canvas/UI, but every Android capability goes through platform channels, and a large native Kotlin subsystem would emerge anyway.
2. **React Native only** - the same fundamental issue as Flutter for native depth.
3. **React Native + Kotlin** - RN for the product layer, Kotlin for OS integration.

## Decision

Use **React Native + TypeScript for the product layer** and **Kotlin for the Android OS-integration layer**, bridged by Turbo Modules / JSI.

The node SDK, workflow schema, AI agent, prompt engine, and MCP server are TypeScript, because the extensibility story is an npm ecosystem. The automation runtime is Kotlin, because it needs first-class access to Android internals.

## Consequences

- **Positive:** first-class Android control; a natural npm/TypeScript ecosystem for third-party nodes; a highly dynamic builder UI in RN.
- **Positive:** a clear language boundary that prevents automation logic leaking into JS.
- **Negative:** two toolchains (pnpm/Turborepo and Gradle) and a bridge to maintain.
- **Rule that follows:** never implement deep automation in React Native. RN is the product layer; Kotlin is the OS layer.
