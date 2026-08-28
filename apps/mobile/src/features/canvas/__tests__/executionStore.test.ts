import { type ExecutionEvent } from '@mobile-automation/workflow-engine';

import { useExecutionStore } from '../executionStore';

/**
 * The execution store.
 *
 * Its job is turning the engine's event stream into two things a user can read: a colour per
 * node and a log they can follow. The interesting cases are the ones where an event must not
 * simply be appended - a retry, a failure, and the end of a run.
 */

const base = { executionId: 'exec_1', timestampEpochMs: 1_700_000_000_000 };

const reset = () => useExecutionStore.getState().clear();

const apply = (event: ExecutionEvent) => useExecutionStore.getState().apply(event);

describe('run lifecycle', () => {
  beforeEach(reset);

  it('starts clean', () => {
    const state = useExecutionStore.getState();

    expect(state.running).toBe(false);
    expect(state.log).toEqual([]);
    expect(state.nodeStates).toEqual({});
  });

  it('records the run starting', () => {
    apply({
      ...base,
      type: 'workflowStarted',
      workflowId: 'wf_1',
      workflowName: 'Message Robert',
      nodeCount: 3,
      variables: {},
    });

    expect(useExecutionStore.getState().running).toBe(true);
    expect(useExecutionStore.getState().log[0]?.label).toContain('Message Robert');
  });

  it('clears the previous run when a new one starts', () => {
    // Leaving old node colours on a new run would show green and red against steps that have
    // not executed yet.
    apply({ ...base, type: 'nodeSucceeded', nodeId: 'a', nodeType: 'click', durationMs: 10 });
    useExecutionStore.getState().startRun('exec_2');

    expect(useExecutionStore.getState().nodeStates).toEqual({});
    expect(useExecutionStore.getState().log).toEqual([]);
  });

  it('reports the outcome when the run finishes', () => {
    apply({
      ...base,
      type: 'workflowFinished',
      outcome: 'succeeded',
      durationMs: 1_200,
      stepsRun: 3,
      variables: {},
    });

    const state = useExecutionStore.getState();

    expect(state.running).toBe(false);
    expect(state.outcome).toBe('succeeded');
    expect(state.activeNodeId).toBeNull();
  });

  it('labels a stopped run as stopped rather than failed', () => {
    // The user chose it; calling it a failure would be wrong.
    apply({
      ...base,
      type: 'workflowFinished',
      outcome: 'cancelled',
      durationMs: 100,
      stepsRun: 1,
      variables: {},
    });

    expect(useExecutionStore.getState().log.at(-1)?.label).toBe('Stopped');
  });

  it('keeps the failure reason', () => {
    apply({
      ...base,
      type: 'workflowFinished',
      outcome: 'failed',
      durationMs: 100,
      stepsRun: 2,
      failedNodeId: 'b',
      error: 'Element not found',
      variables: {},
    });

    expect(useExecutionStore.getState().error).toBe('Element not found');
  });
});

describe('node states', () => {
  beforeEach(reset);

  it('marks a node running and tracks it as active', () => {
    apply({
      ...base,
      type: 'nodeStarted',
      nodeId: 'a',
      nodeType: 'click',
      label: 'Tap send',
      attempt: 0,
    });

    const state = useExecutionStore.getState();

    expect(state.nodeStates.a).toBe('running');
    expect(state.activeNodeId).toBe('a');
  });

  it('names the attempt on a retry, so the log does not repeat unexplained', () => {
    apply({
      ...base,
      type: 'nodeStarted',
      nodeId: 'a',
      nodeType: 'click',
      label: 'Tap send',
      attempt: 1,
    });

    expect(useExecutionStore.getState().log[0]?.detail).toContain('attempt 2');
  });

  it('marks success and failure distinctly', () => {
    apply({ ...base, type: 'nodeSucceeded', nodeId: 'a', nodeType: 'click', durationMs: 5 });
    apply({
      ...base,
      type: 'nodeFailed',
      nodeId: 'b',
      nodeType: 'click',
      durationMs: 5,
      error: 'nope',
      retryable: false,
      needsUserAction: false,
      continuing: false,
    });

    const states = useExecutionStore.getState().nodeStates;

    expect(states.a).toBe('succeeded');
    expect(states.b).toBe('failed');
  });

  it('says what failed rather than only marking it failed', () => {
    apply({
      ...base,
      type: 'nodeFailed',
      nodeId: 'b',
      nodeType: 'click',
      durationMs: 5,
      error: 'Element not found: Send',
      retryable: false,
      needsUserAction: false,
      continuing: false,
    });

    expect(useExecutionStore.getState().log[0]?.detail).toBe('Element not found: Send');
  });

  it('records a skipped node, so a gap in the run is explained', () => {
    apply({
      ...base,
      type: 'nodeSkipped',
      nodeId: 'c',
      nodeType: 'click',
      reason: 'branch not taken',
    });

    expect(useExecutionStore.getState().nodeStates.c).toBe('skipped');
    expect(useExecutionStore.getState().log[0]?.detail).toBe('branch not taken');
  });
});

describe('branches and variables', () => {
  beforeEach(reset);

  it('logs which branch was taken', () => {
    apply({
      ...base,
      type: 'branchTaken',
      nodeId: 'gate',
      handle: 'true',
      targetNodeIds: ['b'],
    });

    expect(useExecutionStore.getState().log[0]?.label).toContain('"true"');
  });

  it('tracks a variable change and logs it', () => {
    apply({ ...base, type: 'variableChanged', nodeId: 'a', name: 'count', value: 3 });

    expect(useExecutionStore.getState().variables.count).toBe(3);
    expect(useExecutionStore.getState().log[0]?.label).toBe('count = 3');
  });

  it('takes the final variables from the finish event', () => {
    apply({
      ...base,
      type: 'workflowFinished',
      outcome: 'succeeded',
      durationMs: 10,
      stepsRun: 1,
      variables: { found: true },
    });

    expect(useExecutionStore.getState().variables.found).toBe(true);
  });
});

describe('log bounds', () => {
  beforeEach(reset);

  it('caps retained entries so a long loop cannot grow it without bound', () => {
    // A thousand-iteration loop would otherwise make the log view unscrollable.
    for (let index = 0; index < 700; index++) {
      apply({ ...base, type: 'log', nodeId: 'a', message: `line ${index}` });
    }

    expect(useExecutionStore.getState().log.length).toBeLessThanOrEqual(500);
  });

  it('keeps the newest entries when trimming', () => {
    for (let index = 0; index < 700; index++) {
      apply({ ...base, type: 'log', nodeId: 'a', message: `line ${index}` });
    }

    expect(useExecutionStore.getState().log.at(-1)?.label).toBe('line 699');
  });

  it('gives every entry a unique key', () => {
    // Duplicate keys make React reuse rows and show stale text.
    for (let index = 0; index < 10; index++) {
      apply({ ...base, type: 'log', nodeId: 'a', message: 'same message' });
    }

    const ids = useExecutionStore.getState().log.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
