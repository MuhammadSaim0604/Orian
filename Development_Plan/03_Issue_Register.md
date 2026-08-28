# 03 — Issue Register

Every confirmed defect and gap found by device testing, plus the design corrections that came with it. Each has a stable ID so steps can reference it and so "done" is checkable.

Severity: **S1** breaks a core promise ⬝ **S2** a feature is unusable ⬝ **S3** a real defect with a workaround ⬝ **S4** polish.

---

## A — Shell and navigation

### A1 — The app has no onboarding at all (S1)

It opens straight into a tabbed home screen. There is no welcome, no permission setup, and no mode choice. A user's first launch drops them into a builder with no permissions granted and nothing explained.

**Should be:** Welcome → permission setup → mode switcher. Closed by **Step 1**, **Step 2**.

### A2 — Tabbed shell instead of two modes (S1)

The home screen is a tab bar: Workflows, Agent, Runs, Screen inspector, Status, Provider. The product is two separate modes with separate interfaces, settings, sessions, and memory, reached from a mode switcher.

**Should be:** the mode switcher replaces the tab bar; each mode owns its own navigation. Closed by **Step 1**, **Step 4**, **Step 6**.

### A3 — The Status tab should not exist (S3)

It exposes internal phase status to the user. Automation state belongs in each mode's settings, not on a tab of its own.

**Should be:** deleted; the useful parts move into mode settings. Closed by **Step 1**.

### A4 — The Screen Inspector tab should not exist (S2)

Worse than useless: run from inside the app, it reads _our own_ screen, because the app being inspected is the one in the foreground. Screen inspection only means anything from an overlay, standing on the target app.

**Should be:** deleted as a tab. Its capability lives in the per-node toolset overlay. Closed by **Step 1**, **Step 9**.

### A5 — The Provider tab is in the wrong place (S3)

Provider configuration is a root-level concern shared by both modes, and each mode also needs its own settings screen.

**Should be:** a provider registry in root settings, reachable from both modes' settings. Each mode's settings ends with _switch mode_ and _back to switcher_. Closed by **Step 1**, **Step 4**, **Step 6**.

### A6 — No loading state when opening a workflow (S3)

Opening a saved workflow jumps straight to the canvas, so the registry build, document parse, and validation all happen with nothing on screen.

**Should be:** a real loading screen that names what it is doing. Closed by **Step 6**.

---

## B — Agent Mode

### B1 — The agent dies the moment the user leaves the app (S1)

The most serious defect in the product. The agent correctly reads the screen, builds a task list, and starts executing — then opens the target app, our app goes to background, and the loop stops. Returning to the app resumes it. An automation tool that cannot act while another app is in front is not an automation tool.

**Should be:** a foreground service keeps the loop alive; a floating status overlay shows progress and a stop button. Closed by **Step 3**.

### B2 — No agent status overlay (S1)

There is no way to see or stop a running agent from outside the app.

**Should be:** a right-edge vertical container showing the current task with a stop button, expanding on tap into a compact chat that shows tool calls and reasoning and accepts input, wired to the same session. Closed by **Step 3**.

### B3 — No chat sessions or per-session memory (S2)

Agent Mode is a single text box. There is no session list, no history, and memory does not persist across runs.

**Should be:** a sidebar of sessions, each with its own memory and context. Closed by **Step 4**.

### B4 — No tools management page (S2)

The user cannot see which tools exist, cannot enable or disable one, and cannot grant a tool's permission from where the tool is named.

**Should be:** every tool listed with a toggle; toggling requests the permission if needed; per-tool status and information. Closed by **Step 4**, **Step 2**.

### B5 — No MCP client support (S3)

The plan always had us exposing an MCP server. It did not account for **connecting** external MCP servers and merging their tools into the agent's tool set.

**Should be:** MCP clients configurable in Agent Mode, contributed tools listed alongside built-ins. Closed by **Step 12**.

### B6 — Single provider only, models typed by hand (S3)

One base URL, one model string. No provider list and no model discovery.

**Should be:** a provider registry with models fetched from `/models`. Closed by **Step 4**.

---

## C — Workflow canvas and node editing

### C1 — Node text does not render (S1)

Nodes draw as plain white rectangles with no label. The canvas is unusable because nothing identifies any node.

**Should be:** every node shows its label and type, legibly at every zoom level. Closed by **Step 7**.

### C2 — Drag and selection fight each other (S1)

Dragging a node often opens its settings instead of moving it. Movement feels stuck. Sometimes a node returns to its dragged position after the settings sheet closes, meaning the position was committed but the canvas never repainted.

**Should be:** a tap selects, a drag moves, and the two never both fire. Position commits once, visibly. Closed by **Step 7**.

### C3 — No zoom controls (S2)

Pinch is the only way to zoom. On a phone that is awkward and imprecise, and there is no way to reset the view.

**Should be:** on-screen zoom in / zoom out / fit-to-view controls alongside pinch. Closed by **Step 7**.

### C4 — No search in the add-step dialog (S2)

The palette is a flat categorised list. With 28 node types and third-party packages to come, it is unusable without a search box.

**Should be:** search by name, description, and category. Closed by **Step 8**.

### C5 — Configure-with-AI crashes the app (S1)

Tapping it in any node's settings crashes. The overlay concept is right and the schema pipeline is tested, but the window wiring fails on a real device.

**Should be:** opens a floating toolset over other apps, or explains exactly why it cannot. Closed by **Step 9**.

### C6 — Toolset offered on nodes that cannot use it (S3)

Every node shows a Configure-with-AI button, including nodes with nothing on screen to target.

**Should be:** the button appears only on screen-targeting nodes — click, long press, swipe, type, wait-for-element, screen conditions, OCR. Closed by **Step 9**.

---

## D — Create-with-AI

### D1 — No feedback while generating (S2)

Submitting a prompt turns the button into "thinking" and shows nothing else, then jumps to the canvas seconds later. The user cannot tell whether anything is happening.

**Should be:** a chat interface showing progress, with its own session sidebar. Closed by **Step 10**.

### D2 — Generated workflows are broken (S1)

What lands on the canvas is "full of errors": nodes whose configs do not satisfy their own schemas, or a graph that does not run. Generation validates the document but evidently not well enough to be useful.

**Should be:** a generated workflow either loads valid and runnable, or is rejected with a plain explanation and a retry. Closed by **Step 10**, **Step 11**.

### D3 — Create-with-AI is not an agent (S2)

It is a single completion call. The plan calls for a workflow-building agent with sessions, memory, and its own tools — sharing the loop engine with Agent Mode but isolated from it.

**Should be:** a real agent loop with a chat interface and isolated sessions and tools. Closed by **Step 10**.

---

## E — Permissions

### E1 — Screen capture reports "not enabled" after being granted (S1)

Tapping _Allow Screen Capture_ shows the Android recording dialog, the user allows it, and the app still reports the capability as disabled. Either the consent result is not being stored or the status read is wrong.

**Should be:** granting consent immediately reflects as enabled, and it survives until revoked or the session ends. Closed by **Step 2**.

### E2 — No permission onboarding, and required vs optional is not distinguished (S1)

Permissions are requested ad hoc with no explanation of which are essential.

**Should be:** an onboarding screen for the **required** ones — default assistant, accessibility, display over other apps, usage access, notifications — which the user must grant to continue, then optional ones (contacts, phone, SMS…) they may grant now or skip. Closed by **Step 2**.

### E3 — Default assistant and usage access are not requested at all (S2)

The plan never included them. Assistant role gives more precise screen reading; usage access gives reliable foreground-app detection.

**Should be:** both in the required set, each with a rationale and a settings route. Closed by **Step 2**.

### E4 — Optional permissions have no just-in-time path (S2)

Adding a contacts node, or enabling a contacts tool, does not request contacts.

**Should be:** a node needing a permission requests it when added or first run; a tool requests it when toggled on. Closed by **Step 2**.

---

## F — Perception

### F1 — No OCR, so some screens are invisible (S1)

Some apps expose almost nothing through Accessibility. Today the agent has no fallback, so those screens simply cannot be automated.

**Should be:** an on-device OCR engine returning recognised text with bounding boxes, exposed as an agent tool and a workflow node, sitting between the tree and vision in the perception chain. Closed by **Step 5**.

### F2 — Vision fallback still unwired (S2)

`SelectorResolver` defaults to `UnavailableVisionMatcher`, so the chain reports "vision was not attempted" and stops at coordinates. Carried over from earlier phases.

**Should be:** the final fallback works — screenshot to a vision-capable model, which names coordinates. Closed by **Step 5**.

---

## G — Carried over from earlier phases

| ID | Issue | Severity | Closed by |
| --- | --- | --- | --- |
| **G1** | No workflow has ever run end to end on a device | S1 | Step 13 |
| **G2** | Canvas frame rate never measured on hardware | S2 | Step 7, Step 13 |
| **G3** | Agent has never completed the WhatsApp scenario on a device | S1 | Step 13 |
| **G4** | No screenshot captured per recorded step | S3 | Step 11 |
| **G5** | Room persistence never verified across a restart | S2 | Step 13 |
| **G6** | Release APK is debug-signed; signing secrets unset | S3 | Step 13 |
| **G7** | Nothing catches a stale TypeScript copy of the UI-tree attribute list | S3 | Step 5 |
| **G8** | `NODE_TO_TOOL` and `TOOL_TO_NODE` have no parity test | S3 | Step 11 |

---

## Issue-to-step index

| Step | Closes |
| --- | --- |
| 1 — App shell & onboarding | A1, A2, A3, A4, A5 |
| 2 — Permission engine | E1, E2, E3, E4, B4 (permission half) |
| 3 — Background execution & agent overlay | B1, B2 |
| 4 — Agent Mode | B3, B4, B6, A5 (agent half) |
| 5 — OCR & perception chain | F1, F2, G7 |
| 6 — Workflow Mode shell | A6, A5 (workflow half) |
| 7 — Canvas rebuild | C1, C2, C3, G2 |
| 8 — Node editor & palette | C4 |
| 9 — Node toolset overlay | C5, C6, A4 (capability half) |
| 10 — Workflow builder agent | D1, D2, D3 |
| 11 — Generation & recorder quality | D2, G4, G8 |
| 12 — MCP & node distribution | B5 |
| 13 — Device verification & hardening | G1, G3, G5, G6 |
