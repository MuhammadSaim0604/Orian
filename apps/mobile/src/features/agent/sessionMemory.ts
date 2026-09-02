import { type AgentEvent } from '@mobile-automation/ai-agent';

import { describeToolCall } from './ChatMessageRow';
import { type MessageRole } from './sessionStorage';

/**
 * Turning a run's events into the transcript a person reads.
 *
 * **One direction only, now.** This module used to work backwards as well: `seedEntriesFor` rebuilt synthetic
 * `MemoryEntry` values from stored rows, and `contextualGoal` pasted the previous exchange into the next goal
 * string as `Earlier in this conversation: User: … You: …`.
 *
 * Both are gone, and the reason is worth keeping. They *described* the past instead of replaying it, so the
 * model never saw an assistant message it had written or a tool result it had received — every turn was
 * effectively its first, and what it had done arrived second-hand as prose someone else had written about it.
 * `conversationStorage.ts` now persists the real `PromptMessage` values and replays them as themselves.
 *
 * What is left is the **transcript**, which is a different artefact for a different reader: a `tool` row's text
 * is a readable summary ("Tapped Send"), while the model was sent the JSON result. Two views of one
 * conversation — and conflating them is what produced the bug.
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
    case 'planned': {
      /**
       * A plan with no steps is not worth a message.
       *
       * The reported symptom was a stray bare `Plan:` line in the conversation — no card, no steps, just the label.
       * Asking the agent something conversational ("hi") gives the model nothing to plan, so it returns an empty
       * step list, and the joined text collapses to the prefix alone.
       *
       * Dropped here rather than filtered at render time, because it should not be *stored* either: a transcript
       * reopened tomorrow would show the same empty line, and `taskListFrom` would have to keep guarding against
       * a plan that never had content.
       */
      const steps = event.steps.map((step) => step.trim()).filter((step) => step !== '');
      if (steps.length === 0) return null;

      return {
        role: 'event',
        // Kept readable on its own, because this is what a screen reader announces and what an older build (or a
        // future consumer with no timeline renderer) would show. The structured form in `detail` is what the
        // timeline draws from.
        text: event.isReplan ? `New plan: ${steps.join(' → ')}` : `Plan: ${steps.join(' → ')}`,
        detail: { kind: 'plan', steps, isReplan: event.isReplan },
      };
    }

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
      return {
        role: 'event',
        text: `Changing approach: ${event.reason}`,
        detail: { kind: 'replan' },
      };

    case 'runFinished':
      return {
        // The agent's closing word to the user, so it reads as a reply rather than as a status line.
        role: 'assistant',
        text: event.summary,
        detail: { outcome: event.outcome },
      };

    case 'thinking':
      // An `event` role, not `assistant`.
      //
      // Reasoning is not the agent's reply, and storing it as one was what put raw thinking into the chat as
      // bubbles. As an event it renders as the collapsible Thinking strip, and it stays excludable from the
      // prompt - feeding the model its own reasoning back would have it commenting on its commentary.
      return event.content.trim() === ''
        ? null
        : { role: 'event', text: event.content, detail: { kind: 'thinking' } };

    // runStarted is the user's own message, already recorded by the composer. observed, toolCallProposed and
    // toolCallRejected are per-step churn: useful live in the event log, noise in a saved conversation.
    default:
      return null;
  }
};
