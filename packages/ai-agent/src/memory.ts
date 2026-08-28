import { type MemoryEntry, type Observation } from '@mobile-automation/prompt-engine';

/**
 * The agent's memory.
 *
 * Two jobs that pull against each other: remember enough that the agent does not repeat
 * itself, while staying inside a context window. The resolution is that **recency wins**
 * - the last few steps describe the screen the agent is looking at now, while the first
 * few describe a screen that is long gone.
 *
 * Deliberately not just an array. Three things need to be derived from history rather
 * than left for the model to notice: whether it is repeating an action, whether it is
 * stuck on one screen, and whether an approach has failed enough times to warrant
 * replanning. A model asked to spot its own loop from a transcript usually does not.
 */

/** One recorded step, as memory holds it. */
export type MemoryStep = MemoryEntry & {
  readonly screenBefore: string | null;
  readonly timestampEpochMs: number;
};

/** Where the agent is now, and how it got here. */
export type MemorySnapshot = {
  readonly steps: readonly MemoryStep[];
  readonly currentObservation: Observation | null;
  readonly plan: readonly string[];
};

/**
 * Number of consecutive failures before the loop should replan rather than retry.
 *
 * Two, not one: a single failure is often a screen that had not finished loading, and
 * replanning on it would throw away a correct plan. Three would waste steps on an
 * approach that is clearly not working.
 */
export const FAILURES_BEFORE_REPLAN = 2;

/**
 * How many identical actions count as a loop.
 *
 * Three, because two can be legitimate - tapping the same "next" button twice is normal.
 * Three identical calls with nothing changing is not.
 */
export const REPEATS_BEFORE_STUCK = 3;

/**
 * How many steps on one screen count as stuck.
 *
 * Higher than the repeat threshold: a screen can legitimately take several actions
 * (tap a field, type, tap another field). Six with no screen change means the agent is
 * not getting anywhere.
 */
export const STEPS_ON_SCREEN_BEFORE_STUCK = 6;

export class AgentMemory {
  private readonly steps: MemoryStep[] = [];
  private observation: Observation | null = null;
  private currentPlan: readonly string[] = [];

  /** Records what the agent can see, before it decides anything. */
  observe(observation: Observation): void {
    this.observation = observation;
  }

  setPlan(plan: readonly string[]): void {
    this.currentPlan = plan;
  }

  get plan(): readonly string[] {
    return this.currentPlan;
  }

  get observation_(): Observation | null {
    return this.observation;
  }

  /** Records an executed tool call and its outcome. */
  record(step: Omit<MemoryStep, 'step' | 'timestampEpochMs'>): MemoryStep {
    const recorded: MemoryStep = {
      ...step,
      step: this.steps.length + 1,
      timestampEpochMs: Date.now(),
    };

    this.steps.push(recorded);
    return recorded;
  }

  get stepCount(): number {
    return this.steps.length;
  }

  /** What the prompt builder consumes. */
  entries(): readonly MemoryEntry[] {
    return this.steps;
  }

  snapshot(): MemorySnapshot {
    return {
      steps: [...this.steps],
      currentObservation: this.observation,
      plan: [...this.currentPlan],
    };
  }

  /**
   * Consecutive failures at the end of history.
   *
   * Consecutive rather than total: an agent that failed once early and has since made
   * progress is fine, while one failing repeatedly right now is not.
   */
  consecutiveFailures(): number {
    let count = 0;

    for (let index = this.steps.length - 1; index >= 0; index--) {
      if (this.steps[index]!.outcome !== 'failed') break;
      count++;
    }

    return count;
  }

  /** Whether the last few failures justify replanning rather than another attempt. */
  shouldReplan(): boolean {
    return this.consecutiveFailures() >= FAILURES_BEFORE_REPLAN;
  }

  /**
   * Whether the agent is going in circles.
   *
   * Two independent signals, because looping shows up in two ways: the same call
   * repeated, or many different calls with the screen never changing. The second is
   * subtler and more common - an agent that keeps trying different selectors on a
   * screen that does not contain what it wants.
   */
  isStuck(): { readonly stuck: boolean; readonly reason: string | null } {
    const repeated = this.repeatedActionCount();
    if (repeated >= REPEATS_BEFORE_STUCK) {
      return {
        stuck: true,
        reason: `the same action has been attempted ${repeated} times with no change`,
      };
    }

    const onScreen = this.stepsOnCurrentScreen();
    if (onScreen >= STEPS_ON_SCREEN_BEFORE_STUCK) {
      return {
        stuck: true,
        reason: `${onScreen} steps have been taken without leaving this screen`,
      };
    }

    return { stuck: false, reason: null };
  }

  /** How many times the most recent action has been repeated identically. */
  private repeatedActionCount(): number {
    const last = this.steps.at(-1);
    if (last === undefined) return 0;

    const signature = actionSignature(last);
    let count = 0;

    for (let index = this.steps.length - 1; index >= 0; index--) {
      if (actionSignature(this.steps[index]!) !== signature) break;
      count++;
    }

    return count;
  }

  /** How many consecutive steps have happened without the screen changing. */
  private stepsOnCurrentScreen(): number {
    // Compared through describeScreen so both sides are the same short form; comparing
    // a raw activityName against a recorded "package/Activity" would never match and
    // the detector would silently never fire.
    const current = describeScreen(this.observation);
    if (current === null) return 0;

    let count = 0;

    for (let index = this.steps.length - 1; index >= 0; index--) {
      const step = this.steps[index]!;
      if ((step.screenAfter ?? null) !== current) break;
      count++;
    }

    return count;
  }

  /**
   * A short account of what has happened, for a replan prompt or the UI.
   *
   * Deliberately not a model call. Summarising history with the model would cost a
   * round trip and a wait at exactly the moment the agent is already struggling, and a
   * mechanical summary of "what was tried and what failed" is what replanning needs
   * anyway.
   */
  summarise(): string {
    if (this.steps.length === 0) return 'Nothing has been done yet.';

    const succeeded = this.steps.filter((step) => step.outcome === 'succeeded');
    const failed = this.steps.filter((step) => step.outcome === 'failed');

    const parts: string[] = [
      `${this.steps.length} step${this.steps.length === 1 ? '' : 's'} taken: ` +
        `${succeeded.length} succeeded, ${failed.length} failed.`,
    ];

    const recentFailures = failed.slice(-3);
    if (recentFailures.length > 0) {
      parts.push(
        'Recent failures: ' +
          recentFailures.map((step) => `${step.tool} (${step.summary})`).join('; ') +
          '.',
      );
    }

    const screen = this.observation?.activityName ?? this.observation?.packageName;
    if (screen != null) parts.push(`Currently on ${screen}.`);

    return parts.join(' ');
  }

  /** Test seam and reset between runs. */
  clear(): void {
    this.steps.length = 0;
    this.observation = null;
    this.currentPlan = [];
  }
}

/**
 * Identifies an action for repeat detection.
 *
 * Tool plus arguments, so tapping two different buttons is not mistaken for a loop
 * while tapping the same one three times is caught.
 */
const actionSignature = (step: MemoryStep): string =>
  `${step.tool}:${JSON.stringify(step.arguments)}`;

/** Describes a screen for memory, in one short line. */
export const describeScreen = (observation: Observation | null): string | null => {
  if (observation === null) return null;
  if (observation.packageName == null) return null;

  return observation.activityName == null
    ? observation.packageName
    : `${observation.packageName}/${shortActivityName(observation.activityName)}`;
};

/** Trims a fully-qualified activity name to its last segment, to save tokens. */
const shortActivityName = (activityName: string): string => {
  const lastDot = activityName.lastIndexOf('.');
  return lastDot === -1 ? activityName : activityName.slice(lastDot + 1);
};
