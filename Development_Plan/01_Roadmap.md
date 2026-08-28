# 01 — Roadmap

The plan is organised as **numbered steps**, not phases. Phases 0–9 built the engines; the steps rebuild the product on top of them, fix what device testing found, and add what was missing.

Every step has a file under `steps/` with goals, what is wrong today, deliverables, tasks, and a definition of done. Every step names the issue IDs from `03_Issue_Register.md` that it closes.

## Milestones

| Milestone | Steps | Outcome |
| --- | --- | --- |
| **M6 — A real app** | 1–3 | Welcome, permission onboarding, mode switcher; the agent survives leaving the app and reports through a floating overlay. |
| **M7 — Agent Mode** | 4–5 | Chat with sessions, provider registry, tools management; OCR completes the perception chain. |
| **M8 — Workflow Mode** | 6–9 | Mode shell, a canvas that actually works, searchable palette, per-node toolset overlay. |
| **M9 — Intelligence quality** | 10–11 | Workflow-building agent with sessions; generated workflows that load and run. |
| **M10 — Platform** | 12–13 | MCP server and clients, npm distribution, device verification, release signing. |

## Step sequence

```
Step 1   App shell & onboarding          welcome, mode switcher, root settings, delete dead tabs
Step 2   Permission engine               required vs optional, rationale, just-in-time, capability status
Step 3   Background execution            foreground service + agent status overlay
Step 4   Agent Mode                      chat sessions, provider registry, tools management
Step 5   OCR & perception chain          on-device OCR tool + node; wire the vision fallback
Step 6   Workflow Mode shell             workflow list, loading screen, mode settings
Step 7   Canvas rebuild                  node text, drag vs selection, zoom controls
Step 8   Node editor & palette           searchable palette, form fixes, permission-aware nodes
Step 9   Node toolset overlay            fix the crash, restrict to screen-targeting nodes
Step 10  Workflow builder agent          isolated sessions, chat UI, real loop
Step 11  Generation & recorder quality   valid generated workflows, per-step screenshots
Step 12  MCP server & clients            expose our tools; consume external MCP servers
Step 13  Device verification             the whole chain on hardware; signing; hardening
```

## Dependency graph

```
Step 1 ─→ Step 2 ─→ Step 3 ─→ Step 4 ─→ Step 5
   │                                      │
   └────→ Step 6 ─→ Step 7 ─→ Step 8 ─→ Step 9
                                          │
                              Step 10 ────┴─→ Step 11
                                                 │
                                    Step 12 ─────┴─→ Step 13
```

Why this order:

- **Step 1 first** because everything else needs somewhere to live. Building Agent Mode's chat before the mode shell exists means building it twice.
- **Step 2 before Step 3** because the foreground service and the overlay both depend on permissions the onboarding flow grants, and E1 (screen capture reporting wrong) will otherwise reappear as a mysterious failure inside the service.
- **Step 3 before Step 4** because B1 — the agent dying when the user leaves the app — makes Agent Mode untestable. There is no point polishing a chat interface whose agent cannot run.
- **Step 5 after Step 4** because OCR is a tool, and the tools-management page is where a tool becomes visible and controllable.
- **Steps 6–9 can start in parallel with 2–5** if two people are working; they share only the shell from Step 1. Sequentially, they follow.
- **Step 9 after Step 7 and Step 8** because the toolset overlay writes into the node editor, and fixing the overlay against a broken editor means fixing it twice.
- **Step 11 after Step 10** because D2 (broken generated workflows) may turn out to be a prompt problem, a schema problem, or both, and Step 10's chat interface is what makes the failure visible enough to diagnose.
- **Step 13 last** because device verification is only worth doing once the surface is stable; running it earlier means running it again.

## What is deliberately not being rebuilt

The engines are sound. Do not rewrite:

- `android/accessibility`, `gestures`, `screen`, `tools`, `automation` — the Kotlin core.
- `packages/native-automation` ↔ `android/bridge` — the typed bridge.
- `shared-types`, `workflow-schema`, `node-sdk`, `core-nodes`, `android-nodes` — the node system.
- `workflow-engine` — the DAG executor.
- `ai-agent`, `prompt-engine`, `tool-sdk` — the loop and prompts.
- `execution-recorder` — the recorder and generator.

Extend them where a step needs a new capability. The rebuild is the **product surface**: screens, navigation, canvas interaction, and the overlays.

## Cross-cutting workstreams

- **Testing** — unit and instrumentation alongside every step. A behavioural fix without a test is a fix that regresses.
- **Theming** — every new screen uses the centralized theme and NativeWind semantic classes. No raw colour values.
- **Permissions** — each step that touches a sensitive capability updates `conventions/Permission_Model.md`.
- **Device verification** — do not defer everything to Step 13. Each step that can be checked on hardware should be, and `tracking.md` records what was.
- **`tracking.md`** — append a section per completed step. Never rewrite its history.
