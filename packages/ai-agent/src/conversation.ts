import {
  type MessageToolCall,
  type PromptMessage,
  assistantMessage,
  assistantToolCallMessage,
  estimateMessagesTokens,
  textOf,
  toolImageMessage,
  toolMessage,
  userMessage,
} from '@mobile-automation/prompt-engine';

/**
 * The conversation, as the protocol defines it.
 *
 * ## What this replaces
 *
 * There was no conversation before. Every turn rebuilt a two-message request — one system, one user — with the
 * history flattened into prose inside the user message, and previous sessions pasted into the goal string as
 * `Earlier in this conversation: User: … You: …`. The model never saw an assistant message, never saw a tool
 * result, and could not tell its own actions from a description of them.
 *
 * This holds the real thing: `user`, then `assistant` carrying `tool_calls`, then one `tool` message per call,
 * then the next `assistant`, in the order they happened.
 *
 * ## The invariant that matters
 *
 * **Every tool call must be answered before the next request is sent.** A provider given an assistant message
 * with a `tool_call` and no `tool` message bearing that id rejects the whole request — not the message, the
 * request. So `recordAssistantTurn` and the answers that follow are a pair, and `unansweredCallIds` exists so
 * the loop can assert it rather than hope.
 *
 * That is also why a rejected call, a refused call, and a stall notice all become **tool messages**. It is
 * tempting to inject a correction as a user message, but then the model's own call sits unanswered and the next
 * request is invalid. The correction has to go where the answer was owed.
 */

/** How a tool call was answered, for the trace and for the transcript. */
export type ToolAnswer = {
  readonly toolCallId: string;
  readonly tool: string;
  readonly outcome: 'succeeded' | 'failed';
  readonly text: string;
};

export class Conversation {
  private readonly messages: PromptMessage[] = [];

  /** Ids of calls made but not yet answered. Keyed in insertion order so a failure names the first one. */
  private readonly pendingCallIds = new Set<string>();

  /** The user's message, exactly as typed. */
  addUserMessage(text: string): void {
    this.messages.push(userMessage(text));
  }

  /**
   * Seeds an earlier exchange from a stored session.
   *
   * Pushed as real messages rather than summarised into the next goal, which is what `contextualGoal` used to
   * do. A follow-up like "now do the same for Sarah" resolves because the model can see the previous exchange
   * in its own voice, not because someone wrote a paragraph about it.
   */
  seed(messages: readonly PromptMessage[]): void {
    for (const message of messages) {
      this.messages.push(message);

      // A seeded assistant turn's calls were answered in the run that made them; anything unanswered would have
      // been dropped by the loader. Nothing goes into pendingCallIds, so a fresh turn starts clean.
    }
  }

  /**
   * Records what the model just said and asked for, verbatim.
   *
   * Verbatim is not a style choice. The ids are what the following tool messages reference, and the arguments
   * are replayed as the exact string the provider sent — a re-serialized object is not guaranteed byte-identical.
   */
  recordAssistantTurn(input: {
    readonly content: string | null;
    readonly toolCalls: readonly MessageToolCall[];
    readonly reasoning?: string | null;
  }): void {
    if (input.toolCalls.length === 0) {
      // A plain reply. This is how the model says it is finished, so there is nothing to answer.
      this.messages.push(assistantMessage(input.content ?? ''));
      return;
    }

    this.messages.push(
      assistantToolCallMessage({
        content: input.content,
        toolCalls: input.toolCalls,
        reasoning: input.reasoning ?? undefined,
      }),
    );

    for (const call of input.toolCalls) this.pendingCallIds.add(call.id);
  }

  /** A tool result as text. */
  answerToolCall(input: { readonly toolCallId: string; readonly text: string }): void {
    this.messages.push(toolMessage(input.toolCallId, input.text));
    this.pendingCallIds.delete(input.toolCallId);
  }

  /**
   * A tool result carrying an image.
   *
   * Only `takeScreenshot` uses this, and it is the reason content parts exist at all. A screenshot's useful
   * output is pixels; answering with a file path tells a model that an image exists somewhere it cannot reach,
   * which is worse than answering that capture failed.
   */
  answerToolCallWithImage(input: {
    readonly toolCallId: string;
    readonly text: string;
    readonly base64: string;
    readonly mimeType?: string;
  }): void {
    this.messages.push(
      toolImageMessage({
        toolCallId: input.toolCallId,
        text: input.text,
        base64: input.base64,
        mimeType: input.mimeType,
      }),
    );

    this.pendingCallIds.delete(input.toolCallId);
  }

  /**
   * Answers every call the model made that nothing else answered.
   *
   * The safety net for the invariant. A step can end early for several reasons — the budget ran out, the user
   * stopped it, a tool threw somewhere unexpected — and any of them leaving a call unanswered would make the
   * *next* request invalid, turning a clean stop into a confusing provider error on the following run.
   */
  answerAnyUnanswered(text: string): void {
    for (const id of [...this.pendingCallIds]) {
      this.answerToolCall({ toolCallId: id, text });
    }
  }

  get unansweredCallIds(): readonly string[] {
    return [...this.pendingCallIds];
  }

  /** The messages, for the request. */
  all(): readonly PromptMessage[] {
    return [...this.messages];
  }

  get length(): number {
    return this.messages.length;
  }

  /** Rough size of the conversation, for a log line and for trimming. */
  estimatedTokens(): number {
    return estimateMessagesTokens(this.messages);
  }

  /**
   * Drops the oldest exchanges to fit a budget, keeping the conversation valid.
   *
   * Two rules, and the second is what makes this safe:
   *
   * - The **first user message is always kept**. It is the goal; a conversation trimmed down to its recent
   *   tool results is an agent that has forgotten what it was asked to do.
   * - A cut **never lands between an assistant turn and its tool answers**. Splitting that pair is precisely
   *   the state a provider rejects, so trimming walks forward to the next user or assistant-without-calls
   *   boundary rather than cutting at an arbitrary index.
   */
  trimToBudget(maxTokens: number): number {
    if (this.estimatedTokens() <= maxTokens) return 0;

    const first = this.messages[0];
    const keepFirst = first !== undefined && first.role === 'user' ? 1 : 0;

    let dropped = 0;

    while (this.estimatedTokens() > maxTokens) {
      const cut = this.nextSafeCut(keepFirst);

      // Nothing left to drop without breaking the pairing, or only the goal and one exchange remain. Better an
      // oversized request the provider may still accept than a malformed one it certainly will not.
      if (cut <= keepFirst) break;

      this.messages.splice(keepFirst, cut - keepFirst);
      dropped += cut - keepFirst;
    }

    return dropped;
  }

  /**
   * The index of the next message that may begin the conversation.
   *
   * Walks past a whole assistant-plus-answers group so a cut cannot separate them.
   */
  private nextSafeCut(from: number): number {
    let index = from;

    // Step over one message, then past any tool answers that belong to it.
    if (index < this.messages.length) index++;

    while (index < this.messages.length && this.messages[index]!.role === 'tool') index++;

    return index;
  }

  /**
   * A short account of the conversation, for a log line or a stall notice.
   *
   * Mechanical rather than a model call: summarising with the model would cost a round trip at exactly the
   * moment the agent is already struggling.
   */
  describe(): string {
    const counts = this.messages.reduce<Record<string, number>>((totals, message) => {
      totals[message.role] = (totals[message.role] ?? 0) + 1;
      return totals;
    }, {});

    return Object.entries(counts)
      .map(([role, count]) => `${count} ${role}`)
      .join(', ');
  }

  /** The user's original request, for the run summary and the session title. */
  get goal(): string {
    const first = this.messages.find((message) => message.role === 'user');
    return first === undefined ? '' : textOf(first);
  }

  clear(): void {
    this.messages.length = 0;
    this.pendingCallIds.clear();
  }
}

/**
 * Default ceiling on the conversation.
 *
 * Generous, because the expensive things are no longer resent every turn: the tool list travels in the request's
 * `tools` array, and a UI tree arrives once as a tool result rather than being re-injected on every call. What
 * remains is the exchange itself, which grows slowly.
 */
export const DEFAULT_CONVERSATION_TOKENS = 24_000;
