import { type ExecutionTrace } from '@mobile-automation/execution-recorder';

import { renderWithTheme as render } from '../../../test/renderWithTheme';
import { TraceReviewScreen } from '../TraceReviewScreen';

/**
 * The review screen.
 *
 * A generated workflow drives someone's phone and they did not write it, so what matters here
 * is whether the screen tells them enough to judge it: what was dropped, how durable each step
 * is, and what would stop it running.
 */

const AT = 1_700_000_000_000;

const trace = (overrides: Partial<ExecutionTrace> = {}): ExecutionTrace => ({
  id: 'trace_1',
  runId: 'run_1',
  goal: 'Send Robert a message',
  outcome: 'succeeded',
  startedAtEpochMs: AT,
  finishedAtEpochMs: AT + 5_000,
  steps: [
    {
      index: 1,
      tool: 'openApp',
      arguments: { packageName: 'com.whatsapp' },
      screen: { packageName: 'com.whatsapp', activityName: 'com.whatsapp.HomeActivity' },
      outcome: 'succeeded',
      timestampEpochMs: AT,
      durationMs: 900,
    },
    {
      index: 2,
      tool: 'getUiTree',
      arguments: {},
      screen: { packageName: 'com.whatsapp', activityName: 'com.whatsapp.HomeActivity' },
      outcome: 'succeeded',
      timestampEpochMs: AT + 1_000,
      durationMs: 50,
    },
    {
      index: 3,
      tool: 'click',
      arguments: { selector: { text: 'Send' } },
      screen: { packageName: 'com.whatsapp', activityName: 'com.whatsapp.Conversation' },
      resolvedElement: { resourceId: 'com.whatsapp:id/send', text: 'Send' },
      matchedBy: 'resourceId',
      outcome: 'succeeded',
      timestampEpochMs: AT + 2_000,
      durationMs: 120,
    },
  ],
  ...overrides,
});

const noop = () => {};

describe('TraceReviewScreen', () => {
  it('leads with the goal the run was for', () => {
    const { getByText } = render(
      <TraceReviewScreen trace={trace()} onOpenInBuilder={noop} onCancel={noop} />,
    );

    expect(getByText('Send Robert a message')).toBeTruthy();
  });

  it('says how many steps the workflow has against how many were recorded', () => {
    // The difference is the collapse, and it needs to be visible.
    const { getByText } = render(
      <TraceReviewScreen trace={trace()} onOpenInBuilder={noop} onCancel={noop} />,
    );

    expect(getByText('2 steps')).toBeTruthy();
    expect(getByText(/Recorded 3 actions/)).toBeTruthy();
  });

  it('explains what was left out rather than dropping it silently', () => {
    // A collapse from three steps to two looks like data loss unless explained.
    const { getByText } = render(
      <TraceReviewScreen trace={trace()} onOpenInBuilder={noop} onCancel={noop} />,
    );

    expect(getByText('1 steps left out')).toBeTruthy();
    expect(getByText(/Step 2 \(getUiTree\)/)).toBeTruthy();
  });

  it('names the selector strategy for each generated step', () => {
    // How the user judges whether the workflow will still work next month.
    const { getByText } = render(
      <TraceReviewScreen trace={trace()} onOpenInBuilder={noop} onCancel={noop} />,
    );

    expect(getByText('resourceId')).toBeTruthy();
  });

  it('summarises overall durability', () => {
    const { getByText } = render(
      <TraceReviewScreen trace={trace()} onOpenInBuilder={noop} onCancel={noop} />,
    );

    expect(getByText(/keep working after app updates/)).toBeTruthy();
  });

  it('marks a workflow ready when nothing blocks it', () => {
    const { getByText } = render(
      <TraceReviewScreen trace={trace()} onOpenInBuilder={noop} onCancel={noop} />,
    );

    // Uppercased by a className, so the text node itself is lowercase.
    expect(getByText('ready')).toBeTruthy();
  });

  it('warns about a position-based step without calling the workflow broken', () => {
    const positional = trace({
      steps: [
        {
          index: 1,
          tool: 'click',
          arguments: { selector: { text: 'x' } },
          screen: { packageName: 'com.app', activityName: 'com.app.Main' },
          resolvedElement: { bounds: { left: 1, top: 1, right: 100, bottom: 100 } },
          outcome: 'succeeded',
          timestampEpochMs: AT,
          durationMs: 40,
        },
      ],
    });

    const { getByText } = render(
      <TraceReviewScreen trace={positional} onOpenInBuilder={noop} onCancel={noop} />,
    );

    expect(getByText('Worth checking')).toBeTruthy();
    expect(getByText('ready')).toBeTruthy();
  });

  it('separates a blocking problem from a warning', () => {
    // A run of nothing but observations produces no workflow at all.
    const observationsOnly = trace({
      steps: [
        {
          index: 1,
          tool: 'getUiTree',
          arguments: {},
          screen: { packageName: 'com.app', activityName: 'com.app.Main' },
          outcome: 'succeeded',
          timestampEpochMs: AT,
          durationMs: 40,
        },
      ],
    });

    const { getByText } = render(
      <TraceReviewScreen trace={observationsOnly} onOpenInBuilder={noop} onCancel={noop} />,
    );

    expect(getByText('This would not run')).toBeTruthy();
    expect(getByText('needs work')).toBeTruthy();
  });

  it('lists the variables it extracted, with their recorded defaults', () => {
    const typed = trace({
      steps: [
        {
          index: 1,
          tool: 'typeText',
          arguments: { selector: { resourceId: 'com.app:id/entry' }, text: 'hello' },
          screen: { packageName: 'com.app', activityName: 'com.app.Main' },
          resolvedElement: { resourceId: 'com.app:id/entry' },
          outcome: 'succeeded',
          timestampEpochMs: AT,
          durationMs: 40,
        },
      ],
    });

    const { getByText } = render(
      <TraceReviewScreen trace={typed} onOpenInBuilder={noop} onCancel={noop} />,
    );

    expect(getByText('entry = "hello"')).toBeTruthy();
  });

  it('shows every recorded step, including the ones the workflow does not use', () => {
    const { getByText } = render(
      <TraceReviewScreen trace={trace()} onOpenInBuilder={noop} onCancel={noop} />,
    );

    expect(getByText('What the run did')).toBeTruthy();
    expect(getByText('2. getUiTree')).toBeTruthy();
  });

  it('says nothing is saved yet', () => {
    // The workflow goes to the canvas for editing; saving is a separate decision.
    const { getByText } = render(
      <TraceReviewScreen trace={trace()} onOpenInBuilder={noop} onCancel={noop} />,
    );

    expect(getByText(/Nothing is saved yet/)).toBeTruthy();
  });

  it('reports a failed run as failed', () => {
    const { getByText } = render(
      <TraceReviewScreen
        trace={trace({ outcome: 'failed' })}
        onOpenInBuilder={noop}
        onCancel={noop}
      />,
    );

    expect(getByText(/the run failed/)).toBeTruthy();
  });
});
