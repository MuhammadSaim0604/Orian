import { describe, expect, it } from 'vitest';

import { Conversation, DEFAULT_CONVERSATION_TOKENS } from './conversation';

/**
 * The conversation, and the one rule a provider enforces.
 *
 * **Every tool call must be answered before the next request.** A provider given an assistant message carrying
 * a `tool_call` with no matching `tool` message rejects the whole request — not the message, the request. So most
 * of what follows is about pairing rather than about content.
 *
 * This exists because there was no conversation at all: every turn rebuilt a two-message request with the
 * history flattened into prose, so the model never saw an assistant message it had written or a tool result it
 * had received.
 */

const call = (id: string, name = 'getUiTree') => ({ id, name, arguments: '{}' });

describe('recording a turn', () => {
  it('keeps the user message exactly as given', () => {
    const conversation = new Conversation();
    conversation.addUserMessage('call 0000');

    expect(conversation.all()).toEqual([{ role: 'user', content: 'call 0000' }]);
  });

  it('records an assistant turn with its calls verbatim', () => {
    const conversation = new Conversation();
    conversation.recordAssistantTurn({
      content: null,
      toolCalls: [{ id: 'c1', name: 'openApp', arguments: '{"packageName":"com.whatsapp"}' }],
    });

    const [message] = conversation.all();

    expect(message?.role).toBe('assistant');
    expect(message?.toolCalls?.[0]?.id).toBe('c1');
    // A string, never a parsed object: re-serializing is not guaranteed byte-identical, and some providers match
    // the assistant turn against the tool results answering it.
    expect(message?.toolCalls?.[0]?.arguments).toBe('{"packageName":"com.whatsapp"}');
  });

  it('records a plain reply as an assistant message with no calls', () => {
    const conversation = new Conversation();
    conversation.recordAssistantTurn({ content: 'All done.', toolCalls: [] });

    expect(conversation.all()).toEqual([{ role: 'assistant', content: 'All done.' }]);
    // Nothing to answer, so nothing is pending — this is how the model says it has finished.
    expect(conversation.unansweredCallIds).toEqual([]);
  });

  it('keeps reasoning on the message', () => {
    const conversation = new Conversation();
    conversation.recordAssistantTurn({
      content: null,
      toolCalls: [call('c1')],
      reasoning: 'I need to see the screen first.',
    });

    expect(conversation.all()[0]?.reasoning).toContain('screen');
  });
});

describe('answering calls', () => {
  it('tracks a call as pending until it is answered', () => {
    const conversation = new Conversation();
    conversation.recordAssistantTurn({ content: null, toolCalls: [call('c1'), call('c2')] });

    expect(conversation.unansweredCallIds).toEqual(['c1', 'c2']);

    conversation.answerToolCall({ toolCallId: 'c1', text: '{}' });

    expect(conversation.unansweredCallIds).toEqual(['c2']);
  });

  it('answers everything outstanding in one go', () => {
    // The safety net. A run can end mid-turn — cancelled, out of budget, a provider error — and an unanswered
    // call would make the *next* run's first request invalid.
    const conversation = new Conversation();
    conversation.recordAssistantTurn({ content: null, toolCalls: [call('c1'), call('c2')] });

    conversation.answerAnyUnanswered('Not run: the run ended.');

    expect(conversation.unansweredCallIds).toEqual([]);
    expect(conversation.all().filter((message) => message.role === 'tool')).toHaveLength(2);
  });

  it('answers with an image when the tool produced one', () => {
    const conversation = new Conversation();
    conversation.recordAssistantTurn({
      content: null,
      toolCalls: [call('c1', 'takeScreenshot')],
    });

    conversation.answerToolCallWithImage({
      toolCallId: 'c1',
      text: 'Screenshot of the current screen.',
      base64: 'iVBORw0KGgo=',
    });

    const answer = conversation.all().at(-1)!;
    const parts = answer.content as { type: string }[];

    expect(answer.toolCallId).toBe('c1');
    expect(parts.map((part) => part.type)).toEqual(['text', 'image_url']);
    expect(conversation.unansweredCallIds).toEqual([]);
  });
});

describe('trimming', () => {
  /** A full exchange: an assistant turn plus its answer. */
  const exchange = (conversation: Conversation, id: string, size = 400): void => {
    conversation.recordAssistantTurn({ content: null, toolCalls: [call(id)] });
    conversation.answerToolCall({ toolCallId: id, text: 'x'.repeat(size) });
  };

  it('does nothing while the conversation fits', () => {
    const conversation = new Conversation();
    conversation.addUserMessage('go');
    exchange(conversation, 'c1');

    expect(conversation.trimToBudget(DEFAULT_CONVERSATION_TOKENS)).toBe(0);
  });

  it('drops the oldest exchanges when over budget', () => {
    const conversation = new Conversation();
    conversation.addUserMessage('go');
    for (const id of ['c1', 'c2', 'c3', 'c4']) exchange(conversation, id, 2_000);

    const before = conversation.length;
    const dropped = conversation.trimToBudget(600);

    expect(dropped).toBeGreaterThan(0);
    expect(conversation.length).toBeLessThan(before);
  });

  it('always keeps the goal', () => {
    // A conversation trimmed down to its recent tool results is an agent that has forgotten what it was asked to
    // do — which looks like a model failure and is not one.
    const conversation = new Conversation();
    conversation.addUserMessage('send Robert a message');
    for (const id of ['c1', 'c2', 'c3', 'c4', 'c5']) exchange(conversation, id, 4_000);

    conversation.trimToBudget(200);

    expect(conversation.all()[0]).toEqual({ role: 'user', content: 'send Robert a message' });
    expect(conversation.goal).toBe('send Robert a message');
  });

  it('never separates an assistant turn from its answers', () => {
    // Splitting that pair is precisely the state a provider rejects, so a cut walks past the whole group rather
    // than landing at an arbitrary index.
    const conversation = new Conversation();
    conversation.addUserMessage('go');
    for (const id of ['c1', 'c2', 'c3', 'c4', 'c5']) exchange(conversation, id, 3_000);

    conversation.trimToBudget(500);

    const messages = conversation.all();

    for (let index = 0; index < messages.length; index++) {
      const message = messages[index]!;
      if (message.role !== 'assistant' || message.toolCalls === undefined) continue;

      const answered = new Set(
        messages
          .slice(index + 1)
          .filter((candidate) => candidate.role === 'tool')
          .map((candidate) => candidate.toolCallId),
      );

      for (const toolCall of message.toolCalls) expect(answered.has(toolCall.id)).toBe(true);
    }

    // And the other direction: no orphaned tool message, whose id would match no preceding call.
    const callIds = new Set(
      messages.flatMap((message) => (message.toolCalls ?? []).map((toolCall) => toolCall.id)),
    );

    for (const message of messages) {
      if (message.role === 'tool') expect(callIds.has(message.toolCallId!)).toBe(true);
    }
  });
});

describe('seeding', () => {
  it('replays earlier messages as themselves', () => {
    // What makes a follow-up work. It used to be done by pasting a transcript into the goal string, so the model
    // never saw its own earlier turns.
    const conversation = new Conversation();

    conversation.seed([
      { role: 'user', content: 'message Robert' },
      { role: 'assistant', content: 'I sent it.' },
    ]);

    conversation.addUserMessage('now do the same for Sarah');

    expect(conversation.all()).toHaveLength(3);
    expect(conversation.goal).toBe('message Robert');
  });

  it('starts a fresh turn with nothing pending', () => {
    // Seeded calls were answered in the run that made them; anything unanswered was dropped by the loader.
    const conversation = new Conversation();

    conversation.seed([
      { role: 'assistant', content: null, toolCalls: [call('old')] },
      { role: 'tool', content: '{}', toolCallId: 'old' },
    ]);

    expect(conversation.unansweredCallIds).toEqual([]);
  });
});

describe('reporting', () => {
  it('counts the messages by role', () => {
    const conversation = new Conversation();
    conversation.addUserMessage('go');
    conversation.recordAssistantTurn({ content: null, toolCalls: [call('c1')] });
    conversation.answerToolCall({ toolCallId: 'c1', text: '{}' });

    expect(conversation.describe()).toBe('1 user, 1 assistant, 1 tool');
  });

  it('estimates its size from text only', () => {
    // An image contributes a real cost to a provider, but not one measurable from a data URL's length — a 2 MB
    // base64 string is not 500 000 tokens. Counting what can be known beats being wildly wrong.
    const conversation = new Conversation();
    conversation.recordAssistantTurn({ content: null, toolCalls: [call('c1')] });
    conversation.answerToolCallWithImage({
      toolCallId: 'c1',
      text: 'a screen',
      base64: 'A'.repeat(100_000),
    });

    expect(conversation.estimatedTokens()).toBeLessThan(100);
  });

  it('clears completely', () => {
    const conversation = new Conversation();
    conversation.addUserMessage('go');
    conversation.recordAssistantTurn({ content: null, toolCalls: [call('c1')] });

    conversation.clear();

    expect(conversation.all()).toEqual([]);
    expect(conversation.unansweredCallIds).toEqual([]);
  });
});
