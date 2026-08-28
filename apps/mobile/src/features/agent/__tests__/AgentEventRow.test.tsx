import { render } from '@testing-library/react-native';

import { AgentEventRow } from '../AgentEventRow';

/**
 * The event row is what a user reads while their phone is being driven, so the tests
 * are about legibility rather than markup: does a failed step say what failed, and is a
 * selector rendered as something a person recognises.
 */

const base = { runId: 'run_1', timestampEpochMs: 1_700_000_000_000 };

describe('AgentEventRow', () => {
  it('shows the goal when a run starts', () => {
    const { getByText } = render(
      <AgentEventRow
        event={{ ...base, type: 'runStarted', goal: 'Message Robert', maxSteps: 40, model: 'm' }}
      />,
    );

    expect(getByText('Message Robert')).toBeTruthy();
  });

  it('numbers the plan steps', () => {
    const { getByText } = render(
      <AgentEventRow
        event={{ ...base, type: 'planned', steps: ['open the app', 'search'], isReplan: false }}
      />,
    );

    expect(getByText('1. open the app\n2. search')).toBeTruthy();
  });

  it('distinguishes a replan from the first plan', () => {
    const { getByText } = render(
      <AgentEventRow event={{ ...base, type: 'planned', steps: ['try again'], isReplan: true }} />,
    );

    expect(getByText('New plan')).toBeTruthy();
  });

  it('describes a tap by what was touched, not by its selector JSON', () => {
    // A selector dumped as JSON is unreadable on a phone.
    const { getByText } = render(
      <AgentEventRow
        event={{
          ...base,
          type: 'toolExecuted',
          step: 3,
          tool: 'click',
          arguments: { selector: { resourceId: 'com.whatsapp:id/send', text: 'Send' } },
          outcome: 'succeeded',
          durationMs: 40,
          packageName: 'com.whatsapp',
          activityName: 'Conversation',
          uiTreeBefore: null,
          screenshotPathBefore: null,
        }}
      />,
    );

    expect(getByText('3. click')).toBeTruthy();
    expect(getByText('"Send"')).toBeTruthy();
  });

  it('says what failed rather than only marking it failed', () => {
    const { getByText } = render(
      <AgentEventRow
        event={{
          ...base,
          type: 'toolExecuted',
          step: 4,
          tool: 'click',
          arguments: { selector: { text: 'Send' } },
          outcome: 'failed',
          durationMs: 40,
          packageName: 'com.whatsapp',
          activityName: 'Conversation',
          uiTreeBefore: null,
          screenshotPathBefore: null,
          error: 'Element not found: Send',
        }}
      />,
    );

    expect(getByText('Element not found: Send')).toBeTruthy();
  });

  it('explains a rejected call, which would otherwise look like a stall', () => {
    const { getByText } = render(
      <AgentEventRow
        event={{
          ...base,
          type: 'toolCallRejected',
          step: 2,
          tool: 'sendWhatsApp',
          reason: 'unknown-tool',
          correction: 'There is no tool called that.',
        }}
      />,
    );

    expect(getByText('Retrying')).toBeTruthy();
    expect(getByText(/unknown-tool/)).toBeTruthy();
  });

  it('reports a stopped run as stopped rather than failed', () => {
    // The user chose it; calling it a failure would be wrong.
    const { getByText } = render(
      <AgentEventRow
        event={{
          ...base,
          type: 'runFinished',
          outcome: 'cancelled',
          stepsTaken: 3,
          durationMs: 1_000,
          summary: 'The run was stopped.',
        }}
      />,
    );

    expect(getByText('Stopped')).toBeTruthy();
  });

  it('labels an exhausted run as giving up', () => {
    const { getByText } = render(
      <AgentEventRow
        event={{
          ...base,
          type: 'runFinished',
          outcome: 'exhausted',
          stepsTaken: 40,
          durationMs: 1_000,
          summary: 'Used all 40 steps.',
        }}
      />,
    );

    expect(getByText('Gave up')).toBeTruthy();
  });

  it('is readable to a screen reader as one label', () => {
    const { getByLabelText } = render(
      <AgentEventRow
        event={{ ...base, type: 'replanning', reason: 'two steps failed', stepsTaken: 4 }}
      />,
    );

    expect(getByLabelText('Changing approach. two steps failed')).toBeTruthy();
  });
});
