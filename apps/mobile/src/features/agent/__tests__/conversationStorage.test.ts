import { type PromptMessage } from '@mobile-automation/prompt-engine';

import { conversationFromMessages } from '../conversationStorage';
import { type ChatMessage } from '../sessionStorage';

/**
 * Replaying a stored conversation.
 *
 * The rules here are not cosmetic. A provider rejects the **whole request** when an assistant `tool_call` has no
 * matching `tool` message, or when a `tool` message references a call that never appeared — so a badly rebuilt
 * conversation does not degrade the next run, it prevents it from starting at all.
 *
 * A stored conversation can easily be in that state: the window cuts at an arbitrary point, and a killed run may
 * never have written its answers.
 */

const row = (overrides: Partial<ChatMessage> & { wire?: unknown }): ChatMessage => ({
  id: `msg_${Math.random().toString(36).slice(2, 8)}`,
  sessionId: 'session_1',
  role: 'wire',
  text: 'a message',
  detail: 'wire' in overrides ? JSON.stringify({ wire: overrides.wire }) : null,
  runId: 'run_1',
  createdAtEpochMs: 1,
  ...overrides,
  // Re-applied because the spread above would overwrite the serialized detail.
  ...('wire' in overrides ? { detail: JSON.stringify({ wire: overrides.wire }) } : {}),
});

const user = (content: string) => row({ wire: { role: 'user', content } });

const assistantWithCall = (id: string, name = 'getUiTree') =>
  row({
    wire: {
      role: 'assistant',
      content: null,
      toolCalls: [{ id, name, arguments: '{}' }],
    },
  });

const toolAnswer = (id: string, content = '{}') =>
  row({ wire: { role: 'tool', content, toolCallId: id } });

describe('a complete conversation', () => {
  it('replays user, assistant and tool messages in order', () => {
    const restored = conversationFromMessages([
      user('message Robert'),
      assistantWithCall('c1'),
      toolAnswer('c1', '{"nodeCount":12}'),
      row({ wire: { role: 'assistant', content: 'I sent it.' } }),
    ]);

    expect(restored.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'assistant',
    ]);
  });

  it('keeps the tool call id, which is what makes the request valid', () => {
    const restored = conversationFromMessages([
      user('go'),
      assistantWithCall('call_abc'),
      toolAnswer('call_abc'),
    ]);

    expect(restored[1]?.toolCalls?.[0]?.id).toBe('call_abc');
    expect(restored[2]?.toolCallId).toBe('call_abc');
  });

  it('keeps tool arguments as the string they were sent as', () => {
    const restored = conversationFromMessages([
      row({
        wire: {
          role: 'assistant',
          content: null,
          toolCalls: [{ id: 'c1', name: 'openApp', arguments: '{"packageName":"com.whatsapp"}' }],
        },
      }),
      toolAnswer('c1'),
    ]);

    expect(restored[0]?.toolCalls?.[0]?.arguments).toBe('{"packageName":"com.whatsapp"}');
  });
});

describe('dropping what would be invalid', () => {
  it('drops an assistant turn whose answer is missing', () => {
    // The window cut it off, or the run was killed before the answer was written. Either way, replaying the call
    // alone would make the next request invalid.
    const restored = conversationFromMessages([
      user('go'),
      assistantWithCall('c1'),
      // no answer for c1
    ]);

    expect(restored.map((message) => message.role)).toEqual(['user']);
  });

  it('drops a turn with two calls when only one was answered', () => {
    const restored = conversationFromMessages([
      user('go'),
      row({
        wire: {
          role: 'assistant',
          content: null,
          toolCalls: [
            { id: 'c1', name: 'getUiTree', arguments: '{}' },
            { id: 'c2', name: 'getCurrentScreen', arguments: '{}' },
          ],
        },
      }),
      toolAnswer('c1'),
    ]);

    expect(restored.map((message) => message.role)).toEqual(['user']);
  });

  it('drops an orphaned tool message', () => {
    // The same error in the other direction: a result whose id matches no preceding call is equally invalid.
    const restored = conversationFromMessages([toolAnswer('c_gone'), user('go')]);

    expect(restored.map((message) => message.role)).toEqual(['user']);
  });

  it('keeps a later complete exchange after dropping an incomplete one', () => {
    const restored = conversationFromMessages([
      user('go'),
      assistantWithCall('c1'),
      assistantWithCall('c2'),
      toolAnswer('c2'),
    ]);

    expect(restored.map((message) => message.role)).toEqual(['user', 'assistant', 'tool']);
    expect(restored[1]?.toolCalls?.[0]?.id).toBe('c2');
  });

  it('leaves every remaining call answered', () => {
    const restored = conversationFromMessages([
      user('go'),
      assistantWithCall('c1'),
      assistantWithCall('c2'),
      toolAnswer('c2'),
      assistantWithCall('c3'),
    ]);

    const callIds = restored.flatMap((message) => (message.toolCalls ?? []).map((call) => call.id));
    const answered = new Set(
      restored.filter((message) => message.role === 'tool').map((message) => message.toolCallId),
    );

    for (const id of callIds) expect(answered.has(id)).toBe(true);
  });
});

describe('rows that are not part of the conversation', () => {
  it('ignores transcript rows', () => {
    // The table holds two views: the user's transcript and the model's conversation. A `tool` row's text is a
    // readable summary ("Tapped Send") while the model was sent the JSON result, so replaying transcript rows
    // would replay a conversation that never happened.
    const restored = conversationFromMessages([
      { ...row({}), role: 'user', detail: null, text: 'message Robert' },
      { ...row({}), role: 'tool', detail: null, text: 'Tapped "Send"' },
      { ...row({}), role: 'event', detail: null, text: 'Plan: open WhatsApp' },
      user('the real message'),
    ]);

    expect(restored).toEqual([{ role: 'user', content: 'the real message' }]);
  });

  it('ignores a stored system message', () => {
    // The system prompt is prepended fresh on every request. A stored copy would go stale the moment the prompt
    // changed, leaving old sessions running a previous version of the agent.
    const restored = conversationFromMessages([
      row({ wire: { role: 'system', content: 'an old system prompt' } }),
      user('go'),
    ]);

    expect(restored).toEqual([{ role: 'user', content: 'go' }]);
  });

  it('survives a malformed row rather than losing the conversation', () => {
    const restored = conversationFromMessages([
      { ...row({}), detail: 'not json' },
      { ...row({}), detail: JSON.stringify({ wire: { role: 'telepath', content: 'x' } }) },
      { ...row({}), detail: JSON.stringify({}) },
      user('go'),
    ]);

    expect(restored).toEqual([{ role: 'user', content: 'go' }]);
  });

  it('drops a tool message with no id', () => {
    const restored = conversationFromMessages([
      row({ wire: { role: 'tool', content: '{}' } }),
      user('go'),
    ]);

    expect(restored).toEqual([{ role: 'user', content: 'go' }]);
  });

  it('drops an assistant message that says nothing at all', () => {
    const restored = conversationFromMessages([
      row({ wire: { role: 'assistant', content: null } }),
      user('go'),
    ]);

    expect(restored).toEqual([{ role: 'user', content: 'go' }]);
  });
});

describe('images', () => {
  it('keeps the text of an image answer and drops the bytes', () => {
    /**
     * Deliberate, and the reasoning is worth stating: a screenshot's base64 is often over a megabyte, the
     * provider charges for it on **every** subsequent request, and a screen from an earlier run is stale by
     * definition — the phone has moved on. The text part is what still carries meaning.
     */
    const restored = conversationFromMessages([
      assistantWithCall('c1', 'takeScreenshot'),
      row({
        wire: {
          role: 'tool',
          toolCallId: 'c1',
          content: [
            { type: 'text', text: 'Screenshot of the current screen.' },
            { type: 'image_url', imageUrl: { url: 'data:image/png;base64,AAAA' } },
          ],
        },
      }),
    ]);

    const answer = restored[1];

    expect(typeof answer?.content).toBe('string');
    expect(answer?.content).toBe('Screenshot of the current screen.');
    expect(JSON.stringify(restored)).not.toContain('base64');
  });

  it('drops an answer that was nothing but an image', () => {
    // Nothing left to say once the bytes are gone, and a tool message with null content is not a useful answer.
    const restored = conversationFromMessages([
      user('go'),
      assistantWithCall('c1', 'takeScreenshot'),
      row({
        wire: {
          role: 'tool',
          toolCallId: 'c1',
          content: [{ type: 'image_url', imageUrl: { url: 'data:image/png;base64,AAAA' } }],
        },
      }),
    ]);

    // The answer survives as a message with null content, so the pairing stays valid — which matters more than
    // the content being useful.
    const answer = restored.find((message) => message.role === 'tool');
    expect(answer?.toolCallId).toBe('c1');
  });
});

describe('an empty session', () => {
  it('replays nothing', () => {
    expect(conversationFromMessages([])).toEqual([]);
  });
});

describe('the type it produces', () => {
  it('is assignable to PromptMessage', () => {
    // A compile-time check as much as a runtime one: this is what goes straight into a request.
    const restored: readonly PromptMessage[] = conversationFromMessages([user('go')]);

    expect(restored[0]?.role).toBe('user');
  });
});
