# Mobile Automation Platform — Development Plan

An n8n-style **mobile automation platform** for Android: read the screen, perform gestures (click, swipe, long press, type), and drive any app through Accessibility, device APIs, and overlays. It ships with **two automation layers** that share one Android capability runtime:

1. **AI Agent** — give it a goal in natural language ("Send Robert a WhatsApp message that I'll be late") and it plans, observes the screen, chooses tools, executes, and replans.
2. **Workflow Engine** — a visual, node-based builder (like n8n) with a smooth mobile canvas, logic nodes, and an importable Node SDK published to npm.

## Tech stack (decided)

| Layer | Technology |
|-------|-----------|
| Product UI | React Native + TypeScript |
| Android automation core | Kotlin |
| Native bridge | Turbo Modules / JSI |
| Workflow engine | TypeScript (definition) + Kotlin (runtime) |
| AI Agent runtime | TypeScript |
| Canvas | Skia + Reanimated + Gesture Handler |
| UI state | Zustand |
| Styling | NativeWind + centralized theme |
| Local DB | SQLite / Room |
| Node SDK / packages | TypeScript, published to npm |
| MCP server | TypeScript |
| API | OpenAI-compatible Chat Completions |
| Monorepo | pnpm + Turborepo |
| Validation | Zod |
| Lint / format | ESLint + Prettier + ktlint |
| Testing | Vitest/Jest + JUnit + Android instrumentation |
| CI/CD | GitHub Actions |

**Core principle:** React Native is the product layer; Kotlin is the Android OS-integration layer. Never push deep automation into React Native.

## Folder map

```
Development_Plan/
├── README.md                 ← you are here
├── 00_Overview.md            ← vision, scope, glossary
├── 01_Roadmap.md             ← phase timeline & milestones
├── architecture/
│   ├── System_Architecture.md
│   ├── Monorepo_Structure.md
│   └── Data_Models.md
├── decisions/                ← architecture decision records (0001-0010)
│   ├── README.md
│   └── 0001-…-0010-….md
├── conventions/
│   ├── Coding_Conventions.md
│   ├── Permission_Model.md
│   └── Versions_And_Targets.md
├── phases/
│   ├── Phase_00_Foundation.md
│   ├── Phase_01_Monorepo_Tooling.md
│   ├── Phase_02_Android_Automation_Core.md
│   ├── Phase_03_Native_Bridge.md
│   ├── Phase_04_Node_SDK_And_Schema.md
│   ├── Phase_05_Workflow_Engine.md
│   ├── Phase_06_Workflow_Builder_UI.md
│   ├── Phase_07_AI_Agent_Engine.md
│   ├── Phase_08_Configure_With_AI_Overlay.md
│   ├── Phase_09_Execution_Recorder_And_Generation.md
│   └── Phase_10_MCP_And_Polish.md
```

## How to use this plan

1. Read `00_Overview.md` for scope and vocabulary.
2. Read the `architecture/` docs to understand how the pieces fit.
3. Read `decisions/` for why the stack is what it is, and `conventions/` for how to write code, handle permissions, and which versions to target.
4. Execute phases in `phases/` in order — each has goals, deliverables, and a definition of done.
5. Each phase lists the **skills to load**. Those skills are already installed in your AI agent — load the named skill before starting that subsystem.

## Skills

The subsystem playbooks are installed directly in the AI agent, not stored in this folder. Available skills:

| Skill | Use when | Phases |
|-------|----------|--------|
| `monorepo-master` | Structuring/maintaining the pnpm + Turborepo + Gradle monorepo | 1, 4, 10 |
| `theme-and-styling-nativewind` | NativeWind, global styles, design tokens, theme management | 1, 6, 8 |
| `testing-quality` | Tests and linting across TypeScript and Kotlin | all |
| `kotlin-native-module` | Kotlin Android capabilities + Turbo Module bridge | 2, 3, 8 |
| `node-sdk-author` | Node SDK, Zod schemas, node packages, trace→workflow generator | 4, 5, 9 |
| `rn-ui-builder-zustand` | React Native UI, canvas, node editor, Zustand state | 6, 8 |
| `ai-agent-builder` | Agent loop, tools, memory, replanning, structured output | 7, 8, 9 |
| `prompt-engine` | Prompt templates, context assembly, output parsing | 7, 8, 9 |
| `mcp-server` | Exposing device tools over MCP to external agents | 10 |
