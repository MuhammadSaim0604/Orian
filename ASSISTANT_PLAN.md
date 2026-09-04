# Assistant powers, capability routing, and voice mode — plan

Status: **draft for review.** Nothing here is implemented yet.

Four things, in dependency order. Each one needs the one before it.

1. **Capability routing** — one place that decides _how_ a job gets done from what is granted, with real fallbacks.
2. **Assistant powers** — put the digital-assistant role to work as a provider inside that routing.
3. **Voice mode** — "Orion Assist": gesture or wake word, its own overlay, its own prompt, speaks back.
4. **Markdown rendering** — in the chat and in the assistant panel, from one renderer.

---

## 1. What the assistant role actually gives us

Read out of the platform API surface, not guessed. Four usable powers:

| Power                                          | API                                                             | What it replaces                                                                                                                           |
| ---------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Screenshot with no consent dialog**          | `VoiceInteractionSession.onHandleScreenshot(Bitmap)`            | MediaProjection: per-session consent, the recording indicator, and the API 34+ `SecurityException`                                         |
| **A second way to read the screen**            | `onHandleAssist` → `AssistStructure.ViewNode`                   | Nothing today. Gives `getHtmlInfo()` and `getWebDomain()` for WebViews, plus `getAutofillHints()`, `getInputType()`, `getHint()` on fields |
| **A system window with no overlay permission** | `showSession(args, flags)`                                      | `SYSTEM_ALERT_WINDOW`, for a transient panel                                                                                               |
| **Launch from anywhere**                       | Assist gesture — long-press home, long-press power, side button | Nothing today. The app can only be opened from its launcher icon                                                                           |

A fifth exists but cannot be relied on: **Direct Actions** (`requestDirectActions` / `performDirectAction`, API 29+) let the foreground app be driven without touching its UI. Almost no app implements it. Worth a probe, worth nothing as a plan.

### What it does not give

Stated because the plan is wrong if any of this is assumed:

- **No actions.** `AssistStructure` is read-only. Tapping, typing and swiping stay with the accessibility service. The assistant role adds a way to _see_, never a way to _act_.
- **The user can switch it off.** Assist settings has a "Use screen context" toggle. Off means `AssistStructure` and the screenshot both arrive null, while the app still holds the role. So a granted capability is not a working capability — the router has to treat a null result as a provider failure, not as an empty screen.
- **`FLAG_SECURE` still applies.** Banking and payment screens stay blank on this path too.
- **`showSession` may disturb the foreground app.** It creates a window; focus loss or a visible flicker is possible, and it would happen exactly while the agent is working. Must be measured on device before this becomes the overlay's primary provider.

### The wake word: what is honestly possible

`VoiceInteractionService.createAlwaysOnHotwordDetector` exists and is only available to the current assistant — which is a real reason to hold the role. But it detects a keyphrase **enrolled in the device's DSP**, and enrollment is vendor-controlled. For a custom phrase like "Hey Orion" the expected state is `STATE_KEYPHRASE_UNENROLLED` on essentially every device.

So the plan is:

- **Primary trigger: the assist gesture.** Instant, zero battery, works over any app, and available _only_ because we hold the assistant role. This is the honest version of "Hey Orion" on Android.
- **Optional trigger: a software wake word**, opt-in, running inside the foreground service we already keep alive. Costs `RECORD_AUDIO` and battery, so it is off by default and the user turns it on knowing the cost.
- `createAlwaysOnHotwordDetector` is still probed at startup and used if a device really does offer it. `backgroundProbe.ts` is the precedent: measure the assumption rather than believe it.

---

## 2. The problem with what we have now

`TOOL_CAPABILITY` in `apps/mobile/src/features/permissions/toolCapabilities.ts` maps each tool to **exactly one** capability:

```ts
takeScreenshot: 'screen_capture',
getUiTree: 'accessibility',
```

That was correct when there was one way to do each job. It is now wrong in a specific way: a screenshot can come from the assistant role _or_ MediaProjection, and a one-to-one map cannot express that. With it in place, a user who has granted the assistant role but not screen recording is told the screenshot tool is unavailable — which is false.

The same shape of problem exists for the overlay, for reading the screen, and for foreground-app detection.

---

## 3. Capability routing

The fix is to stop mapping tools to permissions, and map **tools to jobs** and **jobs to an ordered chain of providers**.

```
tool  ─→  job  ─→  [provider, provider, provider]
                      each provider needs one capability
```

A provider is chosen at call time by walking the chain and taking the first one that is both **granted** and **working**. Three rules:

- **Never cached.** Permission state is read live. This is already a project rule and it matters more here: the assistant's screen-context toggle can change between two steps of one run.
- **A provider that returns nothing is a failed provider, not an empty result.** The chain continues. This is the null-`AssistStructure` case, and getting it wrong means the agent concludes the screen is empty when it simply was not given one.
- **The chain stops at honesty.** When every provider is unavailable the tool fails with a message naming _which_ permission would fix it — not "the tool failed".

### The jobs

| Job                  | Providers, best first                                                             | Why this order                                                                                                                                                                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readScreen`         | 1. accessibility tree<br>2. assist structure<br>3. OCR<br>4. vision               | Accessibility is first because it is the only source that yields **actionable** nodes and real selectors, and it is needed for the action that follows anyway. Assist structure is a genuine second source rather than a degraded one — it is better on WebViews — but it is read-only and needs a session show. |
| `screenshot`         | 1. assist screenshot<br>2. MediaProjection                                        | **Reversed from today.** The assistant path has no consent dialog, no recording indicator, and no API 34 foreground-service requirement. MediaProjection becomes the fallback it should always have been.                                                                                                        |
| `showTransientPanel` | 1. assistant session<br>2. `SYSTEM_ALERT_WINDOW`<br>3. in-app modal               | For the voice panel, which appears and goes. The assistant session is free of the overlay permission.                                                                                                                                                                                                            |
| `showRunOverlay`     | 1. `SYSTEM_ALERT_WINDOW`<br>2. assistant session<br>3. in-app only                | **Deliberately the opposite order.** The agent status strip must survive for the length of a run across app switches; an assistant session is transient and the system may dismiss it. Two jobs rather than one parameterised job, because the correct order genuinely differs.                                  |
| `foregroundApp`      | 1. usage access<br>2. assist structure activity<br>3. accessibility last event    | Usage access is authoritative. The accessibility reading is the package an event last came from, which goes stale the moment events stop — last, not first.                                                                                                                                                      |
| `launchFromAnywhere` | 1. assist gesture<br>2. notification action<br>3. launcher icon                   | Not a tool. It is how the user reaches the app, and the top rung exists only with the assistant role.                                                                                                                                                                                                            |
| `wakeWord`           | 1. `AlwaysOnHotwordDetector`<br>2. software wake word (opt-in)<br>3. gesture only | Expected to land on 3 on most devices. Stated as a chain so the code does not have to be rewritten when a device does support it.                                                                                                                                                                                |

### Where it lives

The runtime half must be Kotlin, because the dispatch it feeds is Kotlin. `android/tools` already owns `CapabilityRegistry`, so the router goes beside it:

```
android/tools/…/CapabilityRouter.kt      job → ordered providers, live grant reads
android/tools/…/ProviderChain.kt         the walk, and the "null means failed" rule
```

**`android/tools` must not depend on `:assistant` or `:overlays`.** It holds providers as lambdas or small interfaces registered from outside — exactly the trick `OverlayExclusivity` uses to arbitrate between two overlay managers it cannot see. `:automation` wires the real implementations in, since it already depends on everything.

The TS half is a read-only view for the UI:

```
apps/mobile/src/features/permissions/jobRouting.ts    TOOL_JOB, the chains, for rendering
apps/mobile/src/features/permissions/useJobStatus.ts  live per-job provider state
```

`TOOL_CAPABILITY` is replaced by `TOOL_JOB`. The two must not coexist — a tool whose permission is described in two places will eventually be described differently in each.

---

## 4. The tools page: fallback buttons

What you asked for, and it falls out of the routing above rather than being special-cased.

Today a tool's toggle is off and disabled when its one permission is missing. With chains, a row has three states:

| State                                        | Row shows                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Best provider granted                        | Toggle on, no badge                                                                                                 |
| Best provider missing, a fallback is granted | **A small fallback button before the toggle.** Tapping it enables the tool and marks the row `via screen recording` |
| Nothing granted                              | Toggle off and disabled, with the grant that would fix it                                                           |

The badge names the provider in the user's words, not the capability id — `via screen recording`, `via assistant`. A user who sees `screen_capture` learns nothing.

Two details that decide whether this feels right:

- **The fallback button is an explicit tap, not automatic.** A tool that silently switched to a slower or noisier path would make the agent's behaviour change for reasons the user cannot see. The MediaProjection fallback in particular starts a visible recording indicator — that is the user's decision to make.
- **The choice is remembered per tool.** Stored beside `disabledTools` in `agentSettings.ts`, as an explicit "use the fallback" set rather than a copy of which provider was chosen. Storing the provider would go stale the moment the user grants the better permission.

The group cards stay grouped by capability, but a tool now appears under the group of the provider **currently in use**, so the page reflects reality rather than an intended design.

---

## 5. Voice mode — "Orion Assist"

A second agent, not a second engine. `runAgent` already takes its tools and prompts as inputs (ADR 0014), which is exactly the seam for this.

### What it is

|           | Agent Mode                          | Orion Assist                                                |
| --------- | ----------------------------------- | ----------------------------------------------------------- |
| Opened by | Launcher, then a chat               | Assist gesture, or wake word                                |
| Session   | Persisted, has an id, has history   | **None.** Free-standing, nothing written to `chat_sessions` |
| Prompt    | `AGENT_SYSTEM_PROMPT`               | `ASSISTANT_SYSTEM_PROMPT` — new                             |
| Tools     | Full set, subject to the tools page | Same set, same toggles                                      |
| Reply     | Text in a chat bubble               | Text **and speech**                                         |
| Lives in  | The app                             | An overlay over whatever app is in front                    |

The no-session rule is the part with consequences. Each invocation builds a `Conversation`, uses it, and drops it. Nothing to load, nothing to save, no sidebar entry. That is deliberate: a voice question about the screen in front of you is not a thread anyone will come back to, and mixing it into the chat list would bury the conversations that matter.

Within one invocation it is still a real conversation — the user can follow up, and the message array behaves exactly as it now does in Agent Mode.

### Its prompt is a different prompt

Agent Mode's prompt is written for **execution**: plan, act one step at a time, confirm, stop. Voice is mostly the opposite — someone asking about the screen in front of them and wanting an answer, out loud, now.

`ASSISTANT_SYSTEM_PROMPT` in `packages/prompt-engine` differs in four ways, and each is a real behaviour change rather than a tone change:

- **Answering is the default, acting is the exception.** "What does this say?" should produce one `getUiTree` and a reply, never a plan.
- **Never plan.** No `createPlan` in its tool array at all. A plan card is meaningless in a panel that is about to close, and voice makes a spoken plan actively annoying.
- **Written to be spoken.** Short sentences, no markdown in the spoken part, no lists read aloud. This has to be in the prompt because a model asked a question about a screen will happily return a bulleted table.
- **Confirm before anything destructive.** The user is not looking at a confirmation screen and may not be looking at the phone at all. Anything that sends, deletes or pays gets asked out loud first.

Both prompts keep the same tag structure and the same selector rules, because those are about the device and not about the mode.

### How it opens

Removing one line from `AutomationVoiceInteractionSessionService`. `onShow` currently calls `hide()` immediately — correct when there was nothing to show, wrong now:

```
Assist gesture
  → onShow(args, SHOW_WITH_ASSIST or SHOW_WITH_SCREENSHOT)
  → onHandleAssist / onHandleScreenshot cache what arrived
  → the session window hosts a fourth React root
```

A **fourth React root** in the same process, alongside app, node toolset, and agent status overlay. Same `ReactHost.createSurface` pattern, same store-only sharing. Nothing new architecturally, which is the reason to do it this way.

`OverlayExclusivity` has to arbitrate this too. Three floating things and a stop button between them is ambiguous, which is the reason that class exists.

### Speech

- **Out:** `TextToSpeech`, platform, no dependency. Speak the answer while showing it, and stop speaking the moment the panel closes — a voice continuing after dismissal is the single most irritating failure this feature can have.
- **In:** `SpeechRecognizer` with the _system's_ recogniser. Our own `AutomationRecognitionService` returns `ERROR_CLIENT` by design and must never be the one used — it exists only to satisfy manifest parsing.
- `RECORD_AUDIO` is requested **just in time**, on first use of voice input, never during onboarding. Someone who only ever uses the gesture and types should never be asked for the microphone.

### What it can and cannot do

Same tool runtime, same toggles, same permission routing — an agent with different prompts, not a different agent. Two deliberate limits:

- **No workflow building.** That is the builder agent's job and it has no device tools for good reason.
- **Nothing persisted.** Including traces: a spoken question is not a recording worth compiling into a workflow.

---

## 6. Markdown rendering

A real defect, not a polish item. Models reply in markdown by default, and the chat renders it as raw text — so `**Send**` appears with the asterisks, and a list arrives as one run-together paragraph. It makes correct answers look broken.

### One renderer, three places

`packages/ui/src/components/Markdown.tsx`, used by the chat bubble, the voice panel, and the node toolset overlay. In `ui` rather than in the app because the overlays are separate React roots — a renderer living in `features/agent` would have to be imported upward from an overlay, which the dependency rules forbid.

### Not a library

`react-native-markdown-display` is the obvious choice and I would rather not take it: unmaintained, pulls a full commonmark parser, and needs a style object per element that has to be rebuilt for our theme anyway. What actually appears in these replies is a small subset:

| Supported                            | Rendered as                             |
| ------------------------------------ | --------------------------------------- |
| `**bold**`, `*italic*`, `` `code` `` | Inline styles                           |
| ` ```fenced``` `                     | A monospace block with a copy action    |
| `- item`, `1. item`                  | An indented row with a bullet or number |
| `# heading`                          | Bold, one size up                       |
| `[text](url)`                        | A pressable that opens the link         |
| Paragraphs and line breaks           | Spacing                                 |

Deliberately **not** supported: tables, images, blockquotes, nested lists past one level, HTML. If a model sends one it renders as plain text rather than breaking — silently degrading beats a crash in a chat bubble.

The parser is a small tokeniser with its own tests. That is the part with bugs in it, and it should be testable without rendering anything.

### Two rules that matter more than the parser

- **Unclosed markers stay literal.** Streaming means a bubble is frequently mid-token: `**Sen` must render as `**Sen`, not silently swallow the asterisks and then reflow when the rest arrives. Every visible jump in a streaming reply is this bug.
- **The spoken text is not the rendered text.** TTS gets the markdown stripped — asterisks, backticks and bullet characters removed — because a voice reading "star star Send star star" is worse than no voice at all.

---

## 7. Order of work

Sequenced by dependency and by how much each one is worth on its own.

| #   | Work                                                                          | Depends on | Why here                                                                                                                             |
| --- | ----------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Capability routing** — `CapabilityRouter`, `TOOL_JOB`, the chains           | —          | Everything else is a provider inside it. Built first or it gets retrofitted around two features that each hardcoded their own path.  |
| 2   | **Assist screenshot** — `onHandleScreenshot`, first provider for `screenshot` | 1          | Biggest gain for least work: removes the consent dialog, the recording indicator, and the API 34 crash path.                         |
| 3   | **Markdown renderer**                                                         | —          | Independent, and it fixes a defect that is visible in every single reply. Could go first if you want something shippable sooner.     |
| 4   | **Tools page fallback buttons**                                               | 1          | Cheap once the chains exist. Makes the routing visible, which is what makes it trustworthy.                                          |
| 5   | **Assist gesture opens Orion Assist**                                         | 1, 3       | The panel needs the renderer. This is where it starts to feel like an assistant.                                                     |
| 6   | **Voice in and out**                                                          | 5          | TTS, `SpeechRecognizer`, just-in-time `RECORD_AUDIO`.                                                                                |
| 7   | **Assist structure as a `readScreen` provider**                               | 1          | Deliberately late. OCR already covers most of the gap this was meant to fill; the remaining win is WebView-heavy apps.               |
| 8   | **Wake word probe, then opt-in software wake word**                           | 6          | Last, and possibly never. Measure `AlwaysOnHotwordDetector` first — if it is unenrolled everywhere, the opt-in path is all there is. |

Steps 1–2 and 3 are independent of each other and could run in either order.

---

## 8. What I cannot verify without a device

Being explicit, because three of these could change the plan rather than just need a fix.

| Unknown                                                                                   | If it goes badly                                                                                                                                                |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does `showSession` disturb the foreground app — focus loss, flicker?                      | The assistant session drops below `SYSTEM_ALERT_WINDOW` for `showTransientPanel`, and step 5 needs the overlay permission after all                             |
| Is `onHandleScreenshot` given a full-resolution bitmap, or a scaled one?                  | A scaled bitmap needs the same `OcrScaling` treatment OCR already has, or taps land slightly wrong — the failure that reports success and presses the row above |
| Does the assist gesture reach us on OEM skins that hard-wire their own assistant?         | The gesture is not a reliable primary trigger and the notification action carries more weight                                                                   |
| Does `AlwaysOnHotwordDetector` report anything but `STATE_KEYPHRASE_UNENROLLED`?          | Confirms step 8 is opt-in software only                                                                                                                         |
| Does `AssistStructure` actually return more than the accessibility tree on a WebView app? | Step 7 is not worth doing                                                                                                                                       |

---

## 9. Decisions I want confirmed before starting

1. **Is `screenshot` reversing to assistant-first correct?** It removes the consent dialog and the recording indicator, which is a real privacy-visibility change — the user no longer sees an indicator while the agent looks at their screen. Better UX, arguably worse transparency.
2. **Does the assistant capability stay `REQUIRED` in onboarding?** It currently is, and until step 2 lands it gates onboarding on a permission that does nothing. Options: keep it required and do step 2 soon, or move it to `OPTIONAL` now and let the routing request it just in time.
3. **Wake word at all, given the above?** The honest version is the assist gesture. A software wake word is real battery cost for a phrase the DSP will not take.
4. **Should Orion Assist be able to act, or only answer?** Answering is safe and covers "what does this say". Acting from voice, with no screen being watched, is where a wrong tap does damage — the confirm-out-loud rule is my proposed mitigation but a read-only voice mode is also defensible.
5. **One markdown renderer for all three surfaces, hand-written?** Or accept the library for speed and style it.
