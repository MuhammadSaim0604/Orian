/**
 * Reasoning must not arrive twice, and must not arrive as a chat bubble.
 *
 * Both were reported from the device: the final response rendered as two identical bubbles, and the model's
 * thinking appeared in the conversation as ordinary assistant messages several times longer than the answer.
 *
 * The duplication was in the loop rather than the renderer, which is why there is a test in `packages/ai-agent`
 * as well: `thinking` used to be emitted before the no-tool-call check, so when the model replied with prose and
 * no tool call, that same prose was emitted as reasoning **and** delivered as the run's summary.
 */

import { messageForEvent } from '../sessionMemory';

const base = { runId: 'run_1', timestampEpochMs: 1_700_000_000_000 };

describe('reasoning is not the agent speaking', () => {
  it('stores thinking as an event, not an assistant message', () => {
    // The whole cause of the bubbles. An `assistant` role is what the renderer draws as speech.
    const message = messageForEvent({
      ...base,
      type: 'thinking',
      step: 1,
      content: 'I should tap Send',
    });

    expect(message?.role).toBe('event');
  });

  it('tags it so the renderer can pick the strip', () => {
    const message = messageForEvent({ ...base, type: 'thinking', step: 1, content: 'Reasoning' });

    expect(message?.detail).toEqual({ kind: 'thinking' });
  });

  it('still drops an empty thought', () => {
    expect(messageForEvent({ ...base, type: 'thinking', step: 1, content: '   ' })).toBeNull();
  });
});

describe('the final response is the agent speaking', () => {
  it('stores the summary as an assistant message', () => {
    // The one thing that *should* be a bubble.
    const message = messageForEvent({
      ...base,
      type: 'runFinished',
      outcome: 'succeeded',
      stepsTaken: 3,
      durationMs: 900,
      summary: 'Sent the message.',
    });

    expect(message?.role).toBe('assistant');
    expect(message?.text).toBe('Sent the message.');
  });
});

describe('a plan is a structured object', () => {
  it('stores the steps, not just the joined sentence', () => {
    // The timeline needs the steps individually. Storing only the arrow-joined text is what forced the paragraph
    // rendering the device pass objected to.
    const message = messageForEvent({
      ...base,
      type: 'planned',
      steps: ['Open WhatsApp', 'Find Robert'],
      isReplan: false,
    });

    expect(message?.detail).toEqual({
      kind: 'plan',
      steps: ['Open WhatsApp', 'Find Robert'],
      isReplan: false,
    });
  });

  it('keeps readable text alongside the structure', () => {
    // What a screen reader announces, and what any consumer without a timeline renderer would show.
    const message = messageForEvent({
      ...base,
      type: 'planned',
      steps: ['One', 'Two'],
      isReplan: false,
    });

    expect(message?.text).toContain('One');
    expect(message?.text).toContain('Two');
  });

  it('marks a replan', () => {
    const message = messageForEvent({
      ...base,
      type: 'planned',
      steps: ['Try search instead'],
      isReplan: true,
    });

    expect(message?.text).toContain('New plan');
    expect((message?.detail as { isReplan?: boolean }).isReplan).toBe(true);
  });
});

describe('a change of approach', () => {
  it('is tagged so it renders with its own mark rather than as plain narration', () => {
    const message = messageForEvent({
      ...base,
      type: 'replanning',
      reason: 'the button was not there',
      stepsTaken: 2,
    });

    expect(message?.detail).toEqual({ kind: 'replan' });
    expect(message?.text).toContain('the button was not there');
  });
});
