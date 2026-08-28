# kilo.md — Architect Review Orchestrator

You are **Kilo Code**, acting as the orchestrator of a four-stage architect review of the Mobile
Automation codebase. You do not perform the review yourself. You spawn sub-agents, give them
precise prompts, collect their written reports, and then act on the findings.

Your value in this task is dispatch and judgement, not analysis. Analysis is what the sub-agents
are for; keeping your own context free is what lets you read both reports at the end and fix what
they found.

---

## 1. What is being reviewed

Nine phases of implementation (Phase 0 through Phase 9) are complete and CI is green. Phase 10 is
not yet started and is **out of scope** for this review.

The purpose is to find, before Phase 10 begins:

- **Bugs** — logic errors, wrong argument order, unhandled null, off-by-one, incorrect type
  assumptions, race conditions, resource leaks.
- **UI issues** — unreachable controls, missing loading or error states, unlabelled interactive
  elements, layouts that break on small screens, state that survives when it should reset.
- **Hidden missing things** — a deliverable the plan required that was never implemented, a
  function that exists but is never called, an error branch that silently swallows a failure, a
  permission never requested, a schema field never validated.
- **Contract drift** — two sides of a duplicated contract that no longer agree.
- **Dead code** — exported symbols nobody imports.

The review is **read-only until Stage 4.** Sub-agents write reports. They do not change code.

---

## 2. Environment

```
Working directory: D:\websites\Mobile_Automation
Stack:             TypeScript (pnpm + Turborepo) + Kotlin (Gradle)
OS:                Windows — use cmd/PowerShell syntax, never bash loops
Git branch:        main
```

Authoritative plan: **`Development_Plan/`**. Structure:

```
Development_Plan/phases/Phase_00_Foundation.md … Phase_09_Execution_Recorder_And_Generation.md
Development_Plan/architecture/{System_Architecture,Data_Models,Monorepo_Structure}.md
Development_Plan/conventions/{Coding_Conventions,Permission_Model,Versions_And_Targets}.md
Development_Plan/decisions/0001-…0010-*.md          ← the ADRs
Development_Plan/{00_Overview,01_Roadmap}.md
```

Supporting context:

- **`tracking.md`** (repo root) — the living record of what each phase built, what was deliberately
  deferred, and every trap already hit. Sub-agents should read the relevant phase section, but must
  treat it as a **claim to verify against the code**, not as evidence. A report that only restates
  `tracking.md` is worthless.
- **`ORION.md`** (repo root) — architecture summary and cross-cutting rules.
- **`plan_in_user_words/`** — background only. Do not review against it.

**Never touch `.orion/`.** Do not read, list, or edit it.

**Never build an APK locally.** No `gradlew assemble*`, no `react-native run-android`. CI owns that
(ADR 0010).

---

## 3. Non-negotiable rules for every sub-agent

Put all five in every prompt you write. They are the difference between a useful report and a
plausible-sounding one.

1. **Never read test files.** No `*.test.ts`, `*.test.tsx`, `__tests__/`, `src/test/`,
   `src/androidTest/`, `*Test.kt`. A passing test proves nothing about whether the code is right,
   and reading tests lets a reviewer absorb the author's assumptions instead of checking them. Read
   only production source.
2. **Read the plan before the code.** The phase file, plus any ADR and architecture document it
   references. A finding is only meaningful relative to what was required.
3. **Verify, do not assume.** Never describe a function you have not read. If a claim cannot be
   checked by reading the source, say so explicitly rather than guessing.
4. **Do not modify anything.** The only file a sub-agent writes is its own report.
5. **Reports go in `Architect_review/`.** Never the repo root.

---

## 4. The four stages

### Stage 1 — Per-phase deep review

**Ten sub-agents in total — Phases 0 through 9 — spawned strictly one at a time.** Each reviews
exactly one phase and **appends** its section to
`Architect_review/1st_stage_architect_review.md`.

One sub-agent per phase rather than one for all ten, deliberately: a single agent carrying ten
phases of detail would exhaust its context and produce a thorough report for Phase 0 and a thin one
for Phase 9 — the opposite of what is wanted, since the later phases are the largest. A fresh agent
per phase reads its plan file with full attention.

**Never spawn more than one at a time.** The loop is:

1. Spawn the sub-agent for phase _N_ with the prompt in §6.
2. **Wait for it to finish.** Do nothing else while it runs.
3. Read the section it appended and check it against §10's quality bar.
4. If the section is inadequate, re-spawn that same phase with a prompt saying what was missing.
   Do not proceed past a weak section.
5. Only then spawn phase _N+1_.

Two independent reasons this must be sequential, both of which produce a silently corrupted review
rather than a visible error:

- **They share one output file.** Two agents appending concurrently interleave their sections or
  clobber each other, and the damage is only discovered at Stage 2, which reads that file as its
  map.
- **Each section must be checked before the next begins.** A weak Phase 4 section is much cheaper to
  re-run immediately than after five more phases have been written past it.

Do not batch, do not run two "small" phases together, and do not start Phase _N+1_ while Phase _N_
is still writing. Ten sequential runs is the intended cost of this stage.

Before spawning the first, create the folder and the file header:

```
Architect_review/1st_stage_architect_review.md
```

Track progress explicitly as you go — a numbered list of the ten phases, marking each done only once
its section has been written and checked. The review will span many turns, and the plan is what
tells you which phase is next after a context compaction.

### Stage 2 — Cross-phase connection review

**One fresh sub-agent**, spawned only after all ten Stage 1 sections exist and have been checked. It
reads the completed Stage 1 report as its map, then examines the **seams**: whether what one phase
exports is what the next phase actually calls, with the arguments and types it actually expects.

Writes `Architect_review/2nd_stage_architect_review.md`.

This stage exists because Stage 1 cannot find integration faults. A per-phase reviewer sees a
function that is correct in isolation; only a cross-phase reviewer sees that its one caller passes
the arguments in the wrong order.

### Stage 3 — Your own triage

You read both reports yourself. Classify every finding, discard what is wrong, and produce a fix
plan. Details in §8.

### Stage 4 — Fixes

You apply the fixes, verify with the project's real commands, and commit. Details in §9.

---

## 5. Which code belongs to which phase

Give the relevant rows to each Stage 1 sub-agent so it does not have to guess its own scope. Paths
are workspace-relative. **Exclude every test path.**

| Phase                           | Plan file                                       | Code to review                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0** Foundation                | `Phase_00_Foundation.md`                        | `Development_Plan/` itself (is it internally consistent?), `Development_Plan/decisions/*`, `IMPORTANT_RULES.txt`, `README.md`. Judge completeness and contradictions, not code.                                                                                                                                                                                                                                                                                                          |
| **1** Monorepo & tooling        | `Phase_01_Monorepo_Tooling.md`                  | `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `eslint.config.mjs`, `prettier.config.mjs`, `vitest.config.ts`, `.github/workflows/*.yml`, `packages/ui/src/theme/**`, `packages/ui/tailwind.preset.cjs`, `apps/mobile/src/global.css`, `apps/mobile/tailwind.config.js`, `apps/mobile/babel.config.js`, `apps/mobile/metro.config.js`, every `packages/*/package.json`                                                                                       |
| **2** Android automation core   | `Phase_02_Android_Automation_Core.md`           | `android/accessibility/src/main/**`, `android/gestures/src/main/**`, `android/screen/src/main/**`, `android/tools/src/main/**`, `android/automation/src/main/**`, and each module's `build.gradle.kts` + `AndroidManifest.xml`                                                                                                                                                                                                                                                           |
| **3** Native bridge             | `Phase_03_Native_Bridge.md`                     | `packages/native-automation/src/{index,automation,events,errors,tools,types,NativeAutomation*}.ts`, `android/bridge/src/main/**`, `apps/mobile/android/app/src/main/kotlin/com/mobileautomation/bridge/**`, `apps/mobile/android/app/src/main/kotlin/com/mobileautomation/MainApplication.kt`, `MainActivity.kt`, `apps/mobile/android/app/src/main/AndroidManifest.xml`, `apps/mobile/src/features/automation/**`                                                                       |
| **4** Node SDK & schema         | `Phase_04_Node_SDK_And_Schema.md`               | `packages/shared-types/src/**`, `packages/workflow-schema/src/**`, `packages/node-sdk/src/**`, `packages/core-nodes/src/**`, `packages/android-nodes/src/**`, `packages/node-sdk/AUTHORING.md`                                                                                                                                                                                                                                                                                           |
| **5** Workflow engine           | `Phase_05_Workflow_Engine.md`                   | `packages/workflow-engine/src/**`                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **6** Workflow builder UI       | `Phase_06_Workflow_Builder_UI.md`               | `apps/mobile/src/features/canvas/**`, `node-editor/**`, `workflows/**`, `inspector/**`, `shell/**`, `home/**`, `apps/mobile/src/App.tsx`, `apps/mobile/index.js`, `packages/ui/src/components/**`, `packages/node-sdk/src/introspection.ts`, `packages/screen-inspector/src/**`, `android/storage/src/main/kotlin/**/{AutomationDatabase,WorkflowDao,WorkflowEntity,WorkflowDocumentReader,WorkflowStore}.kt`, `apps/mobile/android/app/src/main/kotlin/com/mobileautomation/storage/**` |
| **7** AI agent engine           | `Phase_07_AI_Agent_Engine.md`                   | `packages/ai-agent/src/**`, `packages/prompt-engine/src/**`, `packages/tool-sdk/src/**`, `apps/mobile/src/features/agent/**`, `apps/mobile/android/app/src/main/kotlin/com/mobileautomation/settings/**`                                                                                                                                                                                                                                                                                 |
| **8** Configure-with-AI overlay | `Phase_08_Configure_With_AI_Overlay.md`         | `android/overlays/src/main/**`, `apps/mobile/android/app/src/main/kotlin/com/mobileautomation/overlay/**`, `packages/native-automation/src/overlay.ts`, `apps/mobile/src/features/overlay/**`, `apps/mobile/src/overlay/OverlayRoot.tsx`                                                                                                                                                                                                                                                 |
| **9** Recorder & generation     | `Phase_09_Execution_Recorder_And_Generation.md` | `packages/execution-recorder/src/**`, `apps/mobile/src/features/recorder/**`, `android/storage/src/main/kotlin/**/{TraceEntity,TraceDao,TraceScreenshotStore}.kt` and the trace half of `WorkflowStore.kt`                                                                                                                                                                                                                                                                               |

Scale: roughly 77 TypeScript files under `packages/`, 44 under `apps/mobile/src/`, and 73 Kotlin
files under `android/`, excluding tests.

---

## 6. Stage 1 sub-agent prompt

Use this verbatim, substituting the bracketed values per phase. Spawn it for **one phase only** —
this prompt describes a single phase's review, and an agent given two would do neither properly.

> You are performing a read-only architect review of **Phase [N] — [phase name]** of the Mobile
> Automation codebase. Working directory `D:\websites\Mobile_Automation`. Windows shell.
>
> **Your scope is Phase [N] and nothing else.** Other phases are being reviewed separately by other
> agents. If you find yourself reading a file outside the list below, stop — either it belongs to
> another phase's review, or the scope list needs correcting and you should say so rather than
> quietly widening it.
>
> **Rules — all five are absolute:**
>
> 1. **Never open a test file.** No `*.test.ts`, `*.test.tsx`, `__tests__/`, `src/test/`,
>    `src/androidTest/`, `*Test.kt`. Read production source only. A passing test is not evidence
>    the code is correct, and reading tests would make you absorb the author's assumptions instead
>    of checking them.
> 2. **Read the plan first:** `Development_Plan/phases/[phase file]`, plus every ADR and
>    architecture document it references. You are reviewing the code _against_ that plan.
> 3. **Never describe code you have not read.** If something cannot be verified by reading the
>    source, write "unverifiable by reading" and say what would settle it. Do not guess at a
>    signature or a behaviour.
> 4. **Change nothing.** The only file you write is the report.
> 5. Never read, list, or modify `.orion/`. Never run a Gradle assemble or an APK build.
>
> **Files in scope:**
>
> ```
> [paste the phase's rows from the table]
> ```
>
> **Context you may read but must not trust:** the Phase [N] section of `tracking.md` states what
> the implementer believes they built. Treat every claim in it as a hypothesis to check against the
> code. Where the code and `tracking.md` disagree, that disagreement is itself a finding.
>
> **Your task:** read every in-scope file completely and produce an exhaustive technical record,
> then a findings list.
>
> For **every file**, document:
>
> - Its path and one sentence on its responsibility.
> - Every exported function, class, type, constant, and React component.
> - For each function: the **exact parameter types**, the **exact return type**, whether it is
>   async, what it throws or rejects with, and every early-return or error branch.
> - For each class: its constructor parameters, public members, and mutable state.
> - For each React component: its props with types, which stores or hooks it reads, what it renders
>   conditionally, and which of its interactive elements have accessibility labels.
> - Every import, so the next stage can build a call graph.
> - Side effects: file writes, network calls, native module calls, database access, timers,
>   subscriptions — and whether each is cleaned up.
>
> Then produce **findings**, each with a severity:
>
> - `CRITICAL` — will produce wrong behaviour, data loss, a crash, or a security hole.
> - `HIGH` — a plan deliverable is missing, or a failure is silently swallowed.
> - `MEDIUM` — a real defect with a bounded blast radius; a missing UI state; a leak.
> - `LOW` — dead code, an inconsistency, a misleading name or comment.
>
> Every finding must carry: `file:line`, what the code does, what it should do, why it matters, and
> the concrete fix. **A finding without a file and line number is not a finding.**
>
> Look specifically for:
>
> - Arguments passed in the wrong order, or a type that is wider than the callee assumes.
> - `null` / `undefined` reached without a guard; a non-null assertion that is not actually safe.
> - `catch` blocks that discard an error the caller needed.
> - `async` work whose result nobody awaits; a promise rejection with no handler.
> - Subscriptions, listeners, coroutine scopes, or native resources never released.
> - State that persists across a context change where it should have reset (and the reverse).
> - Off-by-one and boundary errors in loops, slices, and coordinate maths.
> - A plan deliverable with no implementation, or an implementation with no caller.
> - UI: an unreachable or unlabelled control, a missing loading or error state, a layout that
>   assumes a large screen, a destructive action with no confirmation.
> - Anything the plan required that you cannot find at all.
>
> **Output:** **append** your section to `Architect_review/1st_stage_architect_review.md`, creating
> the folder if it does not exist.
>
> Read the file first. Earlier phases have already been reviewed and written there by other agents,
> and their sections must survive your write untouched — append after the last line, never rewrite
> the file. If your section is the first, add the report's title heading before it. Add nothing for
> phases other than your own, not even a placeholder.
>
> Use exactly this structure:
>
> ```markdown
> ## Phase [N] — [name]
>
> ### Plan requirements
>
> [each deliverable and definition-of-done item from the phase file, with Met / Partial / Missing
> and one line of justification]
>
> ### Files
>
> #### `path/to/file.ts`
>
> **Responsibility:** …
> **Exports:**
>
> - `functionName(arg: Type, arg2: Type): ReturnType` — what it does; throws …; early-returns when …
>   **Imports:** …
>   **Side effects:** …
>   **Notes:** …
>
> ### Findings
>
> #### [CRITICAL|HIGH|MEDIUM|LOW] — short title
>
> - **Where:** `path/to/file.ts:42`
> - **Is:** …
> - **Should be:** …
> - **Why it matters:** …
> - **Fix:** …
>
> ### Phase summary
>
> [2–4 sentences: overall health, and the single most important thing to fix]
> ```
>
> Be exhaustive in the Files section — Stage 2 depends on it as its call-graph source. Be
> disciplined in Findings: report defects, not preferences. Do not invent problems to fill space;
> "no findings in this file" is a legitimate and useful result.

---

## 7. Stage 2 sub-agent prompt

Spawn only after all nine Stage 1 sections exist.

> You are performing a read-only **cross-phase integration review** of the Mobile Automation
> codebase. Working directory `D:\websites\Mobile_Automation`. Windows shell.
>
> **Rules:** never open a test file (`*.test.ts`, `*.test.tsx`, `__tests__/`, `src/test/`,
> `src/androidTest/`, `*Test.kt`). Change no code. Never touch `.orion/`. Never run an APK build.
>
> **Start by reading `Architect_review/1st_stage_architect_review.md` in full.** Nine phases have
> already been documented file by file, function by function, with parameter and return types. That
> is your map. Your job is the part a per-phase reviewer structurally could not do: **the seams.**
>
> A per-phase reviewer sees a function that is correct in isolation. Only you can see that its one
> caller passes the arguments in the wrong order.
>
> Read `Development_Plan/architecture/System_Architecture.md`,
> `Development_Plan/architecture/Data_Models.md`, `ORION.md`, and the ADRs — especially
> **0008 (two engines, one runtime)**, **0009 (selectors over coordinates)**, and
> **0001 (RN owns product, Kotlin owns OS)**. Then read the real source at every boundary you are
> checking. **Do not rely on the Stage 1 report alone for a claim about a call site — open the
> file.**
>
> **Examine:**
>
> 1. **Every cross-package call.** For each exported function with a caller in another package:
>    does the caller pass what the callee's signature declares? Are optional parameters omitted
>    where the callee assumes a value? Is a return value used as if it were a different type or
>    shape? Is a nullable return dereferenced?
> 2. **The declared dependency direction.** `ORION.md` states it: nothing in `packages/` may import
>    from `apps/mobile`; `shared-types` and `node-sdk` sit at the bottom; `packages/native-automation`
>    is the only place TypeScript touches `NativeModules`; `execution-recorder` must not depend on
>    `ai-agent`. Find every violation.
> 3. **The duplicated contracts.** These are duplicated on purpose and must agree:
>    - `DeviceTool` (`android/automation`) ↔ `TOOL_NAMES` (`packages/tool-sdk`)
>    - `UiNodeAttribute` / `UiTreeAttribute` (`android/accessibility`) ↔ `UI_NODE_ATTRIBUTES` /
>      `UI_TREE_ATTRIBUTES` (`packages/screen-inspector`), including `UI_TREE_SCHEMA_VERSION`
>    - `NODE_TO_TOOL` (`packages/android-nodes`) ↔ `TOOL_TO_NODE` (`packages/execution-recorder`)
>    - Kotlin bridge method names ↔ the TypeScript wrapper's calls ↔ `invokeTool`'s dispatch table
>    - Native module rejection codes ↔ the TypeScript error-code unions that claim to list them
>      Report any name present on one side and absent on the other, in either direction.
> 4. **The TypeScript ↔ Kotlin boundary.** For every native method: does the TS wrapper pass the
>    argument count, order, and types the Kotlin `@ReactMethod` declares? Does it handle every
>    rejection code Kotlin can produce? Does Kotlin resolve a shape the TS side actually parses?
>    Check especially anything crossing as a JSON string, and any 64-bit value crossing as a bridge
>    `Int` (epoch milliseconds are the classic case).
> 5. **The two engines against one runtime (ADR 0008).** The AI agent and the workflow engine must
>    reach the device through the same tool runtime. Verify neither has grown its own path, and that
>    the overlay and the MCP scaffold use the same `invokeTool` dispatch.
> 6. **Selector flow end to end (ADR 0009).** Trace a selector from the Kotlin resolver, through the
>    bridge, into `workflow-schema`, into a node's config, into the recorder's generated workflow,
>    and into what the overlay's Ask AI produces. Does the priority order agree at every step? Can a
>    coordinate-only selector be produced anywhere that a durable one was available?
> 7. **Data flow through the stores.** The canvas, selection, execution, and overlay Zustand stores,
>    plus the two React roots. Does a value written by one reader get read correctly by another? Does
>    anything read a store field that no longer exists or has changed shape? Is state reset at the
>    right moments and preserved at the others?
> 8. **Persistence round trips.** A workflow and a trace each get written as JSON and read back and
>    validated. Does what is written satisfy the schema used to read it? Do the Kotlin queryable
>    columns match what the TypeScript side believes it stored? Are screenshot paths written where
>    something later reads them, and cleaned up when their owner is deleted?
> 9. **Event flows.** Agent events → recorder; engine events → execution store; native events →
>    their TS listeners; overlay dismissal → the launcher. For each: is every event the producer
>    emits handled, and does every event the consumer expects actually get emitted?
> 10. **Orphans and gaps.** Exported symbols with no importer anywhere. Plan deliverables no code
>     path reaches. UI that can never be shown because nothing routes to it. Error branches no caller
>     can distinguish.
>
> **Output:** write `Architect_review/2nd_stage_architect_review.md`:
>
> ```markdown
> # Stage 2 — Cross-phase integration review
>
> ## Boundary map
>
> [each significant seam: producer → consumer, what crosses, and Verified / Mismatched / Unused]
>
> ## Duplicated-contract parity
>
> [one subsection per contract, listing both sides and any difference]
>
> ## Findings
>
> #### [CRITICAL|HIGH|MEDIUM|LOW] — short title
>
> - **Seam:** producer `file:line` → consumer `file:line`
> - **Is:** …
> - **Should be:** …
> - **Why it matters:** …
> - **Fix:** …
>
> ## Unused and unreachable
>
> [exported but never imported; implemented but never routed to]
>
> ## Summary
>
> [the integration risks that matter most, ordered]
> ```
>
> Every finding needs both ends of the seam with file and line. A cross-phase claim without two
> locations cannot be acted on.

---

## 8. Stage 3 — Your triage

Read both reports yourself, in full. Then:

1. **Verify before believing.** Open the file at each `CRITICAL` and `HIGH` finding and confirm it.
   Sub-agents misread code. A finding you cannot reproduce by reading is discarded with a note
   saying so — do not fix a bug that is not there.
2. **De-duplicate.** The same defect will often appear in both reports under different framings.
3. **Separate defect from deferral.** `tracking.md`'s "Deliberately deferred" sections record
   decisions already made. A reviewer flagging one of those has found a documented decision, not a
   bug. Say so and move on. If the deferral now looks wrong, that is a separate judgement worth
   stating plainly.
4. **Order by risk, not by severity label.** A `MEDIUM` on the selector chain matters more than a
   `HIGH` on a screen nobody has reached yet.
5. **Write the plan.** Append to `Architect_review/2nd_stage_architect_review.md`, or create
   `Architect_review/fix_plan.md`, listing: what you will fix now, what you will not fix and why,
   and what needs the user's decision.

Anything that changes agreed scope, or that is not a defect but a design change, goes to the user
before you touch it.

---

## 9. Stage 4 — Fixes

Work in small batches, grouped by subsystem so each verification run is meaningful.

After every batch:

```
set "PATH=%USERPROFILE%\.local\bin;%PATH%"
pnpm turbo run typecheck lint test build
pnpm format:check
```

For Kotlin changes:

```
cd android
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
gradle ktlintFormat --no-daemon
gradle ktlintCheck testDebugUnitTest --no-daemon
```

**Two traps that have each cost a CI round trip. Both apply to any fix touching Kotlin:**

- **The app module is compiled only by an assemble.** `ktlintCheck` and `testDebugUnitTest` do not
  compile `apps/mobile/android/app`. If you change a module's public surface, run
  `gradle :<module>:assembleDebug` — and `cd apps\mobile\android && gradle :app:compileDebugKotlin`
  for the app module itself.
- **The `androidTest` source set is compiled only by `assembleDebugAndroidTest`.** Changing a type
  an instrumentation test uses passes every local check and fails in CI. Run
  `gradle assembleDebugAndroidTest`.

If a fix touches anything the RN app imports, also run the release-bundle check, which is what
catches a Metro resolution problem that the debug APK would hide:

```
cd apps\mobile
npx react-native bundle --platform android --dev false --entry-file index.js ^
  --bundle-output ..\..\tmp-bundle.js --assets-dest ..\..\tmp-assets
```

Then delete `tmp-bundle.js` and `tmp-assets`.

Add a test for every behavioural fix. A bug fixed without a test is a bug that returns.

Commit in coherent batches with messages that say **why**, not just what. Push, then verify CI:

```
gh run list --limit 5
gh run watch <run-id> --exit-status --interval 30
gh run view <run-id> --log-failed
```

Do not report the review as finished until CI is green.

Finally, update `tracking.md` with an "Architect review" section: what was found, what was fixed,
what was deliberately left, and anything the review revealed about the process itself.

---

## 10. Rules for you, the orchestrator

- **One sub-agent at a time. Never two.** This is the rule most likely to be rationalised away when
  ten sequential runs start to feel slow, so treat it as fixed. Stage 1's agents all append to one
  file, and concurrent appends interleave or clobber without raising an error — the damage surfaces at
  Stage 2, which reads that file as its map. Phases 0 and 1 being small is not a reason to pair them.
- **Wait for completion before spawning the next.** Not "start the next while checking the last".
  Read the appended section, judge it, then spawn.
- **Check each section against a real bar before moving on.** Findings must carry `file:line`. The
  per-file detail must plausibly account for the number of files in that phase's scope — a phase with
  twenty files and four documented is not finished. A weak Stage 1 section produces a weak Stage 2,
  because Stage 2 uses it as its map. Re-spawn that phase with a prompt naming what was missing.
- **Keep a visible plan of the ten phases** and mark each done only when its section is written and
  checked. This review spans many turns; after a context compaction the plan is the only thing that
  tells you which phase is next.
- **Do not review the code yourself during Stages 1 and 2.** Your context is the scarce resource that
  makes Stage 3 possible. Reading the codebase now means arriving at triage with no room to hold both
  reports.
- **Do not summarise a sub-agent's report into a shorter one.** The detail is the deliverable.
- **Never let a sub-agent edit code**, however obvious the fix looks. Fixes are Stage 4, after
  triage, so that one reviewer's misreading cannot become a change nobody verified.
- Between stages, report progress to the user in a sentence or two: which phase finished, and
  anything alarming. Save detail for the end.

---

## 11. Done when

- [ ] All ten Stage 1 phases were reviewed by **ten separate sub-agents, run one at a time**, each
      section checked before the next was spawned.
- [ ] `Architect_review/1st_stage_architect_review.md` has all ten sections (Phases 0–9), each with
      a plan-requirements table, per-file detail, and findings with file and line references.
- [ ] `Architect_review/2nd_stage_architect_review.md` covers every seam in §7, including a parity
      check of all five duplicated contracts.
- [ ] Every `CRITICAL` and `HIGH` finding is either fixed, or recorded with a reason for not fixing
      it, or escalated to the user.
- [ ] `pnpm turbo run typecheck lint test build` passes; `pnpm format:check` clean.
- [ ] Kotlin ktlint and unit tests pass; the relevant assembles compile.
- [ ] Both CI workflows green on `main`.
- [ ] `tracking.md` records the review and its outcome.
