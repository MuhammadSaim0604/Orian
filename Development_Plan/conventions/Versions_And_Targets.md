# Pinned Versions & Target Platforms

The versions the project builds against. External dependencies are pinned exactly (no `^` or `~`) so CI is reproducible. Bumping anything here is a deliberate, reviewed change.

## Toolchain

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 22.x LTS | Pinned in CI via `actions/setup-node`; matches `engines` in the root `package.json` |
| pnpm | 9.x | Pinned by the `packageManager` field, activated with Corepack |
| Turborepo | 2.x | Task orchestration for the TS side |
| TypeScript | 5.x | `strict` everywhere |
| JDK | 21 (Temurin LTS) | Required by recent Android Gradle Plugin versions |
| Kotlin | 2.0.x | |
| Gradle | 8.x | Wrapper committed; CI uses the wrapper |
| Android Gradle Plugin | 8.x | |
| ktlint | current stable | Kotlin formatting, enforced in CI |

## Android targets

| Setting | Value | Rationale |
|---------|-------|-----------|
| `minSdk` | 26 (Android 8.0) | `AccessibilityService.dispatchGesture()` requires API 24, and `TYPE_APPLICATION_OVERLAY` requires API 26. API 26 is the real floor for this product. |
| `targetSdk` | 35 (Android 15) | Current Play target requirement |
| `compileSdk` | 35 | |

### Device / emulator matrix

CI runs instrumentation tests on emulators; the owner verifies on physical hardware.

| Tier | API level | Where |
|------|-----------|-------|
| Floor | 26 | CI emulator (smoke) |
| Mainstream | 31 | CI emulator |
| Current | 35 | CI emulator (primary) |
| Physical device | owner's device | Manual verification of Accessibility, gestures, overlay, capture |

Note: instrumentation tests that need Accessibility or MediaProjection are inherently awkward on emulators. Where a capability cannot be verified in CI, it is covered by JUnit unit tests for logic plus explicit manual verification on hardware - and the plan says so rather than implying automated coverage.

## Runtime libraries (TS side)

| Library | Purpose |
|---------|---------|
| React Native 0.7x | Product layer |
| React 18/19 (matching the RN release) | |
| Zod 3.x | Workflow, node, and tool schemas |
| Zustand 4.x | UI state |
| NativeWind 4.x + Tailwind 3.x | Styling and design tokens |
| react-native-reanimated 3.x | Canvas camera and gestures |
| react-native-gesture-handler 2.x | Gesture input |
| @shopify/react-native-skia 1.x | Canvas rendering |
| Vitest 2.x | Library tests |
| Jest + @testing-library/react-native | RN app tests |
| ESLint 9.x (flat config) + Prettier 3.x | Lint and format |

Exact patch versions live in the lockfile; the table records the intended major line.

## AI provider contract

OpenAI-compatible **Chat Completions** only in v1 (see ADR 0007). The client is configured by base URL, model, and API key, so any compatible provider or local gateway works without code changes.

## Build policy

APKs - debug and release - are built **only in GitHub Actions** (see ADR 0010). Never on the development machine.
