import { describe, expect, it } from 'vitest';

import { AgentMemory } from './memory';

/**
 * Seeding memory from a previous run in the same session.
 *
 * The mechanism behind per-session memory (Step 4). The requirement is not just "remember more" — a seeded
 * step has to be **indistinguishable from a step taken now** as far as the stuck and replan detectors are
 * concerned, because otherwise the agent cheerfully repeats what it already failed at, which is the exact
 * complaint per-session memory exists to answer.
 *
 * The one place they must differ is the step budget: `maxSteps` bounds what *this* run does, so a follow-up
 * in a long conversation must not start with its budget already spent.
 */
describe('seeding', () => {
  const entry = (overrides: Partial<Parameters<AgentMemory['seed']>[0][number]> = {}) => ({
    step: 1,
    tool: 'click',
    arguments: { selector: { text: 'Send' } },
    outcome: 'succeeded' as const,
    summary: 'Tapped "Send"',
    screenAfter: 'com.whatsapp/ConversationActivity',
    ...overrides,
  });

  it('adds seeded steps to history', () => {
    const memory = new AgentMemory();

    memory.seed([entry(), entry({ tool: 'typeText' })]);

    expect(memory.entries()).toHaveLength(2);
  });

  it('renumbers steps contiguously', () => {
    // Stored numbers came from earlier runs and would restart or jump. The detectors care about order and
    // adjacency, so the numbering has to be a clean sequence.
    const memory = new AgentMemory();

    memory.seed([entry({ step: 7 }), entry({ step: 99 })]);

    expect(memory.entries().map((step) => step.step)).toEqual([1, 2]);
  });

  it('does not count seeded steps against the step budget', () => {
    // The load-bearing distinction. `takenCount` is what the loop bounds; a follow-up whose budget was
    // consumed by history would stop before doing anything.
    const memory = new AgentMemory();

    memory.seed([entry(), entry(), entry()]);

    expect(memory.stepCount).toBe(3);
    expect(memory.takenCount).toBe(0);
    expect(memory.seededCount).toBe(3);
  });

  it('counts steps taken after seeding', () => {
    const memory = new AgentMemory();
    memory.seed([entry(), entry()]);

    memory.record({
      tool: 'click',
      arguments: {},
      outcome: 'succeeded',
      summary: 'Tapped',
      screenBefore: null,
      screenAfter: null,
    });

    expect(memory.takenCount).toBe(1);
    expect(memory.stepCount).toBe(3);
  });

  it('detects a repeat that spans the seam between runs', () => {
    // The case that matters most, and the reason seeded steps are not marked as different: the agent tapped
    // the same thing twice last run, taps it again now, and must be told it is looping rather than trying a
    // fourth time.
    const memory = new AgentMemory();
    const repeated = entry({ outcome: 'failed', summary: 'not found' });

    memory.seed([repeated, repeated]);

    memory.record({
      tool: repeated.tool,
      arguments: repeated.arguments,
      outcome: 'failed',
      summary: 'not found',
      screenBefore: null,
      screenAfter: repeated.screenAfter,
    });

    expect(memory.isStuck().stuck).toBe(true);
  });

  it('replans on failures carried over from the previous run', () => {
    // Two consecutive failures is the replan threshold. If seeded failures did not count, the agent would
    // retry a broken approach a third and fourth time across runs.
    const memory = new AgentMemory();

    memory.seed([
      entry({ outcome: 'failed', summary: 'no such element' }),
      entry({ outcome: 'failed', summary: 'no such element' }),
    ]);

    expect(memory.shouldReplan()).toBe(true);
  });

  it('is not stuck when the seeded history succeeded', () => {
    // The inverse check, so the detectors are not simply always firing after a seed.
    const memory = new AgentMemory();

    memory.seed([entry({ tool: 'click' }), entry({ tool: 'typeText' }), entry({ tool: 'swipe' })]);

    expect(memory.isStuck().stuck).toBe(false);
    expect(memory.shouldReplan()).toBe(false);
  });

  it('gives seeded steps no screen-before', () => {
    // Unknowable, and a guess would make the on-screen detector count a screen the agent was never on.
    const memory = new AgentMemory();

    memory.seed([entry()]);

    expect(memory.snapshot().steps[0]?.screenBefore).toBeNull();
  });

  it('summarises seeded history', () => {
    const memory = new AgentMemory();

    memory.seed([entry(), entry({ outcome: 'failed', summary: 'nope' })]);

    expect(memory.summarise()).toContain('2 steps taken');
  });

  it('clears seeded steps and the seeded count together', () => {
    // A stale seeded count would make `takenCount` negative on the next run.
    const memory = new AgentMemory();
    memory.seed([entry(), entry()]);

    memory.clear();

    expect(memory.stepCount).toBe(0);
    expect(memory.takenCount).toBe(0);
    expect(memory.seededCount).toBe(0);
  });

  it('seeds nothing for an empty list', () => {
    const memory = new AgentMemory();

    memory.seed([]);

    expect(memory.entries()).toHaveLength(0);
  });
});
