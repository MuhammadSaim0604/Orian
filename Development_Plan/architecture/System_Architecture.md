# System Architecture

## Mental model

**Two modes, one runtime.** Agent Mode and Workflow Mode are separate products sharing a device layer, an agent loop, a prompt engine, and a provider registry. They share no UI, no navigation, no sessions, and no settings.

```
                        Mobile Automation Platform
                                   │
                         Welcome → Permissions
                                   │
                            Mode switcher ──────→ Root settings
                                   │                (providers, theme,
                  ┌────────────────┴────────────────┐   data, permissions)
                  │                                 │
            Agent Mode                       Workflow Mode
       chat · sessions · tools           workflows · canvas · builder agent
       MCP clients · overlay             node toolset overlay
                  │                                 │
         AI Agent Engine                    Workflow Engine
         loop · planner · memory            DAG · nodes · conditions
         tool selection                     loops · variables
                  │                                 │
                  └────────────────┬────────────────┘
                                   │
                     shared: agent loop engine, prompt engine,
                             provider registry, tool-sdk
                                   │
                          Automation Runtime
                                   │
        ┌──────────────┬───────────┴───────────┬──────────────┐
   Accessibility     Gestures              Screen + OCR    Android Tools
   UI tree,          click, swipe,         capture,        contacts, apps,
   selectors         long press, type      text recog.     alarms, intents,
                                                           clipboard…
        └──────────────┴───────────┬───────────┴──────────────┘
                                   │
                                 Kotlin
```

## Layered view

```
React Native (product layer)
│  Onboarding · Mode switcher · Root settings
│  Agent Mode:    chat · sessions · provider config · tools management · MCP clients
│  Workflow Mode: workflow list · canvas · node editor · builder agent · trace review
│  Overlay roots: agent status overlay · node toolset overlay
│
│  RN Turbo Modules / JSI   ← packages/native-automation is the only crossing
▼
Kotlin (Android OS integration layer)
├── AccessibilityService          ├── OCR engine
├── Gesture Engine                ├── Overlay Manager
├── Screen Capture                ├── Foreground Service
├── UI Tree Parser                ├── Permission registry
├── Android APIs                  └── Automation Runtime
└── Room storage
```

**Rule:** RN owns product and UI; Kotlin owns deep automation. Never implement automation in RN.

## Key architectural decisions

1. **Two modes, not two tabs.** Each mode is a whole interface with its own navigation stack, settings, sessions, and memory. A tab bar would force both into one navigation model and make "switch modes" meaningless. See ADR 0011.

2. **The agent loop runs in JavaScript, kept alive by a foreground service.** The service keeps the process alive; it does not become the agent. Reimplementing the loop in Kotlin would create a second agent that can disagree with the tested one. See ADR 0012.

3. **Perception is a fallback chain, not a single source.** Accessibility tree → OCR → vision, tried in that order, with the AI choosing how far to descend. The tree is fastest and richest; OCR is on-device and verifiable; vision is the last resort. See ADR 0013.

4. **Generic node system, Android nodes as a package.** Core node types (`Input, Action, Condition, Loop, Variable, Transform, Trigger`) are device-agnostic. Android capabilities, including OCR, live in `android-nodes`.

5. **Workflow definition independent of React Native.** A workflow is plain JSON (metadata, variables, nodes[], edges[]). Flow: `RN → Workflow JSON → Workflow Engine → Node Registry → Node Executor → Android Tool Runtime`.

6. **Two engines never merge.** The AI agent and the workflow engine stay separate but both call the identical Automation Runtime functions.

7. **One agent loop engine, several agents.** Agent Mode's agent and Workflow Mode's builder agent are the same `runAgent` with different tool sets, prompts, and sessions. The builder agent deliberately has **no device tools** — building a workflow is not performing it. See ADR 0014.

8. **Execution recording is a first-class subsystem.** It produces the traces workflow generation depends on.

9. **Robust selectors over coordinates.** Every recorded target keeps a priority chain with OCR and vision fallbacks.

10. **MCP is bidirectional.** We expose our tools as a server, and we consume external servers as a client whose tools merge into Agent Mode's tool set.

## The shared Automation Runtime

Both modes depend on one interface, dispatched by name through `invokeTool`. Every consumer — the agent, the workflow engine, the node toolset overlay, the MCP server — uses that same dispatch. There is no second path to the device.

```
click(selector)            swipe(from, to)          longPress(selector)
typeText(selector, text)   findElement(selector)    waitForElement(selector, timeout)
getUiTree()                takeScreenshot()         pressBack() / pressHome()
runOcr()                   findTextOnScreen(text)   getCurrentScreen()
openApp(package)           listApps()               getContacts()
createAlarm(config)        readClipboard()          writeClipboard()
sendNotification(cfg)      launchIntent(intent)     getSystemSetting(key)
controlMedia(cmd)          adjustVolume(dir)
```

The TS side sees typed wrappers via Turbo Modules; Kotlin implements them against Android APIs, the Accessibility layer, and the OCR engine.

## The perception chain

```
                    "find the Send button"
                             │
                   ┌─────────▼─────────┐
                   │ Accessibility tree│  fast · rich · durable selectors
                   └─────────┬─────────┘
                        found?│ no
                   ┌─────────▼─────────┐
                   │       OCR         │  on-device · text + bounding boxes
                   └─────────┬─────────┘
                        found?│ no
                   ┌─────────▼─────────┐
                   │  Vision (model)   │  screenshot → coordinates · costs money
                   └───────────────────┘
```

Selector priority for a resolved target:

```
resourceId → accessibility semantics → text/contentDescription
   → structural UI selector → relative position → OCR text → coordinates → vision
```

OCR sits above raw coordinates because a text match survives layout shifts and is checkable — the text either matches or it does not.

## AI agent loop

```
Goal → Plan → Observe → Choose Tool → Execute → Observe → Replan → … → Done
```

Perception is the chain above. Actions are Automation Runtime calls. The loop is driven by a Chat Completions provider through the prompt engine, and it **runs inside a foreground service** so it survives the user leaving the app. Progress surfaces through the agent status overlay.

## Workflow execution

```
Trigger → Node → Condition ──true─→ Node
                    └─false─→ Node
                 → Loop → Node → Done
```

The engine walks the DAG, resolves each node type against the Node Registry, and invokes the executor, which calls the Automation Runtime.

## The two overlays

Both are `WindowManager` windows hosting React content as second React roots, sharing state with the app only through the Zustand store modules both roots import.

```
Agent status overlay (Agent Mode)      Node toolset overlay (Workflow Mode)
├─ current task                        ├─ Current node    ├─ Element inspector
├─ stop                                ├─ Screen          ├─ Coordinate inspector
└─ expanded: tool calls, thinking,      ├─ UI tree         ├─ OCR
   input wired to the session          ├─ Screenshot      ├─ Test action
                                       └─ Available tools ├─ Ask AI
                                                          └─ eye toggle
```

A modal cannot do either job: it dies the moment the user switches to the app being automated, which is exactly when both are needed.

The node toolset is bound to a node id, so the AI always knows what it is configuring, and it returns a **structured config object** validated against that node's own Zod schema — never prose.

## Security & permissions

- `AccessibilityService`, `SYSTEM_ALERT_WINDOW`, assistant role, usage access, foreground service, screen capture, and contacts are high-trust. Each is requested with a rationale and gated behind explicit opt-in. See `conventions/Permission_Model.md`.
- OCR runs **on-device**. Screen content leaves the phone only for the provider the user configured, and only for a vision call they triggered.
- The MCP server exposes full device control: authentication mandatory, localhost by default, every call validated, destructive tools gated, and an audit log.
- AI provider keys live in the Android Keystore. They are never rendered, logged, placed in a prompt, or reachable over MCP.
