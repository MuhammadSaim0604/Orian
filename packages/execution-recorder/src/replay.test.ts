import { describe, expect, it } from 'vitest';

import { generateWorkflow } from './generator';
import { checkReplay, describeReplayCheck } from './replay';
import { type ExecutionStep, type ExecutionTrace } from './schema';

/**
 * Replay checking.
 *
 * The distinction this module exists to hold is between "would run" and "will reproduce the
 * outcome". Only a device can confirm the second. So the tests here check that it reports
 * what it can actually derive, and — just as importantly — that it does not overclaim.
 */

const step = (overrides: Partial<ExecutionStep> = {}): ExecutionStep => ({
  index: 1,
  tool: 'click',
  arguments: { selector: { text: 'Send' } },
  screen: { packageName: 'com.whatsapp', activityName: 'com.whatsapp.Conversation' },
  outcome: 'succeeded',
  timestampEpochMs: 1_700_000_000_000,
  durationMs: 40,
  resolvedElement: { resourceId: 'com.whatsapp:id/send' },
  ...overrides,
});

const trace = (steps: readonly ExecutionStep[]): ExecutionTrace => ({
  id: 'trace_1',
  runId: 'run_1',
  goal: 'Message Robert',
  outcome: 'succeeded',
  steps: steps.map((entry, index) => ({ ...entry, index: index + 1 })),
  startedAtEpochMs: 1_700_000_000_000,
  finishedAtEpochMs: 1_700_000_030_000,
});

const check = (steps: readonly ExecutionStep[]) => {
  const source = trace(steps);
  return checkReplay(source, generateWorkflow(source));
};

describe('a healthy workflow', () => {
  it('passes with no blocking issues', () => {
    const result = check([
      step({ tool: 'openApp', arguments: { packageName: 'com.whatsapp' } }),
      step(),
    ]);

    expect(result.ok).toBe(true);
    expect(result.issues.filter((issue) => issue.blocking)).toEqual([]);
  });

  it('reports coverage against the trace', () => {
    const result = check([
      step({ tool: 'getUiTree', arguments: {} }),
      step(),
      step({ tool: 'typeText', arguments: { selector: { text: 'x' }, text: 'y' } }),
    ]);

    // Two actionable steps became two nodes; the observation is not counted as a loss.
    expect(result.coverage).toEqual({ generated: 2, actionable: 2 });
  });
});

describe('blocking problems', () => {
  it('blocks a workflow with no actions at all', () => {
    const result = check([step({ tool: 'getUiTree', arguments: {} })]);

    expect(result.ok).toBe(false);
    expect(result.issues[0]?.kind).toBe('no-actions');
  });

  it('explains an empty workflow differently when the run did act', () => {
    // "The run did nothing repeatable" and "we could not translate what it did" are different
    // problems for the user.
    const observationsOnly = check([step({ tool: 'getUiTree', arguments: {} })]);

    expect(observationsOnly.issues[0]?.message).toContain('did not complete any repeatable');
  });

  it('blocks a selector with nothing to locate by', () => {
    // The workflow would fail with "element not found", sending the user to look at their
    // phone rather than at their workflow.
    const source = trace([step()]);
    const generation = generateWorkflow(source);

    const broken = {
      ...generation,
      workflow: {
        ...generation.workflow,
        nodes: generation.workflow.nodes.map((node) => ({
          ...node,
          config: { selector: { className: 'android.widget.Button' } },
        })),
      },
    };

    const result = checkReplay(source, broken);

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.kind === 'unresolvable-selector')).toBe(true);
  });
});

describe('warnings', () => {
  it('warns about a position-based selector without blocking it', () => {
    // It will run, and it may well work. The user needs to know it is the step most likely to
    // break later.
    const result = check([
      step({ resolvedElement: { bounds: { left: 1, top: 1, right: 2, bottom: 2 } } }),
    ]);

    const fragile = result.issues.find((issue) => issue.kind === 'fragile-selector');

    expect(fragile).toBeDefined();
    expect(fragile?.blocking).toBe(false);
    expect(result.ok).toBe(true);
  });

  it('warns when a screen change has no wait after it', () => {
    // The commonest reason a generated workflow fails on a cold start: the agent was slow
    // enough not to need a wait, and a workflow is not.
    const result = check([
      step({
        tool: 'click',
        screen: { packageName: 'com.whatsapp', activityName: 'com.whatsapp.HomeActivity' },
      }),
      step({
        tool: 'click',
        screen: { packageName: 'com.whatsapp', activityName: 'com.whatsapp.Conversation' },
      }),
    ]);

    expect(result.issues.some((issue) => issue.kind === 'missing-wait')).toBe(true);
  });

  it('does not warn about a missing wait when the screen did not change', () => {
    const result = check([step(), step()]);

    expect(result.issues.some((issue) => issue.kind === 'missing-wait')).toBe(false);
  });

  it('does not warn when a wait is already there', () => {
    const result = check([
      step({
        tool: 'click',
        screen: { packageName: 'com.whatsapp', activityName: 'com.whatsapp.HomeActivity' },
      }),
      step({
        tool: 'waitForElement',
        arguments: { selector: { text: 'Robert' } },
        screen: { packageName: 'com.whatsapp', activityName: 'com.whatsapp.Conversation' },
      }),
    ]);

    expect(result.issues.some((issue) => issue.kind === 'missing-wait')).toBe(false);
  });

  it('warns about a step that succeeded but did not become a node', () => {
    // A real loss rather than a collapse, and the user should know before saving.
    const source = trace([step(), step({ tool: 'click' })]);
    const generation = generateWorkflow(source);

    const truncated = {
      ...generation,
      workflow: { ...generation.workflow, nodes: [generation.workflow.nodes[0]!], edges: [] },
      origins: [generation.origins[0]!],
    };

    const result = checkReplay(source, truncated);

    expect(result.issues.some((issue) => issue.kind === 'lost-step')).toBe(true);
  });

  it('warns when a selector expects a screen the run never visited', () => {
    const source = trace([step()]);
    const generation = generateWorkflow(source);

    const wrongScreen = {
      ...generation,
      workflow: {
        ...generation.workflow,
        nodes: generation.workflow.nodes.map((node) => ({
          ...node,
          config: {
            selector: { resourceId: 'com.whatsapp:id/send', activityName: 'com.other.Screen' },
          },
        })),
      },
    };

    const result = checkReplay(source, wrongScreen);

    expect(result.issues.some((issue) => issue.kind === 'screen-mismatch')).toBe(true);
  });
});

describe('describeReplayCheck', () => {
  it('leads with blocking problems when there are any', () => {
    const result = check([step({ tool: 'getUiTree', arguments: {} })]);

    expect(describeReplayCheck(result)).toContain('would stop this workflow running');
  });

  it('says a clean workflow is ready', () => {
    const result = check([step({ tool: 'openApp', arguments: { packageName: 'com.whatsapp' } })]);

    expect(describeReplayCheck(result)).toContain('ready to replay');
  });

  it('counts warnings without calling them failures', () => {
    const result = check([
      step({ resolvedElement: { bounds: { left: 1, top: 1, right: 2, bottom: 2 } } }),
    ]);

    expect(describeReplayCheck(result)).toContain('worth checking');
  });
});
