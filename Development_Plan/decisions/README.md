# Architecture Decision Records

Short, dated records of the decisions that shape this project. Each ADR states the context, the decision, and the consequences. Once accepted, an ADR is not edited - it is superseded by a new one.

| ADR | Decision | Status |
|-----|----------|--------|
| [0001](0001-react-native-plus-kotlin.md) | React Native + Kotlin, not Flutter or RN-only | Accepted |
| [0002](0002-pnpm-turborepo-monorepo.md) | pnpm workspaces + Turborepo for the TS side | Accepted |
| [0003](0003-zustand-for-ui-state.md) | Zustand for UI state | Accepted |
| [0004](0004-nativewind-for-styling.md) | NativeWind + centralized design tokens | Accepted |
| [0005](0005-sqlite-room-persistence.md) | SQLite/Room for local persistence | Accepted |
| [0006](0006-zod-for-schemas.md) | Zod for workflow, node, and tool schemas | Accepted |
| [0007](0007-chat-completions-only.md) | OpenAI-compatible Chat Completions only (v1) | Accepted |
| [0008](0008-two-engines-one-runtime.md) | Two engines, one shared Android Tool Runtime | Accepted |
| [0009](0009-selectors-over-coordinates.md) | Robust selectors over raw coordinates | Accepted |
| [0010](0010-ci-only-apk-builds.md) | APKs are built only in CI, never locally | Accepted |
| [0011](0011-two-modes-not-tabs.md) | Two modes, not one tabbed shell | Accepted |
| [0012](0012-agent-loop-in-js-with-foreground-service.md) | The agent loop stays in JS, kept alive by a foreground service | Accepted |
| [0013](0013-perception-fallback-chain.md) | Perception is a fallback chain: tree, then OCR, then vision | Accepted |
| [0014](0014-one-loop-engine-several-agents.md) | One agent loop engine, several agents | Accepted |
| [0015](0015-typed-route-store-not-react-navigation.md) | A typed route store, not react-navigation | Accepted |
| [0016](0016-run-controller-is-a-module-not-a-component.md) | The run controller is a module, not a component | Accepted |

ADRs 0011–0014 came out of device testing after phases 0–9 shipped. 0011 supersedes the tabbed shell that Phase 6 built; the rest fill gaps the original plan did not anticipate. 0015 settles a navigation decision deferred twice. 0016 refines 0012 with where in JavaScript the run actually lives, which is what issue B1 turned out to be.
