import { describe, expect, it } from 'vitest';

import {
  ExecutionRecorder,
  MAX_RESULT_CHARS,
  MAX_TRACE_STEPS,
  type ToolExecutedLike,
  describeScreenIdentity,
} from './recorder';
import { ExecutionTraceSchema } from './schema';

const executed = (overrides: Partial<ToolExecutedLike> = {}): ToolExecutedLike => ({
  runId: 'run_1',
  step: 1,
  tool: 'click',
  arguments: { selector: { text: 'Send' } },
  outcome: 'succeeded',
  durationMs: 40,
  packageName: 'com.whatsapp',
  activityName: 'com.whatsapp.Conversation',
  uiTreeBefore: { root: { children: [] } },
  timestampEpochMs: 1_700_000_000_000,
  ...overrides,
});

const started = { runId: 'run_1', goal: 'Message Robert', timestampEpochMs: 1_700_000_000_000 };
const finished = {
  outcome: 'succeeded' as const,
  summary: 'Sent',
  timestampEpochMs: 1_700_000_010_000,
};

describe('recording a run', () => {
  it('produces a trace that validates against the schema', () => {
    // The trace is persisted and read back by later versions, so a malformed one must be
    // caught here rather than at load time.
    const recorder = new ExecutionRecorder();

    recorder.start(started);
    recorder.record(executed());
    const trace = recorder.finish(finished);

    expect(ExecutionTraceSchema.safeParse(trace).success).toBe(true);
  });

  it('carries the goal and the model through', () => {
    const recorder = new ExecutionRecorder();

    recorder.start({ ...started, model: 'gpt-4o-mini' });
    const trace = recorder.finish(finished);

    expect(trace?.goal).toBe('Message Robert');
    expect(trace?.model).toBe('gpt-4o-mini');
  });

  it('numbers steps contiguously from one', () => {
    // Numbered by position rather than by the agent's step number, so indices stay
    // contiguous even if an event were dropped.
    const recorder = new ExecutionRecorder();

    recorder.start(started);
    recorder.record(executed({ step: 5 }));
    recorder.record(executed({ step: 9 }));

    expect(recorder.steps.map((step) => step.index)).toEqual([1, 2]);
  });

  it('records the screen a step happened on', () => {
    const recorder = new ExecutionRecorder();

    recorder.start(started);
    recorder.record(executed());

    expect(recorder.steps[0]?.screen).toEqual({
      packageName: 'com.whatsapp',
      activityName: 'com.whatsapp.Conversation',
    });
  });

  it('keeps the UI tree from before the action', () => {
    // What lets the generator choose a better selector than the agent used.
    const recorder = new ExecutionRecorder();

    recorder.start(started);
    recorder.record(executed());

    expect(recorder.steps[0]?.uiTreeBefore).toEqual({ root: { children: [] } });
  });

  it('records a failure as richly as a success', () => {
    // The failed step is the one a person most wants to look at.
    const recorder = new ExecutionRecorder();

    recorder.start(started);
    recorder.record(
      executed({ outcome: 'failed', error: 'not found', errorCode: 'element_not_found' }),
    );

    const step = recorder.steps[0]!;

    expect(step.outcome).toBe('failed');
    expect(step.error).toBe('not found');
    expect(step.uiTreeBefore).toBeDefined();
  });

  it('reports the completed trace', () => {
    const recorder = new ExecutionRecorder();

    recorder.start(started);
    recorder.finish(finished);

    expect(recorder.result?.outcome).toBe('succeeded');
    expect(recorder.isRecording).toBe(false);
  });

  it('exposes steps while the run is still going, for a live view', () => {
    const recorder = new ExecutionRecorder();

    recorder.start(started);
    recorder.record(executed());

    expect(recorder.isRecording).toBe(true);
    expect(recorder.steps).toHaveLength(1);
  });
});

describe('resolved elements', () => {
  it('captures the element and how it matched', () => {
    // The single most valuable field for generation.
    const recorder = new ExecutionRecorder();

    recorder.start(started);
    recorder.record(
      executed({
        resolvedElement: {
          resourceId: 'com.whatsapp:id/send',
          text: 'Send',
          strategy: 'resourceId',
          clickable: true,
          bounds: { left: 900, top: 1_800, right: 1_050, bottom: 1_950 },
        },
        matchedBy: 'resourceId',
      }),
    );

    const step = recorder.steps[0]!;

    expect(step.resolvedElement?.resourceId).toBe('com.whatsapp:id/send');
    expect(step.resolvedElement?.bounds).toEqual({
      left: 900,
      top: 1_800,
      right: 1_050,
      bottom: 1_950,
    });
    expect(step.matchedBy).toBe('resourceId');
  });

  it('rounds fractional bounds, since the schema wants integers', () => {
    const recorder = new ExecutionRecorder();

    recorder.start(started);
    recorder.record(
      executed({
        resolvedElement: { bounds: { left: 10.4, top: 20.6, right: 30.5, bottom: 40.2 } },
      }),
    );

    expect(recorder.steps[0]?.resolvedElement?.bounds).toEqual({
      left: 10,
      top: 21,
      right: 31,
      bottom: 40,
    });
  });

  it('ignores a result that is not an element', () => {
    const recorder = new ExecutionRecorder();

    recorder.start(started);
    recorder.record(executed({ resolvedElement: 'not an object' }));

    expect(recorder.steps[0]?.resolvedElement).toBeUndefined();
  });

  it('drops an element with nothing useful in it', () => {
    const recorder = new ExecutionRecorder();

    recorder.start(started);
    recorder.record(executed({ resolvedElement: { unrelated: 1 } }));

    expect(recorder.steps[0]?.resolvedElement).toBeUndefined();
  });
});

describe('trimming results', () => {
  it('keeps a small result whole', () => {
    const recorder = new ExecutionRecorder();

    recorder.start(started);
    recorder.record(executed({ result: { text: 'Send' } }));

    expect(recorder.steps[0]?.result).toEqual({ text: 'Send' });
  });

  it('truncates an enormous result rather than storing a second copy of the screen', () => {
    // A getUiTree result is tens of thousands of characters, and the tree is already stored
    // once per step as uiTreeBefore.
    const recorder = new ExecutionRecorder();

    recorder.start(started);
    recorder.record(
      executed({ result: { nodes: Array.from({ length: 5_000 }, () => ({ text: 'x' })) } }),
    );

    const result = recorder.steps[0]?.result as { truncated?: boolean; preview?: string };

    expect(result.truncated).toBe(true);
    expect(result.preview!.length).toBeLessThan(MAX_RESULT_CHARS + 10);
  });

  it('truncates a long string but keeps its beginning', () => {
    // A partial result still tells a reader what the step returned; dropping it would make
    // the step look like it did nothing.
    const recorder = new ExecutionRecorder();

    recorder.start(started);
    recorder.record(executed({ result: `START${'x'.repeat(10_000)}` }));

    const result = recorder.steps[0]?.result as string;

    expect(result.startsWith('START')).toBe(true);
    expect(result.length).toBeLessThan(MAX_RESULT_CHARS + 10);
  });

  it('leaves a primitive alone', () => {
    const recorder = new ExecutionRecorder();

    recorder.start(started);
    recorder.record(executed({ result: 42 }));

    expect(recorder.steps[0]?.result).toBe(42);
  });

  it('records nothing for a void tool', () => {
    const recorder = new ExecutionRecorder();

    recorder.start(started);
    recorder.record(executed({ result: undefined }));

    expect(recorder.steps[0]?.result).toBeUndefined();
  });
});

describe('robustness', () => {
  it('ignores an event when no trace is open rather than throwing', () => {
    // A recorder attached mid-run must not crash an agent that is driving someone's phone.
    const recorder = new ExecutionRecorder();

    expect(() => recorder.record(executed())).not.toThrow();
    expect(recorder.steps).toEqual([]);
  });

  it('returns null when finishing without having started', () => {
    expect(new ExecutionRecorder().finish(finished)).toBeNull();
  });

  it('caps retained steps, so a runaway run cannot make the trace unwritable', () => {
    const recorder = new ExecutionRecorder();

    recorder.start(started);

    for (let index = 0; index < MAX_TRACE_STEPS + 50; index++) {
      recorder.record(executed());
    }

    expect(recorder.steps).toHaveLength(MAX_TRACE_STEPS);
  });

  it('clears the previous trace when a new run starts', () => {
    const recorder = new ExecutionRecorder();

    recorder.start(started);
    recorder.record(executed());
    recorder.finish(finished);

    recorder.start({ ...started, runId: 'run_2' });

    expect(recorder.steps).toEqual([]);
    expect(recorder.result).toBeNull();
  });

  it('resets completely', () => {
    const recorder = new ExecutionRecorder();

    recorder.start(started);
    recorder.record(executed());
    recorder.reset();

    expect(recorder.isRecording).toBe(false);
    expect(recorder.steps).toEqual([]);
  });
});

describe('describeScreenIdentity', () => {
  it('shortens the activity name', () => {
    expect(
      describeScreenIdentity({
        packageName: 'com.whatsapp',
        activityName: 'com.whatsapp.Conversation',
      }),
    ).toBe('com.whatsapp/Conversation');
  });

  it('falls back to the package when the activity is unknown', () => {
    expect(describeScreenIdentity({ packageName: 'com.whatsapp', activityName: null })).toBe(
      'com.whatsapp',
    );
  });

  it('says so when the screen is unknown entirely', () => {
    expect(describeScreenIdentity({ packageName: null, activityName: null })).toBe(
      'Unknown screen',
    );
  });
});
