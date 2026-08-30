import { contextualGoal, entriesFromMessages, messageForEvent } from '../sessionMemory';
import { type ChatMessage } from '../sessionStorage';

/**
 * The two conversions between a run and its session.
 *
 * These decide what a conversation looks like tomorrow and what the agent remembers about it, and both have a
 * failure mode worse than being wrong: persisting everything buries the conversation in per-step churn, and
 * rebuilding memory from a malformed row corrupts the loop detector, producing a false "you are looping" that
 * stops a run that was working.
 */

const base = { runId: 'run_1', timestampEpochMs: 1_700_000_000_000 };

describe('what gets persisted', () => {
  it('keeps the plan', async () => {
    const message = messageForEvent({
      ...base,
      type: 'planned',
      steps: ['Open WhatsApp', 'Find Robert'],
      isReplan: false,
    });

    expect(message?.role).toBe('event');
    expect(message?.text).toContain('Open WhatsApp');
  });

  it('marks a replan as a new plan', async () => {
    const message = messageForEvent({
      ...base,
      type: 'planned',
      steps: ['Try the search box'],
      isReplan: true,
    });

    expect(message?.text).toContain('New plan');
  });

  it('records a tool call as a tool message, phrased', async () => {
    // Phrased at persist time rather than at render time, so the stored text is already readable and the
    // transcript's wording does not change when the renderer does.
    const message = messageForEvent({
      ...base,
      type: 'toolExecuted',
      step: 1,
      tool: 'click',
      arguments: { selector: { text: 'Send' } },
      outcome: 'succeeded',
      durationMs: 12,
      packageName: 'com.whatsapp',
      activityName: 'Conversation',
      uiTreeBefore: null,
      screenshotPathBefore: null,
    });

    expect(message?.role).toBe('tool');
    expect(message?.text).toBe('Tapped “Send”');
  });

  it('carries the outcome in detail so the row can show it failed', async () => {
    const message = messageForEvent({
      ...base,
      type: 'toolExecuted',
      step: 2,
      tool: 'click',
      arguments: {},
      outcome: 'failed',
      error: 'element_not_found',
      durationMs: 5,
      packageName: null,
      activityName: null,
      uiTreeBefore: null,
      screenshotPathBefore: null,
    });

    expect(message?.detail).toMatchObject({ outcome: 'failed', error: 'element_not_found' });
  });

  it('records the closing summary as the agent speaking', async () => {
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

  it('drops per-step observation churn', async () => {
    // `observed` fires before every single step. Forty rows saying "Looking at the screen" would bury the
    // conversation they are supposed to explain.
    const message = messageForEvent({
      ...base,
      type: 'observed',
      packageName: 'com.whatsapp',
      activityName: null,
      elementCount: 42,
      screenshotPath: null,
    });

    expect(message).toBeNull();
  });

  it('drops a proposed call, since the executed one follows', async () => {
    const message = messageForEvent({
      ...base,
      type: 'toolCallProposed',
      step: 1,
      tool: 'click',
      arguments: {},
    });

    expect(message).toBeNull();
  });

  it('drops an empty thought rather than storing a blank bubble', async () => {
    const message = messageForEvent({ ...base, type: 'thinking', step: 1, content: '   ' });

    expect(message).toBeNull();
  });

  it('does not re-record the user’s own goal', async () => {
    // The composer already wrote it, before the run started — so that it survives a run that fails to begin.
    const message = messageForEvent({
      ...base,
      type: 'runStarted',
      goal: 'Send a message',
      maxSteps: 40,
      model: 'gpt-4o-mini',
    });

    expect(message).toBeNull();
  });
});

describe('rebuilding memory from a transcript', () => {
  const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
    id: 'msg_1',
    sessionId: 'session_1',
    role: 'tool',
    text: 'Tapped “Send”',
    detail: JSON.stringify({
      tool: 'click',
      arguments: { selector: { text: 'Send' } },
      outcome: 'succeeded',
      screenAfter: 'com.whatsapp/Conversation',
    }),
    runId: 'run_1',
    createdAtEpochMs: 1_700_000_000_000,
    ...overrides,
  });

  it('produces a memory entry per tool message', () => {
    expect(entriesFromMessages([message(), message({ id: 'msg_2' })])).toHaveLength(2);
  });

  it('ignores conversation, which is not a record of action', () => {
    // A memory entry *is* a tool call — that is what the stuck and replan detectors reason over. Prose has
    // nothing for them.
    const messages = [
      message({ id: 'a', role: 'user', text: 'Send a message', detail: null }),
      message({ id: 'b', role: 'assistant', text: 'Done.', detail: null }),
      message({ id: 'c', role: 'event', text: 'Plan: …', detail: null }),
    ];

    expect(entriesFromMessages(messages)).toHaveLength(0);
  });

  it('renumbers steps contiguously', () => {
    const entries = entriesFromMessages([message(), message({ id: 'msg_2' })]);

    expect(entries.map((entry) => entry.step)).toEqual([1, 2]);
  });

  it('carries the tool and arguments, which is what repeat detection compares', () => {
    const entries = entriesFromMessages([message()]);

    expect(entries[0]?.tool).toBe('click');
    expect(entries[0]?.arguments).toEqual({ selector: { text: 'Send' } });
  });

  it('skips a message with malformed detail rather than inventing an entry', () => {
    // An entry with a guessed tool name would corrupt the repeat detector, and a false "you are looping" is
    // worse than a missing step.
    expect(entriesFromMessages([message({ detail: 'not json' })])).toHaveLength(0);
  });

  it('skips a message with no tool name', () => {
    expect(
      entriesFromMessages([message({ detail: JSON.stringify({ outcome: 'succeeded' }) })]),
    ).toHaveLength(0);
  });

  it('treats an unrecorded outcome as a failure', () => {
    // The safer direction: a past failure remembered as a success would have the agent repeat it confidently.
    const entries = entriesFromMessages([
      message({ detail: JSON.stringify({ tool: 'click', arguments: {} }) }),
    ]);

    expect(entries[0]?.outcome).toBe('failed');
  });

  it('defaults absent arguments to an empty object', () => {
    const entries = entriesFromMessages([
      message({ detail: JSON.stringify({ tool: 'pressBack', outcome: 'succeeded' }) }),
    ]);

    expect(entries[0]?.arguments).toEqual({});
  });
});

describe('folding context into the goal', () => {
  const chat = (role: ChatMessage['role'], text: string, id: string): ChatMessage => ({
    id,
    sessionId: 'session_1',
    role,
    text,
    detail: null,
    runId: null,
    createdAtEpochMs: 1,
  });

  it('returns the goal unchanged for a fresh conversation', () => {
    expect(contextualGoal('Send a message', [])).toBe('Send a message');
  });

  it('includes the preceding exchange', () => {
    // The loop takes one goal string, so "now do the same for Sarah" is meaningless without what came before.
    const goal = contextualGoal('Now do the same for Sarah', [
      chat('user', 'Message Robert that I am late', 'a'),
      chat('assistant', 'Sent the message.', 'b'),
    ]);

    expect(goal).toContain('Message Robert');
    expect(goal).toContain('Now do the same for Sarah');
  });

  it('ignores tool and event rows', () => {
    // Those are in memory already. Repeating them in the goal would double the agent's own history back at it.
    const goal = contextualGoal('Carry on', [chat('tool', 'Tapped “Send”', 'a')]);

    expect(goal).toBe('Carry on');
  });

  it('keeps only the recent turns', () => {
    // A goal that grew into a full transcript would crowd out the instruction it exists to carry.
    const many = Array.from({ length: 20 }, (_, index) =>
      chat('user', `message ${index}`, `id_${index}`),
    );

    const goal = contextualGoal('Do the thing', many);

    expect(goal).not.toContain('message 0');
    expect(goal).toContain('message 19');
  });
});
