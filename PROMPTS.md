# PROMPTS.md

Every string this product sends to a model, verbatim, and the exact request it goes in.

This is a reference, not an explanation. Where a prompt is quoted, it is copied character-for-character from the source — if the two ever disagree, the source is right and this file is stale. Each section names the file the text lives in.

---

## 0. What this used to say, and why it was wrong

The previous version of this document described a request shape that has been replaced. Recording the old shape here rather than deleting it, because the mistakes were not small and are worth being able to recognise.

**Every call carried exactly two messages: one `system`, one `user`.** The user message was a generated document containing the goal, the plan, the whole tool list as prose, a flattened history of every step, a budget line, and the entire UI tree. That produced five distinct defects:

| What was wrong                                             | Consequence                                                                                                                                                                       |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An assistant turn was never recorded                       | The model could not see its own actions. From its point of view every turn was its first, and what it had done arrived second-hand as prose someone else had written about it.    |
| `tool_calls` was dropped by the request mapper             | Even had the loop recorded an assistant turn, the field was silently discarded on the way out. This is the root cause — the wire layer was **incapable** of sending the protocol. |
| The first call used a different system prompt and no tools | Planning was a separate toolless request whose reply was parsed as `{"steps":[...]}`. The agent the user's first request met was not the agent that carried it out.               |
| The screen was injected every turn                         | The model never chose when to look, and the request grew without bound.                                                                                                           |
| The tool list was sent twice                               | Once as prose, once as real function schemas. Only the schemas were ever callable; the prose copy was resent on every turn.                                                       |

The current shape is `[system, ...conversation]` with tools on every call.

---

## 1. The five prompt jobs

| Job                     | System prompt                | Sent when                                                                               |
| ----------------------- | ---------------------------- | --------------------------------------------------------------------------------------- |
| **Agent turn**          | `AGENT_SYSTEM_PROMPT`        | Every iteration of the agent loop                                                       |
| **Node config**         | `NODE_CONFIG_SYSTEM_PROMPT`  | User taps "Configure with AI" in the node toolset overlay                               |
| **Workflow generation** | `GENERATION_SYSTEM_PROMPT`   | Compiling a recorded trace into a workflow                                              |
| **Vision lookup**       | `VISION_SYSTEM_PROMPT`       | Selector chain rung 8 — every structural strategy **and** OCR failed                    |
| **Plan** (legacy)       | inline in `buildPlanContext` | The "Create by AI" workflow entry point only. **No longer used by the agent** — see §4. |

The agent turn is the one that matters, and it is the only one that is a real multi-turn conversation. The other three are single-shot: one system message, one user message, no tools, JSON expected back.

Request settings (`packages/ai-agent/src/provider.ts`):

- `temperature: 0` (`DEFAULT_TEMPERATURE`)
- `timeoutMs: 60_000` (`DEFAULT_REQUEST_TIMEOUT_MS`)
- `tool_choice: 'auto'` on agent turns; tools omitted entirely on the other jobs
- `Authorization: Bearer <key>` — read at request time from the Android Keystore, never held in JS state
- **`reasoning` is not sent back** by default (`SEND_REASONING_BY_DEFAULT = false`)

---

## 2. The agent request, in full

### 2.1 The message array

```
[0] system     ← AGENT_SYSTEM_PROMPT, byte-identical on every call
[1] user       ← exactly what the user typed, nothing added
[2] assistant  ← content + tool_calls, recorded verbatim
[3] tool       ← answers tool_calls[0].id
[4] tool       ← answers tool_calls[1].id, if there was one
[5] assistant
[6] tool
...
```

Turn one is `[system, user]` and nothing else. Turn two is `[system, user, assistant, tool]`. It grows by one assistant turn plus its answers per iteration.

### 2.2 The one rule a provider enforces

**Every `tool_call` must be answered by a `tool` message bearing its id, before the next request.** A provider given an assistant message with an unanswered call rejects the **whole request**, not the message.

That single constraint explains most of the loop's shape:

- A **rejected** tool call is answered with the correction, as a `tool` message. Injecting the correction as a `user` message would leave the model's own call unanswered and invalidate the next request.
- A **refused** call — the second device call in one turn — is answered with an explanation rather than dropped.
- A run ending mid-turn calls `answerAnyUnanswered`, because an unanswered call would break the _next_ run's first request rather than this one.
- Replay from storage drops any assistant turn whose answers are incomplete, and any orphaned `tool` message.

### 2.3 The wire body

Built by `buildRequestBody` in `packages/ai-agent/src/provider.ts`:

```json
{
  "model": "gpt-4o-mini",
  "temperature": 0,
  "messages": [
    { "role": "system", "content": "<role>\nYou are an automation agent..." },
    { "role": "user", "content": "send Robert a WhatsApp message that I'll be late" },
    {
      "role": "assistant",
      "content": null,
      "tool_calls": [
        {
          "id": "call_abc",
          "type": "function",
          "function": { "name": "getUiTree", "arguments": "{\"compact\":true}" }
        }
      ]
    },
    {
      "role": "tool",
      "content": "{\"schemaVersion\":2,\"packageName\":\"com.whatsapp\",\"nodeCount\":38,\"root\":{...}}",
      "tool_call_id": "call_abc"
    }
  ],
  "tools": [
    /* every enabled device tool, plus createPlan and updatePlan */
  ],
  "tool_choice": "auto"
}
```

Four details in that body are deliberate:

- **`content: null`** on an assistant turn that only called a tool. An empty string reads to some providers as an empty reply rather than an absent one.
- **`arguments` is the original string**, never re-serialized. A round trip through `JSON.parse`/`JSON.stringify` is not guaranteed byte-identical, and some providers match the assistant turn against the tool results answering it.
- **The call id is the provider's own**, replayed unchanged.
- **`type: "function"`** is stated explicitly rather than left implicit.

---

## 3. AGENT_SYSTEM_PROMPT — verbatim

Source: `packages/prompt-engine/src/agent-context.ts`. **Nothing is interpolated into it**, and it is byte-identical on every call including the first.

That invariant is load-bearing twice over. A prompt that varies between turns is a different agent each turn, which makes behaviour impossible to reason about. And every provider's prompt caching keys on a stable prefix — a changing system message pays full price on all forty calls of a long run.

```text
<role>
You are an automation agent operating a real Android phone that belongs to a real person. You act only by calling the tools you are given. You cannot see the phone at all except by calling a tool that reads it.
</role>

<how_to_work>
- Nothing about the phone is given to you. Call getUiTree to see what is on screen before you act on it.
- Take one action at a time and read the screen again to check what changed before choosing the next.
- After an action that opens or loads a screen, use waitForElement for something you expect rather than reading immediately.
- If a step fails, read the screen again before deciding what to do. Usually the screen was not what you expected, rather than the action being wrong.
- Never invent an element you have not seen in a screen reading. If what you need is not there, look for it: scroll, search, or go back.
- Work efficiently. Every tool call costs the user time, and a run has a limited number of steps.
</how_to_work>

<planning>
For a goal that takes several steps, call createPlan first with the steps you intend to take. It is what the user sees, so write steps a person would recognise: "open WhatsApp", "search for the contact".
- Do not plan a single action, and do not plan a question. Just do it or answer it.
- Use as few steps as the goal needs. Three to six is usual. Never pad a short task to look thorough.
- Call updatePlan when the approach changes, so what the user is watching stays true.
- Do not include a step for reporting back. Answering happens at the end of every run.
</planning>

<identifying_elements>
Identify a target with a selector, preferring the most durable option available:
1. resourceId — survives layout and language changes.
2. contentDescription — stable and meaningful.
3. text — breaks if the app is translated or the label changes.
4. coordinates — a last resort. Only when nothing above identifies the element.
</identifying_elements>

<seeing_the_screen>
There are three ways to see a screen, in order of cost. Start at the top and only descend when the one above genuinely fails.
1. getUiTree — the element hierarchy. Free, fast, and the only source that gives durable selectors. This is almost always enough.
2. OCR — runOcr to read every line of text with a tappable point, or findTextOnScreen to look for one string. On-device and free, but slower, and it reads pixels: it can misread characters, and it cannot see a control that has no text. Use it when the hierarchy comes back empty or does not describe what the user can plainly see.
3. takeScreenshot, then reasoning about the image. Slowest, and it costs the user money. Only when the first two have both failed on this screen.
Do not skip to OCR or a screenshot because a hierarchy looks unfamiliar. Read it first. If OCR returns an approximate match, check the text it actually read before acting on it.
</seeing_the_screen>

<finishing>
- When the goal is achieved, stop calling tools and say what you did.
- If the goal only asks a question about the phone, read what you need and answer it. Answering is a complete response; do not invent actions to justify the turn.
- If the goal cannot be achieved, stop and say why. Never guess at a destructive alternative.
</finishing>

<safety>
This is someone's real device, with their messages, contacts, and money on it. Prefer doing nothing to doing the wrong thing. If an action would be hard to undo and you are not certain it is what was asked for, stop and explain instead.
</safety>
```

### 3.1 What it had to absorb

Three things the per-turn injection used to do implicitly now have to be said once, here:

- **How to see the screen.** Nothing arrives unasked, so the prompt states that reading is a tool call. This is strictly better than injection: the model chooses when to look, and a step needing no screen costs nothing.
- **How to plan.** `createPlan`/`updatePlan`, not a JSON reply.
- **That a budget exists.** It cannot be a per-turn number in a stable prompt, so the prompt says to work efficiently and the loop enforces the ceiling.

### 3.2 Why tags, not markdown headings

Screen content is arbitrary text from a third-party app. A UI tree containing a text node reading `## Goal` is indistinguishable from a prompt's own heading, so a heading is not a delimiter. A tag pair has an explicit end.

That reasoning applied more strongly when the tree was pasted into the request. It still applies to tool results, which carry the same arbitrary content.

---

## 4. Planning — a tool, not a prompt

### 4.1 There is no planning request any more

Planning used to be its own model call: a different system prompt, no tool array, and a reply parsed as `{"steps":[...]}`. It is now `createPlan` and `updatePlan`, ordinary tool calls in the same conversation, defined in `packages/ai-agent/src/planningTools.ts`.

Three problems went with it. The first call stopped looking different from the rest. A plan stopped costing a round trip before anything could happen — the model can plan and act in the same turn. And asking for JSON in `content` while tools are attached stopped inviting the model to do both or neither.

The **decision** to plan is also no longer the loop's. `decidePlanning` in `planning.ts` still exists and is still tested, but the model now judges from the `<planning>` section of the system prompt, which says not to plan a single action or a question.

### 4.2 The tool definitions, verbatim

Sent in the `tools` array on every agent request, after the device tools.

```text
createPlan: Record the steps you intend to take, before you start. Use this for a goal that needs several actions; do not use it for a single action or a question. The user sees these steps, so write ones a person would recognise ("open WhatsApp", "search for the contact") rather than tool names. Three to six steps is usual.

updatePlan: Replace the plan when the approach has changed, so what the user is watching stays true. Give the full list of steps, not just the changed one, and say briefly why it changed.
```

Their JSON Schema:

```json
{
  "name": "createPlan",
  "parameters": {
    "type": "object",
    "properties": {
      "steps": {
        "type": "array",
        "items": { "type": "string" },
        "description": "The steps, in order."
      }
    },
    "required": ["steps"],
    "additionalProperties": false
  }
}
```

```json
{
  "name": "updatePlan",
  "parameters": {
    "type": "object",
    "properties": {
      "steps": {
        "type": "array",
        "items": { "type": "string" },
        "description": "The complete new list of steps, in order."
      },
      "reason": {
        "type": "string",
        "description": "Why the plan changed, in one short phrase. Shown to the user."
      }
    },
    "required": ["steps", "reason"],
    "additionalProperties": false
  }
}
```

`updatePlan` replaces the list wholesale rather than patching it, because a model asked to amend step 3 of a plan it wrote two turns ago gets it wrong often enough to matter. Its `reason` is required: it is what the user reads when the plan they were watching changes underneath them.

### 4.3 The answers

Every planning call is answered, like any other. Exact strings:

| Situation             | Answer                                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `createPlan` accepted | `Plan recorded with 4 steps. Start on the first one.`                                                                              |
| `updatePlan` accepted | `Plan updated to 3 steps.`                                                                                                         |
| Arguments invalid     | `The arguments for "createPlan" were not valid: steps - Array must contain at least 1 element(s). Correct them and call it again.` |
| Arguments not JSON    | `The arguments for "createPlan" were not valid JSON. Send them again as a single JSON object.`                                     |

### 4.4 Why they are not device tools

They never reach `invokeTool`, and they are deliberately **absent from `tool-sdk`'s `TOOL_NAMES`**. There is nothing to dispatch — a plan is state the loop holds and the UI renders — but the reason that matters is MCP: `allToolDefinitions()` is what the MCP server publishes to external agents, and an external agent driving this phone has its own planning. Offering it ours would let it write into a UI it cannot see. Keeping these in `ai-agent` means they cannot leak into that list by accident.

### 4.5 The legacy plan prompt

`buildPlanContext` in `generation-context.ts` still exists, for the "Create by AI" workflow builder entry point — a different job with no device loop. It is **not** used by the agent. Verbatim:

```text
<role>
You plan automation tasks on an Android phone. Given a goal, list the steps needed.
</role>

<output>
Return only a JSON object of the form { "steps": ["...", "..."] }. No explanation, no markdown fences.
</output>

<rules>
- One action a person would recognise per step: "open WhatsApp", "search for the contact", "type the message".
- As few steps as the goal genuinely needs. Three to six is usual. Never pad a short task to look thorough.
- Do not name tools, and do not invent screen details you cannot know yet — the phone will be read before each step.
- Do not include a step for reporting back. Answering the user happens at the end of every run.
</rules>
```

---

## 5. Tool results — what the model reads back

The only channel through which anything about the phone reaches the model. Built by `answerDeviceCall` in `packages/ai-agent/src/loop.ts`.

| Outcome                      | `tool` message content                                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Success with a value         | The result as compact JSON: `{"nodeCount":38,"root":{...}}`                                                                                                                |
| Success with no value        | `Done.`                                                                                                                                                                    |
| Failure with a code          | `Failed (element_not_found): no match for text "Robert"`                                                                                                                   |
| Failure with no code         | `Failed: the tool failed`                                                                                                                                                  |
| Rejected by validation       | The correction — see §8                                                                                                                                                    |
| Second device call in a turn | `Not run. Only one device action happens per turn, because the next one depends on what this one changed. Read the screen and call it again if it is still what you want.` |
| Run ended mid-turn           | `Not run: the run ended.`                                                                                                                                                  |

The error **code** is included deliberately: the difference between `element_not_found` and a permission failure decides whether trying again can possibly help, and that is the model's judgement to make.

### 5.1 Screenshots carry the image

`takeScreenshot` is the one tool whose useful output is pixels, so its answer is a multi-part content array:

```json
{
  "role": "tool",
  "tool_call_id": "call_shot",
  "content": [
    {
      "type": "text",
      "text": "Screenshot of the current screen. {\"filePath\":\"/data/user/0/com.mobileautomation/files/captures/3.png\",\"widthPx\":1080,\"heightPx\":2400}"
    },
    {
      "type": "image_url",
      "image_url": { "url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...", "detail": "auto" }
    }
  ]
}
```

Base64 in a `data:` URL, not a path: a provider cannot fetch `file://` off someone's phone. Answering with a path would tell the model an image exists somewhere it cannot reach, which is worse than saying capture failed — it invites a confident guess about content nobody has seen.

The text part comes **first**, and it names what the image is. A model handed a bare image in a tool result has to infer which call it answers.

The bytes cross the bridge through `AutomationModule.readScreenshotBase64`, the only method allowed to move image data. It is confined to the capture directory by canonical-path comparison, because the path arrives from JS and a module that reads any path given is an arbitrary file read inside the app's own sandbox.

Two fallbacks, both answering with the metadata as plain text instead:

- **No reader supplied.** A caller whose model has no vision support should not pay to send megabytes it cannot use.
- **The file cannot be read.** The capture worked, so this is not a failed step.

---

## 6. The tool array

Sent on **every** request, including the first. Built as `[...toolsForRequest(allowedTools), ...planningToolsForRequest()]`.

Each entry is a real function schema:

```json
{
  "type": "function",
  "function": {
    "name": "click",
    "description": "Tap an element on screen. Describe the element with a selector rather than coordinates: prefer resourceId, then contentDescription or text. Returns: Nothing. The tap either succeeds or the call fails with element_not_found.",
    "parameters": { "type": "object", "properties": { "selector": { "type": "object", ... } }, "required": ["selector"] }
  }
}
```

The description is `"<description> Returns: <returns>"` from `packages/tool-sdk/src/definitions.ts`. **The prose copy that used to be pasted into the user message is gone** — it was the same information twice, and only the schemas were ever callable.

When the user switches a tool off on the tools page, it is absent from this array. That is what makes the toggle mean something: a disabled tool is never advertised, rather than being offered and then refused, which reads as the agent malfunctioning.

Descriptions, verbatim, in the order the model sees them:

```text
- click: Tap an element on screen. Describe the element with a selector rather than coordinates: prefer resourceId, then contentDescription or text.
- longPress: Press and hold an element, for context menus and multi-select. Use click for an ordinary tap.
- swipe: Scroll the screen. The direction is where the content moves, so "down" reveals what is further down a list.
- typeText: Type into a text field. The field must be identified by a selector; tap it first if it is not already focused.
- findElement: Check whether an element is on screen right now and get its details. Use waitForElement if the screen may still be loading.
- waitForElement: Wait for an element to appear, up to a timeout. Use this after any action that loads a new screen, rather than reading the screen immediately.
- getUiTree: Read every element currently on screen. Use this to understand an unfamiliar screen; prefer findElement when you already know what you are looking for.
- takeScreenshot: Capture the screen as an image. Only useful when the element hierarchy is not enough - for example a canvas or an image-only screen. Requires the user to have granted screen capture. If it fails, fall back to getUiTree rather than giving up: the element hierarchy is available even when images are not.
- runOcr: Read the text on screen by recognising it in an image, with a box and a tappable point for each line. Use this only when getUiTree does not describe the screen - a game, a canvas, or an app that draws its own interface. It is slower than reading the hierarchy and its results cannot be reused as durable selectors, so it is a fallback rather than an alternative.
- findTextOnScreen: Find a specific piece of text on screen and get a point you can tap. Use this when you know what a control says but getUiTree does not list it. Matching tolerates small misreadings, since recognising text from an image is not exact - check the returned text is what you expected before acting on it.
- pressBack: Press the system back button, to leave a screen or dismiss a dialog.
- pressHome: Go to the home screen. This leaves the current app; use pressBack to go up one screen instead.
- openApp: Bring an app to the foreground by its exact package name, such as com.whatsapp. Use openAppByName if you only know the app’s visible name.
- openAppByName: Open the app whose visible name best matches what you supply, such as "WhatsApp".
- listApps: List the apps installed on the device. Use this when you are unsure whether an app is present or what its package name is.
- getCurrentScreen: Find out which app and screen is in the foreground. Use this to confirm an app actually opened before acting.
- getContacts: List the user’s contacts. Prefer findContacts when you are looking for someone specific.
- findContacts: Search the user’s contacts by name or number.
- createAlarm: Create an alarm in the device clock app at a given time.
- readClipboard: Read the clipboard. May legitimately return nothing, since Android only allows clipboard reads while this app has focus.
- writeClipboard: Put text on the clipboard, so it can be pasted into an app.
- sendNotification: Post a notification on the device. Use this to tell the user something, not to message another person.
- launchIntent: Send an Android intent, for actions no other tool covers - opening a URL, starting a dial, sharing content. Prefer a specific tool when one exists.
- getSystemSetting: Read a system setting value, such as the screen brightness or timeout.
- controlMedia: Control whatever is currently playing audio or video - play, pause, skip.
- adjustVolume: Nudge the media volume one step up or down.
- sendSms: Send a text message. This sends it immediately - it does not open a messaging app for the user to confirm. Use findContacts first if you have a name rather than a number.
- readSms: Read recent text messages, newest first. Use this to find a verification code or see what someone said. Pass fromNumber to read one conversation.
- placeCall: Call a phone number. If the user has not allowed calling, this opens the dialer with the number filled in instead - check the returned outcome before telling the user the call was made.
- endCall: Hang up the call in progress. Needs Android 9 or later.
- setSystemSetting: Change a device setting: screen brightness, brightness mode, screen timeout, or auto-rotate. Only those four can be changed. Brightness is 0-255, and setting it has no lasting effect while screen_brightness_mode is 1 (automatic) - set the mode to 0 first.
- setRingerMode: Set the phone to normal, vibrate, or silent. Silent and vibrate need Do Not Disturb access; returning to normal never does.
```

Ordering is deliberate and tested: `runOcr` and `findTextOnScreen` sit immediately after `takeScreenshot` rather than at the end, because the list order is what the model reads and grouping the three ways of seeing a screen together is what stops OCR being reached for first just because it was mentioned last.

---

## 7. Conversation history

A follow-up works by replaying the previous messages as **themselves**.

It used to work by describing them. `contextualGoal` pasted the transcript into the next goal as `Earlier in this conversation: User: … You: …`, and `seedEntriesFor` rebuilt synthetic memory entries from stored rows. Both are deleted. They were readable to a person and neither was the protocol — the model never saw an assistant message it had written.

`apps/mobile/src/features/agent/conversationStorage.ts` stores each real `PromptMessage` under a `wire` role, with the exact message in `detail.wire`. The transcript rows the UI renders stay separate, and that separation is the point: a `tool` row's text is a readable summary ("Tapped Send") while the model was sent the JSON result. Rebuilding from the row would replay a conversation that never happened, and silently lose the `tool_call_id` links.

Two rules on load:

- **An assistant turn whose answers are incomplete is dropped**, along with any answers it did receive. A killed run or a window cut can easily produce that state, and replaying half an exchange makes the next request invalid before the user has done anything. An orphaned `tool` message is dropped for the same reason in the other direction.
- **Images are not replayed.** A screenshot's base64 is often over a megabyte, the provider charges for it on every subsequent request, and a screen from an earlier run is stale by definition. The text part survives, so the model still knows a screenshot was taken and what it showed.

The window is 60 messages, filtered by role **in SQL**. Filtering afterwards would mean something different on every session, because the table interleaves transcript rows with wire rows.

---

## 8. Rejections and corrections

A tool call that fails validation is answered with one of three messages from `packages/tool-sdk/src/validation.ts`, as a `tool` message.

**Unknown tool** — the real list is included, which turns a dead end into a correctable mistake:

```text
There is no tool called "tapButton". Available tools: click, longPress, swipe, typeText, findElement, waitForElement, getUiTree, takeScreenshot, runOcr, findTextOnScreen, pressBack, pressHome, openApp, openAppByName, listApps, getCurrentScreen, getContacts, findContacts, createAlarm, readClipboard, writeClipboard, sendNotification, launchIntent, getSystemSetting, controlMedia, adjustVolume, sendSms, readSms, placeCall, endCall, setSystemSetting, setRingerMode.
```

**Malformed JSON:**

```text
The arguments for "click" were not valid JSON. Send the arguments again as a single valid JSON object.
```

**Invalid arguments:**

```text
The arguments for "click" were not valid: selector - selector needs at least one of resourceId, contentDescription, text, structuralPath, bounds, or coordinates. Correct them and call the tool again.
```

A rejected call **does not consume a step**: nothing touched the device, and charging the budget for a malformed call would let a confused model exhaust the run without ever acting. Three rejections in a row (`MAX_CONSECUTIVE_REJECTIONS`) ends the run.

Every argument schema is `.strict()`. A model inventing an extra field is misunderstanding the tool, and dropping it silently would hide that while doing something else.

---

## 9. Stalls, and the two remaining user messages

The loop adds a `user` message in exactly two situations. Both are cases where there is no outstanding tool call to answer, so a `tool` message would have nowhere to attach.

**A stall**, when `memory.claimReplan()` fires:

```text
This is not working: the same action has been attempted 3 times with no change. Try a different approach, and call updatePlan to say what it is.
```

The reason comes from `AgentMemory`, verbatim, from one of three detectors:

| Trigger                           | Threshold | Reason                                                      |
| --------------------------------- | --------- | ----------------------------------------------------------- |
| Same tool + identical arguments   | 3         | `the same action has been attempted N times with no change` |
| Steps without the screen changing | 6         | `N steps have been taken without leaving this screen`       |
| Consecutive failures              | 2         | `N steps in a row failed`                                   |

The loop **tells** the model rather than acting for it. It used to make its own planning call here — on every turn for as long as the condition persisted, because `isStuck()` keeps reporting until something moves. `claimReplan` fires once per _distinct_ reason and caps a run at `MAX_REPLANS` (2).

**An empty reply**, when the model returns neither a tool call nor prose:

```text
You replied with nothing. Either call a tool to continue, or say what you did and stop.
```

Two of those in a row (`MAX_EMPTY_TURNS`) fails the run. Previously an empty reply was read as a completed run, which is how a failure became a silent success with nothing to show for it.

---

## 10. What memory is still for

`AgentMemory` is no longer a prompt input. It survives for three consumers, none of which is the model's context:

- **Stall detection** — the three derived signals above. A model asked to spot its own loop from a transcript reliably does not.
- **The plan** — held for the UI, written by the planning tools.
- **The recorder** — `Observation` records the screen as it was before each action, which is what lets the generator pick a more durable selector than the agent used (ADR 0009).

`observe()` is called around a tool execution for exactly that reason, and **never** injected into a request. A turn with no device call reads nothing at all.

---

## 11. NODE_CONFIG_SYSTEM_PROMPT — verbatim

Single-shot. Sent when the user is standing on a real screen in another app with the node toolset overlay open. The output is applied **directly** to a node in their workflow, which is why the JSON-only rule is stated twice.

Source: `packages/prompt-engine/src/node-config-context.ts`.

```text
<role>
You configure a single node in a mobile automation workflow.
</role>

<input>
You are given the node in <node>, what the user asked for in <instruction>, the screen they are looking at in <screen>, and a JSON Schema in <schema>.
</input>

<output>
Return only a JSON object matching <schema>. No explanation, no markdown fences, no commentary.
</output>

<identifying_elements>
When the configuration identifies an element on screen:
- Use resourceId when the element has one. It survives app updates and language changes.
- Otherwise use contentDescription, then text.
- Include coordinates only when nothing else identifies the element, and never as the only clue if a better one exists.
- Take the values from <screen>. Never invent an id or a label that is not there.
</identifying_elements>

<when_it_does_not_fit>
If <instruction> cannot be expressed by this node's schema, return the closest valid configuration rather than an invalid one.
</when_it_does_not_fit>
```

Its user message **does** carry a screen, and legitimately: this is a one-shot request where the user has deliberately navigated somewhere and the whole point is to configure against what is in front of them. Block order is `<node>`, `<instruction>`, `<schema>`, `<tools>`, `<rejected_attempt>`, `<screen>` — the screen last, because recency weighs on attention.

```text
<node type="click" label="Tap Send">
What it does: Taps an element on screen
Current configuration:
{
  "selector": {}
}
</node>

<instruction>
tap the green send button at the bottom right
</instruction>

<schema>
{ "type": "object", "properties": { "selector": { "type": "object" } }, "required": ["selector"] }
</schema>

<screen app="com.whatsapp" activity="com.whatsapp.Conversation">
{"schemaVersion":2,"packageName":"com.whatsapp","nodeCount":142,"root":{...}}

<screenshot path="/data/user/0/com.mobileautomation/files/captures/7.png" />
</screen>
```

The UI tree is truncated at 6 000 tokens. On a failed validation the same prompt is resent with the model's own output and the specific problem; the last line is always `Return a corrected JSON object.`

```text
<rejected_attempt>
{"selector": {"colour": "green"}}

Problem: selector.colour - unrecognized key
Return a corrected JSON object.
</rejected_attempt>
```

---

## 12. GENERATION_SYSTEM_PROMPT — verbatim

Single-shot. Compiles a recorded trace into a workflow. Note that the **deterministic** generator in `packages/execution-recorder/src/generator.ts` needs no model at all — the trace already says what happened. This is the model-assisted path.

Source: `packages/prompt-engine/src/generation-context.ts`.

```text
<role>
You turn a recording of an automation run into a reusable workflow.
</role>

<input>
You are given the original goal in <goal>, the executed steps in <trace>, the node types you may use in <node_types>, and a JSON Schema in <schema>.
</input>

<output>
Return only a JSON object matching <schema>. No explanation, no markdown fences.
</output>

<how_to_build_it>
- One node per action that changed something: opening an app, tapping, typing, swiping.
- Collapse the steps that only looked at the screen. The recording needed them to decide what to do; the workflow does not need to repeat them.
- Keep waits. A waitForElement step is not an observation — it is what makes the workflow survive a slow load.
- Use the selector recorded for each step, not its coordinates. Coordinates break as soon as the app's layout changes.
- Turn values the user supplied into workflow variables, so the workflow can be reused with different values rather than being hardcoded to this one run.
- Connect the nodes in the order they ran, with one starting point.
- Give each node a short label describing what it does, not which tool it calls.
</how_to_build_it>
```

Two of those rules carry most of the value. **Collapse observation steps**, because a trace is dense with `getUiTree` calls the agent needed in order to decide — and now more so than ever, since it has to ask for every screen. Left in, they triple the node count and make the canvas unreadable. **Keep the waits**, because `waitForElement` looks like an observation but is load-bearing: removing it produces a workflow that works when replayed slowly and fails on a cold start.

The user message is `<goal>`, `<node_types>`, `<schema>`, `<rejected_attempt>`, `<trace>`:

```text
<trace steps="4">
1. openApp({"packageName":"com.whatsapp"}) on com.whatsapp
2. click({"coordinates":{"x":540,"y":1830}}) on com.whatsapp.Conversation
   resolved to {"resourceId":"com.whatsapp:id/search","contentDescription":"Search"} by resourceId
3. typeText({"text":"Robert","selector":{"resourceId":"com.whatsapp:id/search_input"}}) on com.whatsapp.Search
4. click({"selector":{"text":"Robert"}}) on com.whatsapp.Search [failed]
</trace>
```

The `resolved to … by …` line is the most important thing in the block, and it is stated separately from the arguments so the model can see that a tap the agent made by coordinates nonetheless resolved to an element with a resourceId. That substitution is what makes a generated workflow durable.

---

## 13. VISION_SYSTEM_PROMPT — verbatim

Single-shot. The last rung of the perception chain, reached only when every structural strategy **and** OCR have failed.

Source: `apps/mobile/src/features/agent/visionMatcher.ts`.

```text
<role>
You locate a described element in a screenshot of an Android phone.
</role>

<output>
Return only a JSON object. No explanation, no markdown fences.
{ "found": true, "left": 0, "top": 0, "right": 0, "bottom": 0, "confidence": 0.0, "description": "what you saw" }
Coordinates are pixels in the image you were given, with 0,0 at the top left.
</output>

<rules>
- If the element is not in the image, return { "found": false }. This is a correct and useful answer. Do not guess a location.
- Return the box around the element itself, not the region containing it. A box covering most of the screen is never right.
- confidence is how sure you are, 0 to 1. Be honest: a low number is more useful than a wrong high one.
</rules>
```

The `found: false` instruction is load-bearing. A model asked "where is X" always answers with coordinates, because that is the shape of the question — being told the negative is acceptable is what makes it possible at all.

The target description is built by `describeTarget`, from text and contentDescription only:

| Selector fields                      | Description sent                                               |
| ------------------------------------ | -------------------------------------------------------------- |
| `text: 'Continue'`                   | `the element labelled "Continue"`                              |
| `contentDescription: 'Send message'` | `the element described as "Send message"`                      |
| both                                 | `the element labelled "Continue", described as "Send message"` |
| neither                              | **no request is made**                                         |

A resourceId is never passed: an internal id does not appear on screen, and asking a model to find `com.whatsapp:id/send` in a picture invites it to invent a location.

Every returned box must pass all of these or it is treated as not found. **A tap at a negative coordinate is silently swallowed by the platform**, so without these checks the run reports success and nothing happened:

| Check                          | Rejects                                                  |
| ------------------------------ | -------------------------------------------------------- |
| Parses against the schema      | prose, malformed JSON                                    |
| `found === true`               | an honest negative                                       |
| All four edges present         | a partial box                                            |
| `right > left`, `bottom > top` | inverted or zero-area boxes                              |
| Entirely within the screenshot | negative or off-edge coordinates                         |
| Area ≤ 50 % of the screen      | "here is the whole screen", whose centre is a random tap |
| Both edges ≥ 8 px              | noise                                                    |

The model is asked for a **box** rather than a point precisely so these checks are possible. An omitted `confidence` defaults to 0.5, below the resolver's threshold, because an unstated confidence is not a confident answer.

---

## 14. Redaction

Before any value is serialized into a request, `redact()` walks it recursively and replaces the value of any key whose name contains one of these, after stripping `-`, `_` and spaces and lowercasing:

```text
apikey  api_key  authorization  token  password  secret  credential  bearer  privatekey  private_key
```

The replacement is the literal `[redacted]`. Structure is preserved, so the model still sees that a field existed — which matters when it is reasoning about a login screen.

---

## 15. Quick reference — model calls per run

| Situation                                 | Calls                                                 |
| ----------------------------------------- | ----------------------------------------------------- |
| `call 0000`, one action                   | **2** — one to call the tool, one to report           |
| `what is on the screen`                   | **2** — one `getUiTree`, one to answer                |
| A six-step task with a plan               | **~8** — planning shares a turn with the first action |
| A step whose call is malformed once       | **+1**, and no step consumed                          |
| A stall                                   | **+0** — the notice rides along with the next turn    |
| A screen resolved by OCR                  | **+0** — on-device and free                           |
| The same screen falling through to vision | **+1 per lookup**                                     |

Everything that is **not** a model call, deliberately: the stall detectors, `memory.summarise()`, OCR, and every text match.

Note the shape change. The old flow paid an up-front planning call and then one call per step; the new one has no separate planning call but the model must ask for each screen. For a task that needs to look before every action the totals are similar — the difference is that the model now decides when looking is worth it, and a step that needs no screen costs nothing.

---

## 16. Source files

| File                                                    | Contains                                               |
| ------------------------------------------------------- | ------------------------------------------------------ |
| `packages/prompt-engine/src/agent-context.ts`           | `AGENT_SYSTEM_PROMPT`, `buildAgentContext`             |
| `packages/prompt-engine/src/template.ts`                | `PromptMessage`, content parts, the message builders   |
| `packages/prompt-engine/src/node-config-context.ts`     | `NODE_CONFIG_SYSTEM_PROMPT`                            |
| `packages/prompt-engine/src/generation-context.ts`      | `GENERATION_SYSTEM_PROMPT`, `buildPlanContext`         |
| `packages/prompt-engine/src/redaction.ts`               | `REDACTED_KEYS`, `redact`, truncation                  |
| `packages/prompt-engine/src/parser.ts`                  | `parseStructured`, `parseWithRetry`                    |
| `packages/ai-agent/src/conversation.ts`                 | The ordered message list and the unanswered-call guard |
| `packages/ai-agent/src/planningTools.ts`                | `createPlan`, `updatePlan`, `applyPlanningCall`        |
| `packages/ai-agent/src/loop.ts`                         | The turn, tool answers, the stall notice               |
| `packages/ai-agent/src/provider.ts`                     | `buildRequestBody`, `parseCompletion`                  |
| `packages/ai-agent/src/memory.ts`                       | The stall detectors, the plan                          |
| `packages/tool-sdk/src/definitions.ts`                  | Every tool description the model reads                 |
| `packages/tool-sdk/src/validation.ts`                   | The three rejection messages, `toolsForRequest`        |
| `apps/mobile/src/features/agent/conversationStorage.ts` | Persisting and replaying the conversation              |
| `apps/mobile/src/features/agent/visionMatcher.ts`       | `VISION_SYSTEM_PROMPT` and the box checks              |
