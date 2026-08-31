import { type AgentEvent } from '@mobile-automation/ai-agent';

import {
  currentTask,
  storedPlanFrom,
  taskListFrom,
  taskListFromStored,
  taskPositionLabel,
  taskProgress,
} from '../taskList';

/**
 * The task list, and where each task has got to.
 *
 * What matters here is that **status is derived from what happened, not claimed**. The loop reports a plan and
 * reports each tool call; nothing in the model's output says "step 3 is done". So progress is inferred, and
 * inferred conservatively — showing less progress than was made is recoverable, while claiming a step finished
 * when it did not is what would mislead someone deciding whether to intervene in a run driving their phone.
 */

const base = { runId: 'run_1', timestampEpochMs: 1_700_000_000_000 };

const planned = (steps: readonly string[], isReplan = false): AgentEvent => ({
  ...base,
  type: 'planned',
  steps: [...steps],
  isReplan,
});

const executed = (outcome: 'succeeded' | 'failed' = 'succeeded', step = 1): AgentEvent => ({
  ...base,
  type: 'toolExecuted',
  step,
  tool: 'click',
  arguments: {},
  outcome,
  error: outcome === 'failed' ? 'element_not_found' : undefined,
  durationMs: 10,
  packageName: null,
  activityName: null,
  uiTreeBefore: null,
  screenshotPathBefore: null,
  screenAfter: null,
});

const finished = (): AgentEvent => ({
  ...base,
  type: 'runFinished',
  outcome: 'succeeded',
  stepsTaken: 2,
  durationMs: 100,
  summary: 'Done.',
});

describe('deriving the list', () => {
  it('is null before a plan exists', () => {
    // The card must not appear as an empty shell while the model is still deciding what to do.
    expect(taskListFrom([])).toBeNull();
  });

  it('is null for an empty plan', () => {
    expect(taskListFrom([planned([])])).toBeNull();
  });

  it('is null for a plan whose steps are all blank', () => {
    // Same defect from the other side: a whitespace-only plan must not produce a card with blank rows.
    expect(taskListFrom([planned(['', '  '])])).toBeNull();
  });

  it('ignores an empty plan that follows a real one', () => {
    // A failed replan returns an empty list. Letting it through would wipe out the plan the agent is still working
    // to, so the card would empty mid-run.
    const list = taskListFrom([planned(['Open WhatsApp', 'Find Robert']), planned([], true)]);

    expect(list?.tasks).toHaveLength(2);
    expect(list?.isReplan).toBe(false);
  });

  it('marks the first task active on a fresh plan', () => {
    const list = taskListFrom([planned(['Open WhatsApp', 'Find Robert'])]);

    expect(list?.tasks.map((task) => task.status)).toEqual(['active', 'pending']);
  });

  it('advances on a successful tool call', () => {
    const list = taskListFrom([planned(['Open WhatsApp', 'Find Robert']), executed()]);

    expect(list?.tasks.map((task) => task.status)).toEqual(['done', 'active']);
  });

  it('does not advance on a failed tool call', () => {
    // A failed tap means the agent is still on the same task and about to try something else. Advancing would
    // show the plan racing ahead of the work.
    const list = taskListFrom([planned(['Open WhatsApp', 'Find Robert']), executed('failed')]);

    expect(list?.tasks.map((task) => task.status)).toEqual(['active', 'pending']);
  });

  it('keeps the last task active rather than running off the end', () => {
    // More tool calls than planned steps is normal — a step often takes several taps. The active index must stay
    // inside the list.
    const list = taskListFrom([planned(['One step']), executed(), executed(), executed()]);

    expect(list?.activeIndex).toBe(0);
  });

  it('replaces the list on a replan rather than appending', () => {
    // A replan means the agent decided the previous route was wrong. Showing both plans stacked would suggest
    // twice as much work remains.
    const list = taskListFrom([
      planned(['Old one', 'Old two']),
      executed(),
      planned(['New one', 'New two', 'New three'], true),
    ]);

    expect(list?.tasks).toHaveLength(3);
    expect(list?.isReplan).toBe(true);
  });

  it('resets progress on a replan', () => {
    // Counting from the run's start would mark a fresh plan's first steps as already done because earlier tool
    // calls happened — against an entirely different plan.
    const list = taskListFrom([
      planned(['Old one', 'Old two']),
      executed(),
      executed(),
      planned(['New one', 'New two'], true),
    ]);

    expect(list?.tasks.map((task) => task.status)).toEqual(['active', 'pending']);
  });

  it('marks the abandoned tail when the agent announces a change of approach', () => {
    // The window between "changing approach" and the next plan arriving. Showing a stale active step there would
    // claim the agent is still working on something it has given up on.
    const list = taskListFrom([
      planned(['One', 'Two', 'Three']),
      executed(),
      { ...base, type: 'replanning', reason: 'the button was not there', stepsTaken: 1 },
    ]);

    expect(list?.tasks.map((task) => task.status)).toEqual(['done', 'abandoned', 'abandoned']);
  });

  it('has no active task once the run has finished', () => {
    const list = taskListFrom([planned(['One', 'Two']), executed(), finished()]);

    expect(list?.activeIndex).toBeNull();
  });

  it('marks unreached tasks as skipped rather than pending after a run ends', () => {
    // Pending suggests it is still coming. The run is over.
    const list = taskListFrom([planned(['One', 'Two', 'Three']), executed(), finished()]);

    expect(list?.tasks.map((task) => task.status)).toEqual(['done', 'skipped', 'skipped']);
  });
});

describe('summarising for the pinned card', () => {
  it('reports the active task', () => {
    const list = taskListFrom([planned(['Open WhatsApp', 'Find Robert']), executed()])!;

    expect(currentTask(list)?.text).toBe('Find Robert');
  });

  it('reports no current task when finished', () => {
    const list = taskListFrom([planned(['One']), finished()])!;

    expect(currentTask(list)).toBeNull();
  });

  it('counts only completed tasks towards progress', () => {
    // An active task is in progress. Counting it would show a plan as complete while its last step was still
    // running.
    const list = taskListFrom([planned(['One', 'Two', 'Three', 'Four']), executed()])!;

    expect(taskProgress(list)).toBe(0.25);
  });

  it('reads as a position, not a percentage', () => {
    const list = taskListFrom([planned(['One', 'Two', 'Three']), executed()])!;

    expect(taskPositionLabel(list)).toBe('2 of 3');
  });

  it('does not overrun the list in its label', () => {
    const list = taskListFrom([planned(['Only one']), executed(), executed()])!;

    expect(taskPositionLabel(list)).toBe('1 of 1');
  });
});

describe('a plan stored in a transcript', () => {
  it('reads structured steps back', () => {
    const plan = storedPlanFrom({ kind: 'plan', steps: ['One', 'Two'], isReplan: false });

    expect(plan?.steps).toEqual(['One', 'Two']);
  });

  it('is null for detail that is not a plan', () => {
    expect(storedPlanFrom({ kind: 'thinking' })).toBeNull();
    expect(storedPlanFrom(null)).toBeNull();
    expect(storedPlanFrom('nonsense')).toBeNull();
  });

  it('drops empty steps rather than rendering blank rows', () => {
    const plan = storedPlanFrom({ steps: ['Real', '', '   '] });

    expect(plan?.steps).toEqual(['Real']);
  });

  it('renders an old plan as fully done', () => {
    // A conversation reopened tomorrow must not show yesterday's plan with a step pulsing as though work were
    // still in progress.
    const list = taskListFromStored({ steps: ['One', 'Two'], isReplan: false }, null);

    expect(list.tasks.map((task) => task.status)).toEqual(['done', 'done']);
    expect(list.activeIndex).toBeNull();
  });

  it('uses the live list when the stored plan is the running one', () => {
    // Otherwise the plan card in the transcript and the pinned card above it would disagree about the same plan.
    const live = taskListFrom([planned(['One', 'Two']), executed()])!;

    const list = taskListFromStored({ steps: ['One', 'Two'], isReplan: false }, live);

    expect(list.activeIndex).toBe(1);
  });

  it('does not treat a different plan as the live one', () => {
    const live = taskListFrom([planned(['Something else'])])!;

    const list = taskListFromStored({ steps: ['One', 'Two'], isReplan: false }, live);

    expect(list.tasks.map((task) => task.status)).toEqual(['done', 'done']);
  });
});
