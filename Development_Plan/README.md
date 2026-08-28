# Mobile Automation Platform — Development Plan

An n8n-style **mobile automation platform** for Android: read the screen, perform gestures (click, swipe, long press, type), and drive any app through Accessibility, the device assistant, OCR, device APIs, and overlays.

The product is **two modes, one runtime**:

1. **Agent Mode** — a chat interface. Give it a goal in natural language ("Send Robert a WhatsApp message that I'll be late") and it plans, observes the screen, chooses tools, executes, and replans — **continuing to run while the user is inside another app**, reporting progress through a floating status overlay.
2. **Workflow Mode** — a visual, node-based builder with a smooth mobile canvas, logic nodes, an importable Node SDK published to npm, and its own workflow-building agent.

The two modes are **separate interfaces with separate settings, sessions, and memory**, chosen from a mode-switcher screen after onboarding. They share the Android tool runtime, the agent loop engine, the prompt engine, and the AI provider registry.

## Where the project stands

**Phases 0–9 are built and CI is green.** That work produced the monorepo, the Kotlin automation core, the native bridge, the node system, the workflow engine, a Skia canvas, the AI agent, the execution recorder, and a first Configure-with-AI overlay. `02_What_Was_Built.md` is the one-page record of it.

Device testing then found that **the engines largely work and the product around them does not.** The UI is a placeholder that never matched the intended design, the agent stops the moment the user leaves the app, the overlay crashes, and the canvas is close to unusable. `03_Issue_Register.md` records every confirmed defect.

**So this plan is no longer organised by phases.** It is organised as **numbered steps** that rebuild the product surface on top of the engines that already exist, fix what device testing found, and add what was missing — the mode-based shell, the permission onboarding flow, background execution, an OCR perception layer, and per-node screen tooling.

## Folder map

```
Development_Plan/
├── README.md                    ← you are here
├── 00_Overview.md               ← vision, the two modes, scope, glossary
├── 01_Roadmap.md                ← the step sequence, dependencies, milestones
├── 02_What_Was_Built.md         ← what phases 0–9 produced (historical note)
├── 03_Issue_Register.md         ← every confirmed bug and gap, with IDs
├── architecture/
│   ├── System_Architecture.md    ← two modes, one runtime; perception chain
│   ├── Monorepo_Structure.md
│   └── Data_Models.md
├── decisions/                    ← ADRs 0001–0014
├── conventions/
│   ├── Coding_Conventions.md
│   ├── Permission_Model.md
│   └── Versions_And_Targets.md
└── steps/
    ├── Step_01_App_Shell_And_Onboarding.md
    ├── Step_02_Permission_Engine.md
    ├── Step_03_Background_Execution_And_Agent_Overlay.md
    ├── Step_04_Agent_Mode.md
    ├── Step_05_OCR_And_Perception_Chain.md
    ├── Step_06_Workflow_Mode_Shell.md
    ├── Step_07_Canvas_Rebuild.md
    ├── Step_08_Node_Editor_And_Palette.md
    ├── Step_09_Node_Toolset_Overlay.md
    ├── Step_10_Workflow_Builder_Agent.md
    ├── Step_11_Generation_And_Recorder_Quality.md
    ├── Step_12_MCP_And_Node_Distribution.md
    └── Step_13_Device_Verification_And_Hardening.md
```

## How to use this plan

1. Read `00_Overview.md` for the product shape and vocabulary — especially the two-mode model, which is new and which the current code does not implement.
2. Read `03_Issue_Register.md`. Every step references the issue IDs it closes, and no step is done while one of its issues survives.
3. Read `architecture/` for how the pieces fit, `decisions/` for why the stack is what it is, and `conventions/` for code style, the permission model, and version targets.
4. Work the steps in `steps/` in order. Each has a goal, what is wrong today, deliverables, tasks, and a definition of done.
5. Each step lists the **skills to load**. Those skills are installed in your AI agent — load the named skill before starting that piece of work.
6. `tracking.md` at the repo root is the living record. Append to it as each step completes; never rewrite its history.

## Tech stack (decided, unchanged)

| Layer | Technology |
| --- | --- |
| Product UI | React Native + TypeScript |
| Android automation core | Kotlin |
| Native bridge | Turbo Modules / JSI |
| Workflow definition | TypeScript + Zod |
| AI agent runtime | TypeScript |
| Canvas | Skia + Reanimated + Gesture Handler |
| UI state | Zustand |
| Styling | NativeWind + centralized theme |
| Local DB | SQLite / Room |
| OCR | Android on-device text recognition (Kotlin), exposed as a tool and a node |
| Node SDK / packages | TypeScript, published to npm |
| MCP server | TypeScript |
| API | OpenAI-compatible Chat Completions |
| Monorepo | pnpm + Turborepo |
| Lint / format | ESLint + Prettier + ktlint |
| Testing | Vitest/Jest + JUnit + Android instrumentation |
| CI/CD | GitHub Actions |

**Core principle, unchanged:** React Native is the product layer; Kotlin is the Android OS-integration layer. Never push deep automation into React Native.

## Skills

Installed in the AI agent, not stored here. Load the matching skill before starting that subsystem.

| Skill | Use when | Steps |
| --- | --- | --- |
| `monorepo-master` | Adding packages, build/CI wiring, npm publishing | 5, 12 |
| `theme-and-styling-nativewind` | Theme tokens, NativeWind, any themed UI | 1, 4, 6, 7, 8, 9 |
| `testing-quality` | Tests and linting across TypeScript and Kotlin | all |
| `kotlin-native-module` | Kotlin capabilities + Turbo Module bridge | 2, 3, 5, 9 |
| `node-sdk-author` | Node SDK, schemas, node packages, trace→workflow generator | 5, 8, 11, 12 |
| `rn-ui-builder-zustand` | RN screens, canvas, node editor, Zustand state | 1, 4, 6, 7, 8, 9, 10 |
| `ai-agent-builder` | Agent loop, tools, memory, replanning, structured output | 4, 9, 10, 11 |
| `prompt-engine` | Prompt templates, context assembly, output parsing | 4, 5, 9, 10, 11 |
| `mcp-server` | Exposing device tools over MCP | 12 |
