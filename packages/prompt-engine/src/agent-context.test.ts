import { describe, expect, it } from 'vitest';

import { AGENT_SYSTEM_PROMPT, buildAgentContext } from './agent-context';
import { assistantToolCallMessage, systemMessage, toolMessage, userMessage } from './template';

/**
 * The request's shape.
 *
 * These tests exist because of a real defect, and they are written to catch it recurring rather than to
 * describe the current code. Network logs showed every call carrying **only** a system and a user message,
 * however many steps had been taken: the loop rebuilt a two-message request each turn with the history
 * flattened into prose, so the model never saw an assistant message it had written or a tool result it had
 * received.
 *
 * So the assertions here are mostly about **absence** — no tool list in the text, no screen, no budget, no
 * wrapping around the user's own words — and about the conversation being passed through untouched.
 */

describe('the system prompt', () => {
  it('is the first message and nothing else', () => {
    const messages = buildAgentContext({ messages: [userMessage('call 0000')] });

    expect(messages[0]).toEqual(systemMessage(AGENT_SYSTEM_PROMPT));
  });

  it('is identical on the first call and on the tenth', () => {
    // The invariant with the widest consequences. A prompt that varies between turns is a different agent each
    // turn, and every provider's prompt caching keys on a stable prefix — so a changing system message pays full
    // price on all forty calls of a long run.
    const first = buildAgentContext({ messages: [userMessage('call 0000')] });

    const later = buildAgentContext({
      messages: [
        userMessage('call 0000'),
        assistantToolCallMessage({
          toolCalls: [{ id: 'call_1', name: 'getUiTree', arguments: '{"compact":true}' }],
        }),
        toolMessage('call_1', '{"nodeCount":12}'),
      ],
    });

    expect(later[0]).toEqual(first[0]);
  });

  it('tells the model that nothing about the phone arrives unasked', () => {
    // The screen used to be injected into every request. Now the model has to ask, so the prompt has to say so —
    // otherwise it acts on a screen it has never read.
    expect(AGENT_SYSTEM_PROMPT).toMatch(/Nothing about the phone is given to you/i);
    expect(AGENT_SYSTEM_PROMPT).toContain('getUiTree');
  });

  it('describes planning as a tool call, not as a reply', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('createPlan');
    expect(AGENT_SYSTEM_PROMPT).toContain('updatePlan');
    // The old planning prompt asked for `{ "steps": [...] }` in content. Nothing should ask for that now.
    expect(AGENT_SYSTEM_PROMPT).not.toContain('"steps"');
  });

  it('describes the perception chain in order of cost', () => {
    // The failure to avoid is a model reaching for the most powerful-sounding option first. Each rung has to say
    // what it costs, and the cheap one has to come first (ADR 0013).
    const tree = AGENT_SYSTEM_PROMPT.indexOf('getUiTree — the element hierarchy');
    const ocr = AGENT_SYSTEM_PROMPT.indexOf('runOcr');
    const screenshot = AGENT_SYSTEM_PROMPT.indexOf('takeScreenshot, then reasoning');

    expect(tree).toBeGreaterThan(-1);
    expect(ocr).toBeGreaterThan(tree);
    expect(screenshot).toBeGreaterThan(ocr);
    expect(AGENT_SYSTEM_PROMPT).toMatch(/only descend when the one above genuinely fails/i);
  });

  it('warns that OCR reads pixels and can misread', () => {
    expect(AGENT_SYSTEM_PROMPT).toMatch(/misread/i);
    expect(AGENT_SYSTEM_PROMPT).toMatch(/check the text it actually read/i);
  });

  it('says that answering a question is a complete response', () => {
    // Without this a question about the screen becomes a sequence of actions, because nothing tells the model
    // that a reply counts as finishing.
    expect(AGENT_SYSTEM_PROMPT).toMatch(/Answering is a complete response/i);
  });

  it('ranks selectors by durability', () => {
    const resourceId = AGENT_SYSTEM_PROMPT.indexOf('resourceId');
    const text = AGENT_SYSTEM_PROMPT.indexOf('3. text');
    const coordinates = AGENT_SYSTEM_PROMPT.indexOf('4. coordinates');

    expect(resourceId).toBeLessThan(text);
    expect(text).toBeLessThan(coordinates);
  });

  it('says whose device this is', () => {
    // The safety framing is load-bearing rather than decorative: the model is acting on someone's real messages,
    // contacts and money, and "prefer doing nothing" is the instruction that makes it stop rather than guess.
    expect(AGENT_SYSTEM_PROMPT).toMatch(/belongs to a real person/i);
    expect(AGENT_SYSTEM_PROMPT).toMatch(/Prefer doing nothing to doing the wrong thing/i);
  });

  it('is structured with tags rather than markdown headings', () => {
    // Screen content is arbitrary third-party text, so a heading is not a delimiter: a UI tree node reading
    // "## Goal" is indistinguishable from a prompt's own heading. A tag pair has an explicit end.
    for (const tag of [
      'role',
      'how_to_work',
      'planning',
      'identifying_elements',
      'seeing_the_screen',
      'finishing',
      'safety',
    ]) {
      expect(AGENT_SYSTEM_PROMPT).toContain(`<${tag}>`);
      expect(AGENT_SYSTEM_PROMPT).toContain(`</${tag}>`);
    }
  });
});

describe('the conversation', () => {
  it('is passed through in order, untouched', () => {
    const conversation = [
      userMessage('send Robert a message'),
      assistantToolCallMessage({
        content: null,
        toolCalls: [{ id: 'call_1', name: 'openApp', arguments: '{"packageName":"com.whatsapp"}' }],
      }),
      toolMessage('call_1', 'Done.'),
    ];

    const messages = buildAgentContext({ messages: conversation });

    expect(messages.slice(1)).toEqual(conversation);
  });

  it('sends the user message exactly as typed', () => {
    // It used to be a generated document with the goal buried in it, plus the previous exchange pasted in as
    // "Earlier in this conversation: User: … You: …". The user's message is now the user's message.
    const goal = 'call 0000';

    const messages = buildAgentContext({ messages: [userMessage(goal)] });

    expect(messages[1]).toEqual({ role: 'user', content: goal });
  });

  it('is two messages on the first turn and grows from there', () => {
    expect(buildAgentContext({ messages: [userMessage('hi')] })).toHaveLength(2);

    expect(
      buildAgentContext({
        messages: [
          userMessage('hi'),
          assistantToolCallMessage({
            toolCalls: [{ id: 'c1', name: 'getUiTree', arguments: '{}' }],
          }),
          toolMessage('c1', '{}'),
        ],
      }),
    ).toHaveLength(4);
  });

  it('keeps an assistant turn adjacent to the answers that follow it', () => {
    // Not a property of this function so much as a property it must not break: a provider rejects the whole
    // request if a tool message's id matches no preceding assistant call.
    const messages = buildAgentContext({
      messages: [
        userMessage('go'),
        assistantToolCallMessage({
          toolCalls: [
            { id: 'c1', name: 'getUiTree', arguments: '{}' },
            { id: 'c2', name: 'getCurrentScreen', arguments: '{}' },
          ],
        }),
        toolMessage('c1', '{}'),
        toolMessage('c2', '{}'),
      ],
    });

    expect(messages[2]!.toolCalls).toHaveLength(2);
    expect(messages[3]!.toolCallId).toBe('c1');
    expect(messages[4]!.toolCallId).toBe('c2');
  });
});

describe('what is no longer sent', () => {
  /**
   * The conversation only, deliberately excluding the system message.
   *
   * These tests are about **injection** — things the old builder pasted into the request around the user's own
   * words. The system prompt legitimately contains tagged sections of its own, including `<planning>`, so
   * including it here would make the assertions test the wrong thing.
   */
  const rendered = (): string => {
    const messages = buildAgentContext({
      messages: [
        userMessage('send Robert a message'),
        assistantToolCallMessage({
          toolCalls: [{ id: 'c1', name: 'getUiTree', arguments: '{}' }],
        }),
        toolMessage('c1', '{"nodeCount":12}'),
      ],
    });

    return messages
      .slice(1)
      .map((message) => (typeof message.content === 'string' ? message.content : ''))
      .join('\n');
  };

  it('does not restate the tool list in the text', () => {
    // It was sent twice: as prose in a <tools> block and as real function schemas. The prose copy was resent on
    // every turn, and only the schemas were ever what the model called against.
    expect(rendered()).not.toContain('<tools>');
  });

  it('does not inject the screen', () => {
    expect(rendered()).not.toContain('<screen');
  });

  it('does not inject a step budget', () => {
    // A per-turn number cannot exist in a stable system prompt, and the loop enforces the ceiling regardless.
    expect(rendered()).not.toContain('<budget');
  });

  it('does not inject a history block or a plan block', () => {
    // Both were prose summaries of things the conversation now carries as real messages.
    expect(rendered()).not.toContain('<history');
    expect(rendered()).not.toContain('<plan');
  });

  it('does not wrap the goal in a tag', () => {
    expect(rendered()).not.toContain('<goal>');
  });
});
