import {
  type ContentPart,
  type MessageToolCall,
  type PromptMessage,
} from '@mobile-automation/prompt-engine';

import {
  type ChatMessage,
  WIRE_ROLE,
  appendMessage,
  loadRecentMessagesByRole,
  parseMessageDetail,
} from './sessionStorage';

/**
 * The conversation, persisted and replayed.
 *
 * ## What this replaces
 *
 * A follow-up used to work by *describing* the past: `contextualGoal` pasted the previous turns into the goal
 * string as `Earlier in this conversation: User: … You: …`, and `seedEntriesFor` rebuilt synthetic memory
 * entries from the transcript. Both were readable to a person and neither was the protocol — the model never
 * saw an assistant message it had written, or a tool result it had received.
 *
 * This stores the real `PromptMessage` values and replays them as themselves.
 *
 * ## Why the wire message goes in `detail` rather than being rebuilt from the row
 *
 * The transcript row already has a `role` and a `text`, and it is tempting to reconstruct a message from those.
 * That does not work, and the reason is the part worth remembering: a `tool` row's text is a **human-readable
 * summary** ("Tapped Send"), while the model was sent the actual JSON result. Rebuilding from the summary would
 * replay a conversation the model never had, and it would silently lose the `tool_call_id` links that make the
 * request valid at all.
 *
 * So the exact message is stored alongside, under `detail.wire`. The row stays what the UI needs; the wire
 * message stays what the provider needs.
 *
 * ## What is deliberately dropped on load
 *
 * An assistant turn whose tool answers are missing — because the run was killed, or the window cut them off —
 * is **not** replayed. A provider given an assistant `tool_call` with no matching `tool` message rejects the
 * whole request, so replaying a half-exchange would make the next run fail before it started. Dropping it costs
 * one turn of context; keeping it costs the run.
 */

/** Where a stored message keeps its wire form. */
type WireDetail = {
  readonly wire?: {
    readonly role?: unknown;
    readonly content?: unknown;
    readonly toolCalls?: unknown;
    readonly toolCallId?: unknown;
    readonly reasoning?: unknown;
  };
};

/**
 * How many stored messages to replay.
 *
 * The window is applied in SQL, so a session with a thousand messages costs the same as one with sixty. Sixty is
 * generous now that the expensive things are not resent every turn: the tool list travels in the request's
 * `tools` array, and a UI tree arrives once as a tool result rather than being re-injected on every call.
 */
export const CONVERSATION_WINDOW = 60;

/**
 * Persists the conversation the loop produced.
 *
 * Written whole rather than incrementally from events, because the loop is the thing that knows the exact
 * sequence — a transcript rebuilt from events would be a second, subtly different account of what the model saw,
 * and that divergence is the class of bug this whole change exists to remove.
 *
 * Rows carry `role: 'wire'`, which the transcript renderer ignores. That keeps the model's record and the user's
 * record in one table without either having to filter the other out by guesswork.
 */
export const saveConversation = async (
  sessionId: string,
  runId: string,
  messages: readonly PromptMessage[],
): Promise<void> => {
  for (const message of messages) {
    await appendMessage({
      sessionId,
      role: WIRE_ROLE,
      // A short label, for anyone reading the table directly. The renderer never shows a wire row.
      text: `${message.role} message`,
      detail: { wire: toStored(message) },
      runId,
    });
  }
};

/**
 * Loads a session's conversation for replay.
 *
 * Returns empty for a fresh session, which is exactly right — there is nothing to replay.
 */
export const loadConversation = async (
  sessionId: string,
  limit: number = CONVERSATION_WINDOW,
): Promise<readonly PromptMessage[]> => {
  const rows = await loadRecentMessagesByRole(sessionId, WIRE_ROLE, limit);
  return conversationFromMessages(rows);
};

/**
 * Rebuilds the message list from stored rows.
 *
 * Exported for its own test. The pairing rules are the whole reason this is not a `map`.
 */
export const conversationFromMessages = (
  rows: readonly ChatMessage[],
): readonly PromptMessage[] => {
  const restored: PromptMessage[] = [];

  for (const row of rows) {
    const message = fromStored(row);
    if (message !== null) restored.push(message);
  }

  return dropUnansweredCalls(restored);
};

/**
 * Removes assistant turns whose tool answers are not all present.
 *
 * The load-bearing half of this module. A conversation is only valid if every `tool_call` id on an assistant
 * message is answered by a following `tool` message — and a stored conversation can easily violate that, since
 * the window cuts at an arbitrary point and a killed run may never have written its answers.
 *
 * Both the assistant turn **and** any answers it did receive are dropped together. Leaving orphaned `tool`
 * messages behind would be the same error in the other direction: a tool result whose id matches no preceding
 * call is equally invalid.
 */
const dropUnansweredCalls = (messages: readonly PromptMessage[]): readonly PromptMessage[] => {
  const keep: PromptMessage[] = [];

  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]!;

    if (message.role !== 'assistant' || message.toolCalls === undefined) {
      // A stray tool message — one whose assistant turn was dropped, or that arrived without one — is skipped
      // for the same reason: an unmatched tool_call_id invalidates the request.
      if (message.role === 'tool') continue;

      keep.push(message);
      continue;
    }

    const answers: PromptMessage[] = [];
    let cursor = index + 1;

    while (cursor < messages.length && messages[cursor]!.role === 'tool') {
      answers.push(messages[cursor]!);
      cursor++;
    }

    const answered = new Set(answers.map((answer) => answer.toolCallId));
    const complete = message.toolCalls.every((call) => answered.has(call.id));

    if (complete) {
      keep.push(message, ...answers);
    }

    // Whether kept or dropped, the answers have been consumed.
    index = cursor - 1;
  }

  return keep;
};

/** The storable form. Plain JSON, so it survives a round trip through the database. */
const toStored = (message: PromptMessage): Record<string, unknown> => ({
  role: message.role,
  content: message.content,
  toolCalls: message.toolCalls,
  toolCallId: message.toolCallId,
  reasoning: message.reasoning,
});

/**
 * Reads one stored row back, or null when it is not a wire row.
 *
 * Validates rather than casting. Storage is opaque and may have been written by an earlier version of the app,
 * and one malformed row must not put a malformed message into a request — the provider would reject the whole
 * conversation, and the user would see a run that refuses to start for no visible reason.
 */
const fromStored = (row: ChatMessage): PromptMessage | null => {
  if (row.role !== WIRE_ROLE) return null;

  const wire = parseMessageDetail<WireDetail>(row.detail)?.wire;
  if (wire === undefined) return null;

  const role = wire.role;
  if (role !== 'system' && role !== 'user' && role !== 'assistant' && role !== 'tool') return null;

  // The system prompt is never replayed: it is prepended fresh on every request, and a stored copy would go
  // stale the moment the prompt changed — leaving old sessions running a previous version of the agent.
  if (role === 'system') return null;

  const content = readContent(wire.content);
  const toolCalls = readToolCalls(wire.toolCalls);

  // An assistant message with neither content nor calls says nothing and cannot be answered.
  if (role === 'assistant' && content === null && toolCalls === undefined) return null;

  // A tool message with no id cannot be matched to a call, which is exactly what invalidates a request.
  if (role === 'tool' && typeof wire.toolCallId !== 'string') return null;

  return {
    role,
    content,
    toolCalls,
    toolCallId: typeof wire.toolCallId === 'string' ? wire.toolCallId : undefined,
    reasoning: typeof wire.reasoning === 'string' ? wire.reasoning : undefined,
  };
};

/**
 * Reads content back, dropping image parts.
 *
 * **Images are deliberately not replayed.** A screenshot's base64 is often over a megabyte, the provider charges
 * for it on every subsequent request, and a screen from a previous run is stale by definition — the phone has
 * moved on. The text part survives, so the model still knows a screenshot was taken and what it showed.
 */
const readContent = (value: unknown): PromptMessage['content'] => {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return null;

  const parts = value
    .filter(
      (part): part is ContentPart =>
        typeof part === 'object' &&
        part !== null &&
        (part as { type?: unknown }).type === 'text' &&
        typeof (part as { text?: unknown }).text === 'string',
    )
    .map((part) => ({ type: 'text' as const, text: (part as { text: string }).text }));

  if (parts.length === 0) return null;

  // Collapsed to a plain string: a one-element parts array is the less widely supported spelling of the same
  // thing, and there is no reason to send the unusual form once the image is gone.
  return parts.map((part) => part.text).join('\n');
};

const readToolCalls = (value: unknown): readonly MessageToolCall[] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const calls = value
    .filter(
      (call): call is MessageToolCall =>
        typeof call === 'object' &&
        call !== null &&
        typeof (call as { id?: unknown }).id === 'string' &&
        typeof (call as { name?: unknown }).name === 'string' &&
        typeof (call as { arguments?: unknown }).arguments === 'string',
    )
    .map((call) => ({ id: call.id, name: call.name, arguments: call.arguments }));

  return calls.length === 0 ? undefined : calls;
};
