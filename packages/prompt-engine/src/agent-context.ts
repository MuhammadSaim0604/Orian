import { type PromptMessage, systemMessage } from './template';

/**
 * The agent's system prompt, and the conversation it heads.
 *
 * ## What changed, and why the old shape was wrong
 *
 * This module used to *assemble* a two-message request on every turn: one system message and one enormous user
 * message containing the goal, the plan, the whole tool list as prose, a flattened history of every step, a
 * budget line, and the entire UI tree. Network logs showed exactly that — `system` and `user`, nothing else,
 * however many steps had been taken.
 *
 * That is not how a Chat Completions conversation works, and the consequences were not cosmetic:
 *
 * - **The model could not see its own actions.** An assistant turn that called a tool was never recorded as an
 *   assistant message, so from the model's point of view every turn was its first. What it had done arrived
 *   second-hand, as prose someone else had written about it.
 * - **The first call had a different system prompt from the rest**, because planning used its own builder. A
 *   system prompt that changes between turns is a different agent each time, and it defeats every provider's
 *   prompt caching.
 * - **The first call carried no tools at all**, so planning could only be a JSON reply — which is why the plan
 *   arrived as content to be parsed rather than as a tool call.
 * - **The user message was not the user's message.** It was a generated document with the user's goal buried in
 *   it, and the previous conversation pasted in as `Earlier in this conversation: User: … You: …`.
 * - **The screen was injected whether or not the model asked**, which both denied it the choice and made the
 *   request grow without bound.
 *
 * So the request is now `[system, ...conversation]`: one unchanging system message, then the real messages in
 * the order they happened — user, assistant with `tool_calls`, tool results, assistant, and so on. The tool
 * list travels in the request's `tools` array, where it belongs, on **every** call.
 *
 * ## What the system prompt has to carry as a result
 *
 * Everything the per-turn injection used to do implicitly now has to be said once, here:
 *
 * - *How to see the screen.* Nothing arrives unasked, so the prompt has to say that reading the screen is a
 *   tool call. This is strictly better: the model chooses when to look, and a step that needs no screen costs
 *   nothing.
 * - *How to plan.* Planning is `createPlan`/`updatePlan`, not a JSON reply.
 * - *That the budget exists.* It cannot be a per-turn number any more, so the prompt says to work efficiently
 *   and the loop enforces the ceiling.
 */

/**
 * The agent's instructions. **Byte-identical on every call, including the first.**
 *
 * That invariant is load-bearing in two ways. A prompt that varies between turns is a different agent each
 * turn, which makes behaviour impossible to reason about. And every provider's prompt caching keys on a
 * stable prefix — a system message that changes invalidates the cache on every single call, which is a real
 * cost on a forty-step run.
 *
 * Every rule is here because its absence produced a specific failure:
 *
 * - "read the screen before acting" — models otherwise tap coordinates from memory of a screen two steps old.
 * - "prefer resourceId" — text selectors break on any localisation or label change.
 * - "wait after an action that loads a screen" — the commonest false "element not found" is looking too early.
 * - "say you are done" — without an explicit terminal signal the loop runs to its step ceiling on every success.
 * - "do not invent an element" — a model that cannot find something will otherwise guess a plausible
 *   resourceId and tap something unintended.
 * - "answer directly when nothing needs doing" — a question about the screen was being turned into a sequence
 *   of actions, because nothing said that answering *is* a complete response.
 *
 * The perception chain is stated with its costs, in order. A model told only that OCR exists reaches for it
 * first, because it is the most recently mentioned thing that sounds powerful — so each rung says what it costs
 * and what would justify descending to it.
 */
export const AGENT_SYSTEM_PROMPT = `<role>
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
</safety>`;

/**
 * The messages a request carries: the system prompt plus the conversation.
 *
 * A named type rather than an inline object because the parity test and the loop both refer to it.
 */
export type AgentContextInput = {
  readonly messages: readonly PromptMessage[];
};

/**
 * The request's messages: the system prompt, then the conversation as it happened.
 *
 * Deliberately thin. There is no assembly left to do — that was the problem. The conversation is built by
 * `Conversation` in `@mobile-automation/ai-agent` as real messages, and this only prepends the instructions.
 *
 * It stays a function rather than being inlined at the call site so there is exactly one place that decides
 * what a request looks like, which is what a parity test can hold onto.
 */
export const buildAgentContext = (input: AgentContextInput): readonly PromptMessage[] => [
  systemMessage(AGENT_SYSTEM_PROMPT),
  ...input.messages,
];

/**
 * What the agent can currently see.
 *
 * No longer injected into any prompt — the model gets a screen by calling `getUiTree`, and the result comes
 * back as a tool message. This type survives because the **recorder** needs it: a trace step records the screen
 * as it was before the action, which is what makes a recorded run compile into a durable workflow.
 */
export type Observation = {
  readonly packageName: string | null;
  readonly activityName: string | null;
  /** Serialized UI tree, already compacted by the native layer. */
  readonly uiTree: unknown;
  /** Screenshot reference, never image bytes. */
  readonly screenshotPath?: string | null;
};

/**
 * A tool the agent ran and what came back.
 *
 * Also no longer a prompt input. It is what `AgentMemory` holds, and memory's remaining job is to detect a
 * stuck run — the same action three times, or six steps without the screen changing. Those are derived
 * signals a model reliably fails to notice about itself, which is why they are computed rather than left to it.
 */
export type MemoryEntry = {
  readonly step: number;
  readonly tool: string;
  readonly arguments: Record<string, unknown>;
  readonly outcome: 'succeeded' | 'failed';
  /** One line. Full results live in the trace, not in memory. */
  readonly summary: string;
  /** Screen after the action, so a stall is detectable. */
  readonly screenAfter?: string | null;
};
