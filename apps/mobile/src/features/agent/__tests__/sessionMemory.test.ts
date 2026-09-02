import { messageForEvent } from '../sessionMemory';

/**
 * Turning a run's events into a transcript.
 *
 * This decides what a conversation looks like tomorrow, and it has a failure mode worse than being wrong:
 * persisting everything buries the conversation in per-step churn, so the user cannot find what actually
 * happened.
 *
 * The tests for rebuilding *memory* from a transcript went with the code. The model now replays its real
 * messages (`conversationStorage.ts`) rather than having its own history described back to it.
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
