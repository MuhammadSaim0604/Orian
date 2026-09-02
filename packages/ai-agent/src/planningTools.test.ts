import { describe, expect, it } from 'vitest';

import {
  MAX_PLAN_STEPS,
  PLANNING_TOOL_NAMES,
  applyPlanningCall,
  isPlanningTool,
  planningToolsForRequest,
} from './planningTools';

/**
 * Planning as a tool.
 *
 * It used to be a separate model call with its own system prompt and no tool array, whose reply was parsed as
 * `{ "steps": [...] }`. Three problems in one: the first call the user's request met looked nothing like the rest,
 * a plan cost a whole round trip before anything could happen, and asking for JSON in content while tools are
 * attached invites the model to do both or neither.
 */

describe('what these tools are', () => {
  it('names both planning tools', () => {
    expect([...PLANNING_TOOL_NAMES]).toEqual(['createPlan', 'updatePlan']);
    expect(isPlanningTool('createPlan')).toBe(true);
    expect(isPlanningTool('updatePlan')).toBe(true);
  });

  it('does not claim a device tool', () => {
    expect(isPlanningTool('click')).toBe(false);
    expect(isPlanningTool('getUiTree')).toBe(false);
  });

  it('offers them in the shape a request expects', () => {
    const tools = planningToolsForRequest();

    expect(tools.map((tool) => tool.function.name)).toEqual(['createPlan', 'updatePlan']);

    for (const tool of tools) {
      expect(tool.type).toBe('function');
      expect(tool.function.description.length).toBeGreaterThan(40);
      expect(tool.function.parameters).toMatchObject({ type: 'object' });
    }
  });

  it('tells the model when not to plan, in the description', () => {
    // The description is read at the moment the model is deciding whether to call it, which is the most useful
    // place for this. A plan for "call 0000" costs a round trip and shows the user a card restating what they
    // just typed.
    const create = planningToolsForRequest()[0]!.function.description;

    expect(create).toMatch(/do not use it for a single action or a question/i);
    expect(create).toMatch(/Three to six/i);
  });

  it('requires the full step list on an update, not a patch', () => {
    const update = planningToolsForRequest()[1]!.function.description;

    // Whole-list replacement, because a model asked to amend step 3 of a plan it wrote two turns ago gets it
    // wrong often enough to matter — and a mangled plan is worse than a rewritten one.
    expect(update).toMatch(/full list of steps, not just the changed one/i);
  });
});

describe('applying a call', () => {
  it('accepts a plan and reports how many steps landed', () => {
    const result = applyPlanningCall('createPlan', { steps: ['open WhatsApp', 'send it'] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.steps).toEqual(['open WhatsApp', 'send it']);
    expect(result.isReplan).toBe(false);
    expect(result.message).toContain('2 steps');
  });

  it('trims whitespace off each step', () => {
    const result = applyPlanningCall('createPlan', { steps: ['  open WhatsApp  '] });

    expect(result.ok && result.steps).toEqual(['open WhatsApp']);
  });

  it('marks an update as a replan and carries its reason', () => {
    // The reason is what the user reads when the plan they were watching changes underneath them. A silently
    // different list is unsettling.
    const result = applyPlanningCall('updatePlan', {
      steps: ['use the contact list'],
      reason: 'there is no search box on this screen',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.isReplan).toBe(true);
    expect(result.reason).toContain('no search box');
  });

  it('refuses an update with no reason', () => {
    const result = applyPlanningCall('updatePlan', { steps: ['try something else'] });

    expect(result.ok).toBe(false);
  });

  it('refuses an empty plan', () => {
    // An empty plan is not a plan, and it was what produced the bare "Plan:" line with nothing under it.
    expect(applyPlanningCall('createPlan', { steps: [] }).ok).toBe(false);
    expect(applyPlanningCall('createPlan', { steps: [''] }).ok).toBe(false);
  });

  it('refuses an absurdly long plan', () => {
    const steps = Array.from({ length: MAX_PLAN_STEPS + 1 }, (_, index) => `step ${index}`);

    expect(applyPlanningCall('createPlan', { steps }).ok).toBe(false);
  });

  it('refuses an unexpected field', () => {
    // Strict, like every device tool's schema: a model inventing a field is misunderstanding the tool, and
    // dropping it silently would hide that while doing something else.
    expect(applyPlanningCall('createPlan', { steps: ['go'], urgency: 'high' }).ok).toBe(false);
  });

  it('always returns a message, even when it refuses', () => {
    // The rule that makes this safe to call unconditionally: a provider given an assistant `tool_call` with no
    // matching `tool` message rejects the next request outright, so there is no path here that answers nothing.
    for (const bad of [{}, { steps: 'not an array' }, null, 42]) {
      const result = applyPlanningCall('createPlan', bad);

      expect(result.ok).toBe(false);
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it('phrases a refusal as a correction the model can act on', () => {
    const result = applyPlanningCall('createPlan', { steps: [] });

    expect(result.message).toContain('were not valid');
    expect(result.message).toMatch(/call it again/i);
  });
});
