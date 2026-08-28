import { type Observation } from '@mobile-automation/prompt-engine';
import { describe, expect, it } from 'vitest';

import {
  AgentMemory,
  FAILURES_BEFORE_REPLAN,
  REPEATS_BEFORE_STUCK,
  STEPS_ON_SCREEN_BEFORE_STUCK,
  describeScreen,
} from './memory';

const screen = (activity: string): Observation => ({
  packageName: 'com.whatsapp',
  activityName: `com.whatsapp.${activity}`,
  uiTree: { root: {} },
});

const step = (overrides: Partial<Parameters<AgentMemory['record']>[0]> = {}) => ({
  tool: 'click',
  arguments: { selector: { text: 'Send' } },
  outcome: 'succeeded' as const,
  summary: 'tapped',
  screenBefore: 'com.whatsapp/Conversation',
  screenAfter: 'com.whatsapp/Conversation',
  ...overrides,
});

describe('recording', () => {
  it('numbers steps from one', () => {
    const memory = new AgentMemory();

    expect(memory.record(step()).step).toBe(1);
    expect(memory.record(step()).step).toBe(2);
  });

  it('reports how many steps have been taken', () => {
    const memory = new AgentMemory();
    memory.record(step());
    memory.record(step());

    expect(memory.stepCount).toBe(2);
  });

  it('exposes entries for the prompt builder', () => {
    const memory = new AgentMemory();
    memory.record(step({ summary: 'tapped search' }));

    expect(memory.entries()[0]?.summary).toBe('tapped search');
  });

  it('holds the current observation and plan', () => {
    const memory = new AgentMemory();
    memory.observe(screen('HomeActivity'));
    memory.setPlan(['open the app', 'find the contact']);

    const snapshot = memory.snapshot();

    expect(snapshot.currentObservation?.activityName).toContain('HomeActivity');
    expect(snapshot.plan).toEqual(['open the app', 'find the contact']);
  });

  it('clears between runs', () => {
    const memory = new AgentMemory();
    memory.record(step());
    memory.observe(screen('HomeActivity'));
    memory.clear();

    expect(memory.stepCount).toBe(0);
    expect(memory.snapshot().currentObservation).toBeNull();
  });
});

describe('consecutive failures', () => {
  it('counts only the failures at the end', () => {
    // An agent that failed once early and has since progressed is fine; one failing
    // right now is not.
    const memory = new AgentMemory();
    memory.record(step({ outcome: 'failed' }));
    memory.record(step({ outcome: 'succeeded' }));
    memory.record(step({ outcome: 'failed' }));

    expect(memory.consecutiveFailures()).toBe(1);
  });

  it('counts a run of failures', () => {
    const memory = new AgentMemory();
    memory.record(step({ outcome: 'failed' }));
    memory.record(step({ outcome: 'failed' }));

    expect(memory.consecutiveFailures()).toBe(2);
  });

  it('does not replan on a single failure', () => {
    // Often just a screen that had not finished loading; replanning would throw away
    // a correct plan.
    const memory = new AgentMemory();
    memory.record(step({ outcome: 'failed' }));

    expect(memory.shouldReplan()).toBe(false);
  });

  it('replans after two failures in a row', () => {
    const memory = new AgentMemory();
    memory.record(step({ outcome: 'failed' }));
    memory.record(step({ outcome: 'failed' }));

    expect(memory.shouldReplan()).toBe(true);
    expect(FAILURES_BEFORE_REPLAN).toBe(2);
  });

  it('stops replanning once a step succeeds', () => {
    const memory = new AgentMemory();
    memory.record(step({ outcome: 'failed' }));
    memory.record(step({ outcome: 'failed' }));
    memory.record(step({ outcome: 'succeeded' }));

    expect(memory.shouldReplan()).toBe(false);
  });
});

describe('stuck detection', () => {
  it('is not stuck at the start', () => {
    expect(new AgentMemory().isStuck().stuck).toBe(false);
  });

  it('tolerates the same action twice, which can be legitimate', () => {
    // Tapping the same "next" button twice is normal.
    const memory = new AgentMemory();
    memory.record(step());
    memory.record(step());

    expect(memory.isStuck().stuck).toBe(false);
  });

  it('detects the same action three times', () => {
    const memory = new AgentMemory();
    memory.record(step());
    memory.record(step());
    memory.record(step());

    const stuck = memory.isStuck();

    expect(stuck.stuck).toBe(true);
    expect(stuck.reason).toContain('same action');
    expect(REPEATS_BEFORE_STUCK).toBe(3);
  });

  it('does not confuse different actions for a loop', () => {
    const memory = new AgentMemory();
    memory.record(step({ arguments: { selector: { text: 'A' } } }));
    memory.record(step({ arguments: { selector: { text: 'B' } } }));
    memory.record(step({ arguments: { selector: { text: 'C' } } }));

    expect(memory.isStuck().stuck).toBe(false);
  });

  it('detects many steps without leaving a screen', () => {
    // The subtler and more common loop: different selectors tried on a screen that
    // does not contain what the agent wants.
    const memory = new AgentMemory();
    memory.observe(screen('Conversation'));

    for (let index = 0; index < STEPS_ON_SCREEN_BEFORE_STUCK; index++) {
      memory.record(
        step({
          arguments: { selector: { text: `attempt ${index}` } },
          screenAfter: 'com.whatsapp/Conversation',
        }),
      );
    }

    const stuck = memory.isStuck();

    expect(stuck.stuck).toBe(true);
    expect(stuck.reason).toContain('without leaving this screen');
  });

  it('is not stuck when the screen keeps changing', () => {
    const memory = new AgentMemory();
    memory.observe(screen('Conversation'));

    for (let index = 0; index < 10; index++) {
      memory.record(
        step({
          arguments: { selector: { text: `x${index}` } },
          screenAfter: `com.whatsapp/Screen${index}`,
        }),
      );
    }

    expect(memory.isStuck().stuck).toBe(false);
  });

  it('reports no reason when it is not stuck', () => {
    expect(new AgentMemory().isStuck().reason).toBeNull();
  });
});

describe('summarise', () => {
  it('says nothing has happened at the start', () => {
    expect(new AgentMemory().summarise()).toContain('Nothing has been done');
  });

  it('counts successes and failures', () => {
    const memory = new AgentMemory();
    memory.record(step());
    memory.record(step({ outcome: 'failed' }));

    const summary = memory.summarise();

    expect(summary).toContain('2 steps');
    expect(summary).toContain('1 succeeded');
    expect(summary).toContain('1 failed');
  });

  it('names recent failures, which is what replanning needs', () => {
    const memory = new AgentMemory();
    memory.record(step({ outcome: 'failed', tool: 'click', summary: 'element not found' }));

    expect(memory.summarise()).toContain('element not found');
  });

  it('says where the agent currently is', () => {
    const memory = new AgentMemory();
    memory.observe(screen('Conversation'));
    memory.record(step());

    expect(memory.summarise()).toContain('Conversation');
  });

  it('is mechanical, not a model call', () => {
    // Summarising with the model would cost a round trip and a wait at exactly the
    // moment the agent is already struggling.
    const memory = new AgentMemory();
    memory.record(step());

    // No async, no provider: if this were a model call it could not be synchronous.
    expect(typeof memory.summarise()).toBe('string');
  });
});

describe('describeScreen', () => {
  it('shortens a fully-qualified activity name to save tokens', () => {
    expect(describeScreen(screen('Conversation'))).toBe('com.whatsapp/Conversation');
  });

  it('falls back to the package when there is no activity', () => {
    expect(describeScreen({ packageName: 'com.whatsapp', activityName: null, uiTree: {} })).toBe(
      'com.whatsapp',
    );
  });

  it('returns null when the screen is unknown', () => {
    expect(describeScreen(null)).toBeNull();
    expect(describeScreen({ packageName: null, activityName: null, uiTree: {} })).toBeNull();
  });
});
