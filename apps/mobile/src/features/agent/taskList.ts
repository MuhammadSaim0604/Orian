import { type AgentEvent } from '@mobile-automation/ai-agent';

/**
 * The agent's task list, and where each task has got to.
 *
 * Device testing asked for a proper timeline rather than a paragraph, and that needs a shape the UI can render
 * per step — so the plan is stored as structured tasks with a status each, not as one joined sentence.
 *
 * **Status is derived, never guessed.** The loop reports a plan and reports each tool call, but it does not say
 * "step 3 is done" — nothing in the model's output is trustworthy for that. So progress is inferred from the
 * events that actually happened, and inferred conservatively: only the task the agent is working on is `active`,
 * everything before it is `done`, everything after is `pending`. Claiming a step finished when it did not is
 * worse than showing less progress than was made, because a user watching a phone being driven is reading this
 * to decide whether to intervene.
 */

export type TaskStatus =
  /** Not reached. */
  | 'pending'
  /** The agent is working on this one now. */
  | 'active'
  /** Passed: the agent moved on. */
  | 'done'
  /** The agent gave up on this approach and replanned. */
  | 'abandoned'
  /** The run ended before this task was reached. */
  | 'skipped';

export type Task = {
  readonly text: string;
  readonly status: TaskStatus;
};

export type TaskList = {
  /** The plan's tasks in order. */
  readonly tasks: readonly Task[];
  /** Whether this plan replaced an earlier one, which changes how the card is titled. */
  readonly isReplan: boolean;
  /** Index of the active task, or null when nothing is in progress. */
  readonly activeIndex: number | null;
};

/**
 * The task list implied by a run's events.
 *
 * Rebuilt from the whole event list rather than mutated as events arrive, deliberately. The events are already
 * the record of what happened, and deriving from them means the pinned card, the transcript card and the
 * overlay cannot disagree — there is one function and no state to drift.
 *
 * A replan replaces the list rather than appending to it. That is what a replan *is*: the agent decided the
 * previous route was wrong, and showing both plans stacked would suggest twice as much work remains.
 */
export const taskListFrom = (events: readonly AgentEvent[]): TaskList | null => {
  let steps: readonly string[] | null = null;
  let isReplan = false;

  // Counted since the current plan, so a replan restarts progress. Counting from the run's start would mark
  // tasks in a fresh plan as already done because earlier tool calls happened.
  let toolCallsSincePlan = 0;
  let finished = false;
  let abandonedFrom: number | null = null;

  for (const event of events) {
    switch (event.type) {
      case 'planned': {
        // Blank entries dropped, and an all-blank plan ignored entirely. A model given a conversational message
        // has nothing to plan and returns an empty list; treating that as a plan produced an empty card and, in
        // the transcript, a bare "Plan:" line with nothing after it.
        const cleaned = event.steps.map((step) => step.trim()).filter((step) => step !== '');
        if (cleaned.length === 0) break;

        steps = cleaned;
        isReplan = event.isReplan;
        toolCallsSincePlan = 0;
        abandonedFrom = null;
        break;
      }

      case 'toolExecuted':
        // Only successful calls advance the list. A failed tap means the agent is still on the same task and
        // about to try something else — advancing on failure would show a plan racing ahead of the work.
        if (event.outcome === 'succeeded') toolCallsSincePlan += 1;
        break;

      case 'replanning':
        // Recorded before the new plan arrives, so the moment between "changing approach" and the next plan
        // shows the abandoned tail rather than a stale active step.
        abandonedFrom = toolCallsSincePlan;
        break;

      case 'runFinished':
        finished = true;
        break;

      default:
        break;
    }
  }

  if (steps === null || steps.length === 0) return null;

  const activeIndex = finished ? null : Math.min(toolCallsSincePlan, steps.length - 1);

  const tasks = steps.map(
    (text, index): Task => ({
      text,
      status: statusFor({
        index,
        completed: toolCallsSincePlan,
        total: steps.length,
        finished,
        abandonedFrom,
      }),
    }),
  );

  return { tasks, isReplan, activeIndex };
};

const statusFor = ({
  index,
  completed,
  total,
  finished,
  abandonedFrom,
}: {
  readonly index: number;
  readonly completed: number;
  readonly total: number;
  readonly finished: boolean;
  readonly abandonedFrom: number | null;
}): TaskStatus => {
  if (abandonedFrom !== null && index >= abandonedFrom) return 'abandoned';

  if (index < completed) return 'done';

  if (finished) {
    // A finished run means everything up to the work done is done, and the rest was never reached. `skipped`
    // rather than `pending`, because pending suggests it is still coming.
    return index < total && index >= completed ? 'skipped' : 'done';
  }

  return index === completed ? 'active' : 'pending';
};

/**
 * How far through the list the run is, as a fraction.
 *
 * For the pinned card's progress line. Counts `done` only — an active task is in progress, and counting it
 * would show a plan as complete while its last step was still running.
 */
export const taskProgress = (list: TaskList): number => {
  if (list.tasks.length === 0) return 0;

  const done = list.tasks.filter((task) => task.status === 'done').length;
  return done / list.tasks.length;
};

/** The task worth showing when there is only room for one. */
export const currentTask = (list: TaskList): Task | null => {
  if (list.activeIndex === null) return null;
  return list.tasks[list.activeIndex] ?? null;
};

/** A short "3 of 7" for the pinned card. */
export const taskPositionLabel = (list: TaskList): string => {
  const done = list.tasks.filter((task) => task.status === 'done').length;
  const position = list.activeIndex === null ? done : list.activeIndex + 1;

  return `${Math.min(position, list.tasks.length)} of ${list.tasks.length}`;
};

/**
 * The stored form of a plan, for a transcript message's detail.
 *
 * Persisted as structured tasks so a conversation reopened tomorrow renders the same timeline rather than
 * falling back to a paragraph. Status is **not** persisted: it is derived from the live run, and a stored status
 * would be a second source of truth that went stale the moment the run continued.
 */
export type StoredPlan = {
  readonly steps: readonly string[];
  readonly isReplan: boolean;
};

/** Reads a stored plan out of a message's opaque detail, tolerating anything an older version wrote. */
export const storedPlanFrom = (detail: unknown): StoredPlan | null => {
  if (typeof detail !== 'object' || detail === null) return null;

  const steps = (detail as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return null;

  const texts = steps.filter(
    (step): step is string => typeof step === 'string' && step.trim() !== '',
  );
  if (texts.length === 0) return null;

  return { steps: texts, isReplan: (detail as { isReplan?: unknown }).isReplan === true };
};

/**
 * A stored plan as a task list, given how far the live run has got.
 *
 * A conversation's old plans render with every task `done`, because the run they belonged to is over — showing
 * one as `active` would suggest work still in progress from yesterday.
 */
export const taskListFromStored = (plan: StoredPlan, live: TaskList | null): TaskList => {
  const isLive =
    live !== null &&
    live.tasks.length === plan.steps.length &&
    live.tasks.every((task, index) => task.text === plan.steps[index]);

  if (isLive) return live;

  return {
    tasks: plan.steps.map((text) => ({ text, status: 'done' as const })),
    isReplan: plan.isReplan,
    activeIndex: null,
  };
};
