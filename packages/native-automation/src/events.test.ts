import { describe, expect, it } from 'vitest';

import {
  AUTOMATION_EVENTS,
  EXECUTION_PHASES,
  type ExecutionProgressEvent,
  isAutomationEventName,
} from './events.js';

describe('automation events', () => {
  it('declares the three streamed events', () => {
    expect(AUTOMATION_EVENTS).toEqual([
      'automationUiTreeChanged',
      'automationExecutionProgress',
      'automationStatusChanged',
    ]);
  });

  it('recognises a valid event name', () => {
    expect(isAutomationEventName('automationUiTreeChanged')).toBe(true);
    expect(isAutomationEventName('somethingElse')).toBe(false);
  });

  it('covers the node lifecycle phases the engine reports', () => {
    expect(EXECUTION_PHASES).toEqual(['started', 'progress', 'succeeded', 'failed']);
  });

  it('allows a progress event without a node id', () => {
    // The same channel serves both engines: a workflow step has a node id, an
    // agent step does not.
    const agentStep: ExecutionProgressEvent = {
      phase: 'started',
      tool: 'click',
      timestampEpochMs: 1_700_000_000_000,
    };

    expect(agentStep.nodeId).toBeUndefined();
  });

  it('carries the error code on a failed step', () => {
    const failed: ExecutionProgressEvent = {
      phase: 'failed',
      tool: 'click',
      nodeId: 'click_3',
      errorCode: 'element_not_found',
      timestampEpochMs: 1_700_000_000_000,
    };

    expect(failed.errorCode).toBe('element_not_found');
  });
});
