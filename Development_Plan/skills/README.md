# Skills

Self-contained, reusable playbooks for building each subsystem of the Mobile Automation Platform. Each skill states **when to use it**, the **principles** to follow, a **step-by-step procedure**, and a **checklist**. Load the one that matches the work you are doing; they map onto the phases in `../phases/`.

| Skill | Use when | Primary phases |
|-------|----------|----------------|
| [kotlin-native-module](kotlin-native-module/SKILL.md) | Building Kotlin Android capabilities and bridging them to React Native | 2, 3, 8 |
| [rn-ui-builder-zustand](rn-ui-builder-zustand/SKILL.md) | Building React Native screens/canvas with Zustand state | 6, 8 |
| [theme-and-styling-nativewind](theme-and-styling-nativewind/SKILL.md) | Setting up NativeWind, global styles, and theme management | 1, 6, 8 |
| [monorepo-master](monorepo-master/SKILL.md) | Structuring/maintaining the pnpm + Turborepo + Gradle monorepo | 1, 4, 10 |
| [ai-agent-builder](ai-agent-builder/SKILL.md) | Building the AI agent loop, tools, memory, replanning | 7, 8, 9 |
| [node-sdk-author](node-sdk-author/SKILL.md) | Authoring the node SDK, schemas, and node packages | 4, 5, 9 |
| [prompt-engine](prompt-engine/SKILL.md) | Building prompt templates, context assembly, structured output parsing | 7, 8, 9 |
| [mcp-server](mcp-server/SKILL.md) | Exposing device tools over MCP to external agents | 10 |
| [testing-quality](testing-quality/SKILL.md) | Setting up and writing tests + lint across TS and Kotlin | all |

## How a skill is written

Each file is written for a reader with **no memory of this conversation**. It should be actionable on its own: assume the reader knows the stack (see `../README.md`) but not the specifics of the task.
