import { describe, expect, it } from 'vitest';

import {
  ExecutionStepSchema,
  ExecutionTraceSchema,
  OBSERVATION_TOOLS,
  isGeneratableStep,
  isObservationTool,
} from './schema';

const step = (overrides: Record<string, unknown> = {}) => ({
  index: 1,
  tool: 'click',
  arguments: { selector: { text: 'Send' } },
  screen: { packageName: 'com.whatsapp', activityName: 'com.whatsapp.Conversation' },
  outcome: 'succeeded',
  timestampEpochMs: 1_700_000_000_000,
  durationMs: 40,
  ...overrides,
});

describe('ExecutionStepSchema', () => {
  it('accepts a minimal recorded step', () => {
    expect(ExecutionStepSchema.safeParse(step()).success).toBe(true);
  });

  it('accepts the full shape from Data_Models', () => {
    const result = ExecutionStepSchema.safeParse(
      step({
        uiTreeBefore: { root: {} },
        screenshotPath: '/data/captures/3.png',
        resolvedElement: {
          resourceId: 'com.whatsapp:id/send',
          text: 'Send',
          bounds: { left: 900, top: 1_800, right: 1_050, bottom: 1_950 },
          strategy: 'resourceId',
          clickable: true,
        },
        matchedBy: 'resourceId',
        result: { ok: true },
        screenAfter: 'com.whatsapp/Conversation',
      }),
    );

    expect(result.success).toBe(true);
  });

  it('allows an unknown screen, since the service cannot always tell', () => {
    expect(
      ExecutionStepSchema.safeParse(step({ screen: { packageName: null, activityName: null } }))
        .success,
    ).toBe(true);
  });

  it('rejects a step with no tool', () => {
    expect(ExecutionStepSchema.safeParse(step({ tool: '' })).success).toBe(false);
  });

  it('rejects a zero or negative index, since steps are numbered from one', () => {
    expect(ExecutionStepSchema.safeParse(step({ index: 0 })).success).toBe(false);
  });

  it('rejects an unknown outcome', () => {
    expect(ExecutionStepSchema.safeParse(step({ outcome: 'maybe' })).success).toBe(false);
  });

  it('keeps a screenshot as a path, never as bytes', () => {
    // Inline images would make a twenty-step trace tens of megabytes in one database row.
    const parsed = ExecutionStepSchema.parse(step({ screenshotPath: '/data/x.png' }));

    expect(parsed.screenshotPath).toBe('/data/x.png');
  });

  it('records why a step failed', () => {
    const parsed = ExecutionStepSchema.parse(
      step({ outcome: 'failed', error: 'Element not found', errorCode: 'element_not_found' }),
    );

    expect(parsed.error).toBe('Element not found');
    expect(parsed.errorCode).toBe('element_not_found');
  });
});

describe('ExecutionTraceSchema', () => {
  const trace = (overrides: Record<string, unknown> = {}) => ({
    id: 'trace_1',
    runId: 'run_1',
    goal: 'Message Robert',
    outcome: 'succeeded',
    steps: [step()],
    startedAtEpochMs: 1_700_000_000_000,
    finishedAtEpochMs: 1_700_000_010_000,
    ...overrides,
  });

  it('accepts a complete trace', () => {
    expect(ExecutionTraceSchema.safeParse(trace()).success).toBe(true);
  });

  it('requires a goal, since a generated workflow needs a meaningful name', () => {
    expect(ExecutionTraceSchema.safeParse(trace({ goal: '' })).success).toBe(false);
  });

  it('accepts a trace with no steps', () => {
    // A run that failed before acting still produced a trace worth keeping.
    expect(ExecutionTraceSchema.safeParse(trace({ steps: [] })).success).toBe(true);
  });

  it('accepts every run outcome the agent can report', () => {
    for (const outcome of ['succeeded', 'failed', 'cancelled', 'exhausted']) {
      expect(ExecutionTraceSchema.safeParse(trace({ outcome })).success).toBe(true);
    }
  });

  it('keeps the model, for reproducing a puzzling trace', () => {
    const parsed = ExecutionTraceSchema.parse(trace({ model: 'gpt-4o-mini' }));

    expect(parsed.model).toBe('gpt-4o-mini');
  });
});

describe('observation tools', () => {
  it('treats screen reads as observations', () => {
    expect(isObservationTool('getUiTree')).toBe(true);
    expect(isObservationTool('takeScreenshot')).toBe(true);
    expect(isObservationTool('findElement')).toBe(true);
  });

  it('does not treat waitForElement as an observation', () => {
    // It looks like one but is load-bearing: removing it produces a workflow that works
    // replayed slowly and fails on a cold start.
    expect(isObservationTool('waitForElement')).toBe(false);
    expect(OBSERVATION_TOOLS).not.toContain('waitForElement');
  });

  it('does not treat an action as an observation', () => {
    expect(isObservationTool('click')).toBe(false);
    expect(isObservationTool('typeText')).toBe(false);
  });
});

describe('isGeneratableStep', () => {
  it('accepts a successful action', () => {
    expect(isGeneratableStep(ExecutionStepSchema.parse(step()))).toBe(true);
  });

  it('rejects an observation', () => {
    expect(isGeneratableStep(ExecutionStepSchema.parse(step({ tool: 'getUiTree' })))).toBe(false);
  });

  it('rejects a failed step', () => {
    // Replaying it would reproduce the failure rather than the outcome.
    expect(isGeneratableStep(ExecutionStepSchema.parse(step({ outcome: 'failed' })))).toBe(false);
  });

  it('accepts a wait', () => {
    expect(isGeneratableStep(ExecutionStepSchema.parse(step({ tool: 'waitForElement' })))).toBe(
      true,
    );
  });
});
