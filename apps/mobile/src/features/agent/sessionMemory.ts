import { type AgentEvent } from '@mobile-automation/ai-agent';
import { type MemoryEntry } from '@mobile-automation/prompt-engine';

import { describeToolCall } from './ChatMessageRow';
import {
  type ChatMessage,
  type MessageRole,
  loadRecentMessages,
  parseMessageDetail,
} from './sessionStorage';

/**
 * The bridge between a run and its session.
 *
 * Two directions, and they are deliberately separate functions rather than one class:
 *
 * - **Forward** — {@link messageForEvent} turns an agent event into a transcript message, so a run's activity
 *   lands in the conversation it belongs to and is still there after the app is closed.
 * - **Backward** — {@link seedEntriesFor} turns a stored transcript back into memory entries, so a second run
 *   in the same session knows what the first one did.
 *
 * ## Why the backward direction is not a second memory implementation
 *
 * `packages/ai-agent` already has `AgentMemory`, tested, deriving the stuck and replan signals. The step file
 * is explicit that this must not be duplicated, and it would be a bad idea regardless: two implementations of
 * "what has the agent tried" would eventually disagree, and the one on the critical path would be the
 * untested one.
 *
 * So this produces `MemoryEntry` values — the exact type `AgentMemory` already consumes — and the loop's
 * memory is seeded with them. Persistence is the only thing being added; the reasoning stays where it is.
 */

/** A message ready to be written, before it has an id or a timestamp. */
export type PendingMessage = {
  readonly role: MessageRole;
  readonly text: string;
  readonly detail?: unknown;
};

/**
 * The transcript message for an event, or null when the event is not worth recording.
 *
 * Most of the nine event types are transient narration. Persisting all of them would bury the conversation:
 * `observed` fires before every single step, and a transcript reading "Looking at the screen" forty times is
 * worse than one that omits it.
 *
 * What is kept is what a user would want to see when reopening the conversation tomorrow: the plan, what was
 * actually done, why the approach changed, and how it ended.
 */
export const messageForEvent = (event: AgentEvent): PendingMessage | null => {
  switch (event.type) {
    case 'planned':
      return {
        role: 'event',
        text: event.isReplan
          ? `New plan: ${event.steps.join(' → ')}`
          : `Plan: ${event.steps.join(' → ')}`,
        detail: { steps: event.steps, isReplan: event.isReplan },
      };

    case 'toolExecuted':
      return {
        // A `tool` role rather than `assistant`, because the renderer gives it a structured row with an
        // outcome rail — and because the prompt must be able to exclude it. The model gets its tool history
        // from memory; re-reading it from the chat would double it.
        role: 'tool',
        text: describeToolCall(event.tool, event.arguments),
        detail: {
          tool: event.tool,
          arguments: event.arguments,
          outcome: event.outcome,
          error: event.error,
          step: event.step,
          screenAfter: event.screenAfter,
        },
      };

    case 'replanning':
      return { role: 'event', text: `Changing approach: ${event.reason}` };

    case 'runFinished':
      return {
        // The agent's closing word to the user, so it reads as a reply rather than as a status line.
        role: 'assistant',
        text: event.summary,
        detail: { outcome: event.outcome },
      };

    case 'thinking':
      // Only when there is something to show. An empty thought is a blank bubble.
      return event.content.trim() === '' ? null : { role: 'assistant', text: event.content };

    // runStarted is the user's own message, already recorded by the composer. observed, toolCallProposed and
    // toolCallRejected are per-step churn: useful live in the event log, noise in a saved conversation.
    default:
      return null;
  }
};

/**
 * Rebuilds memory entries from a stored transcript.
 *
 * Only `tool` messages produce entries, because a memory entry *is* a record of a tool call — that is what
 * `MemoryEntry` describes, and what the stuck and replan detectors reason over. The user's messages and the
 * agent's prose are conversation, not history of action.
 *
 * A message whose detail is missing or malformed is skipped rather than guessed at. An entry with an invented
 * tool name would corrupt the repeat detector, which compares tool plus arguments — and a false "you are
 * looping" is worse than a missing step.
 */
export const entriesFromMessages = (messages: readonly ChatMessage[]): readonly MemoryEntry[] => {
  const entries: MemoryEntry[] = [];

  for (const message of messages) {
    if (message.role !== 'tool') continue;

    const detail = parseMessageDetail<{
      tool?: unknown;
      arguments?: unknown;
      outcome?: unknown;
      screenAfter?: unknown;
    }>(message.detail);

    if (detail === null) continue;
    if (typeof detail.tool !== 'string' || detail.tool === '') continue;

    entries.push({
      // Renumbered from one, contiguously. The stored step numbers came from earlier runs and would restart
      // or jump; the detectors only care about order and adjacency.
      step: entries.length + 1,
      tool: detail.tool,
      arguments:
        typeof detail.arguments === 'object' && detail.arguments !== null
          ? (detail.arguments as Record<string, unknown>)
          : {},
      // Anything not explicitly recorded as succeeded is treated as failed. The safer direction: a past
      // failure remembered as a success would have the agent repeat it confidently.
      outcome: detail.outcome === 'succeeded' ? 'succeeded' : 'failed',
      summary: message.text,
      screenAfter: typeof detail.screenAfter === 'string' ? detail.screenAfter : null,
    });
  }

  return entries;
};

/**
 * Loads a session's history as memory entries.
 *
 * Windowed rather than complete: a long conversation's full transcript would not fit in a prompt, and the
 * recent past is what the model needs to avoid repeating itself. The window is applied in SQL, so a session
 * with a thousand messages costs the same as one with sixty.
 *
 * Returns empty for a fresh session, which is exactly right — there is nothing to remember.
 */
export const seedEntriesFor = async (sessionId: string): Promise<readonly MemoryEntry[]> => {
  const messages = await loadRecentMessages(sessionId);
  return entriesFromMessages(messages);
};

/**
 * A short account of the session so far, for the goal the agent is given.
 *
 * The loop takes one goal string, and a follow-up like "now do the same for Sarah" is meaningless without
 * what came before. Rather than changing the loop's contract, the preceding exchange is folded into the goal.
 *
 * Deliberately mechanical and short. Summarising with the model would cost a round trip before the run even
 * starts, and the last few turns are what a follow-up actually refers to.
 */
export const contextualGoal = (goal: string, messages: readonly ChatMessage[]): string => {
  const recent = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-CONTEXT_TURNS);

  if (recent.length === 0) return goal;

  const transcript = recent
    .map((message) => `${message.role === 'user' ? 'User' : 'You'}: ${message.text}`)
    .join('\n');

  return `Earlier in this conversation:\n${transcript}\n\nNow: ${goal}`;
};

/**
 * How many turns of conversation to fold into a follow-up goal.
 *
 * Six is three exchanges — enough for "do that again for Sarah" to resolve, few enough that the goal stays a
 * goal rather than becoming a transcript.
 */
const CONTEXT_TURNS = 6;
