/**
 * Deciding whether a goal needs a plan at all.
 *
 * Device testing found the agent producing a task list for "call 0000" — a single tool call, presented as a
 * project. The cost is not only cosmetic: it is a model round trip before the first action, on exactly the
 * goals that should feel immediate, plus a card in the transcript restating what the user just typed.
 *
 * ## Why this is not a model call
 *
 * The obvious implementation is to ask the model "does this need a plan?". That doubles the latency before
 * anything happens on the goals that should feel instant, and it asks a model to be brief about brevity —
 * which it is reliably bad at. So the judgement is made here, from the shape of the request.
 *
 * ## What it counts
 *
 * **Actions, not words.** The signal that matters is how many things the user asked the device to *do*:
 *
 * - "call this number 0000" is one action.
 * - "take a screenshot and tell me about it" is also one action — telling is the reply, not a step.
 * - "send Robert a WhatsApp message saying I'll be late" is several, and the goal says so by naming an app,
 *   a person, and a payload.
 *
 * That distinction is why reporting verbs are held separately from action verbs. An earlier version of this
 * treated a bare "and" as a sequence signal, which planned "take a screenshot and tell me about it" — the
 * exact case that was reported as wrong.
 *
 * ## Which way it is wrong
 *
 * It is a heuristic, so it will misjudge. The design point is the asymmetry. A complex goal misjudged as
 * simple still works: the loop observes, acts, and replans if it gets stuck, because a plan was never what
 * made the agent capable. A simple goal misjudged as complex wastes a call and shows the user a plan for
 * something they described in four words. So the bias is toward *not* planning.
 */

/** Why a goal was judged to need a plan, or not. Exposed for tests and for the trace. */
export type PlanningDecision = {
  readonly needsPlan: boolean;
  /** One short phrase, suitable for a log line or a test assertion. */
  readonly reason: string;
  /** How many device actions the goal appears to ask for. */
  readonly actionCount: number;
};

/**
 * Verbs and nouns that name something done to the device.
 *
 * Occurrences are counted rather than distinct entries, and that is deliberate: "send Robert a **message**"
 * hits twice for one conceptual action, and it should, because naming both a recipient and a payload is what
 * makes it a multi-step task on a real phone. Deduplicating would make the commonest genuinely-multi-step
 * request look like a one-liner.
 */
const ACTION_WORDS = [
  'call',
  'dial',
  'ring',
  'open',
  'launch',
  'start',
  'screenshot',
  'capture',
  'tap',
  'click',
  'press',
  'swipe',
  'scroll',
  'type',
  'enter',
  'send',
  'message',
  'text',
  'reply',
  'forward',
  'share',
  'post',
  'copy',
  'paste',
  'play',
  'pause',
  'skip',
  'mute',
  'unmute',
  'silence',
  'delete',
  'remove',
  'install',
  'uninstall',
  'download',
  'upload',
  'search',
  'log in',
  'sign in',
  'sign up',
  'book',
  'order',
  'buy',
  'pay',
  'set',
  'turn',
  'toggle',
  'switch',
  'increase',
  'decrease',
  'lower',
  'raise',
  'brighten',
  'dim',
  'save',
  'rename',
  'move',
  'add',
  'create',
  'schedule',
];

/**
 * Verbs that ask for an answer rather than an action.
 *
 * Held apart from {@link ACTION_WORDS} because they describe the agent's *reply*, which every run ends with
 * anyway. Counting them as steps is what made "take a screenshot and tell me about it" get a plan.
 */
const REPORTING_WORDS = [
  'tell',
  'describe',
  'say',
  'explain',
  'summarise',
  'summarize',
  'show',
  'read',
  'list',
  'check',
  'look',
  'find out',
  'what',
  'which',
  'where',
  'who',
  'when',
  'how many',
  'is there',
  'are there',
];

/**
 * Words that join two pieces of work in sequence.
 *
 * Stronger than a bare "and": these say explicitly that one thing follows another, which a conjunction
 * between an action and its reply does not.
 */
const SEQUENCE_WORDS = [
  'and then',
  'then',
  'after that',
  'afterwards',
  'followed by',
  'finally',
  'before that',
  'once you have',
  'when you have',
];

/**
 * Words describing work over a set, or work with a condition.
 *
 * Each implies steps that cannot be read off the goal, which is exactly when a plan earns its cost: the model
 * has to settle on an approach before it can act sensibly.
 */
const COMPLEXITY_WORDS = [
  'every',
  'each',
  'all of',
  'for all',
  'repeat',
  'until',
  'while',
  'unless',
  'depending',
  'compare',
  'organise',
  'organize',
  'clean up',
  'go through',
  'one by one',
  'one at a time',
  'as many',
  'keep checking',
  'watch for',
  'monitor',
  'automate',
];

/** How many device actions make a goal worth planning. */
export const PLAN_ACTION_THRESHOLD = 2;

/**
 * Length past which a request is treated as complex regardless of its words.
 *
 * Nobody writes twenty-five words to ask for one tap. Counted in words rather than characters so it does not
 * depend on how verbose the language happens to be.
 */
export const PLAN_WORD_THRESHOLD = 24;

/** Two sentences is usually two requests, whether or not they were joined. */
export const PLAN_SENTENCE_THRESHOLD = 2;

/**
 * Whether [goal] warrants a plan.
 *
 * Ordered so explicit signals beat counted ones: a goal saying "and then" is a sequence however few verbs it
 * contains, and a conditional is conditional even in five words.
 */
export const decidePlanning = (goal: string): PlanningDecision => {
  const text = normalise(goal);

  if (text === '') return { needsPlan: false, reason: 'the goal is empty', actionCount: 0 };

  const actionCount = countOccurrences(text, ACTION_WORDS);

  if (containsAny(text, SEQUENCE_WORDS)) {
    return { needsPlan: true, reason: 'the goal describes one thing after another', actionCount };
  }

  if (containsAny(text, COMPLEXITY_WORDS) || /\bif\b/.test(text)) {
    return {
      needsPlan: true,
      reason: 'the goal is conditional or covers a set of items',
      actionCount,
    };
  }

  if (sentenceCount(goal) >= PLAN_SENTENCE_THRESHOLD) {
    return { needsPlan: true, reason: 'the goal is several sentences', actionCount };
  }

  if (wordCount(text) > PLAN_WORD_THRESHOLD) {
    return { needsPlan: true, reason: 'the goal is long enough to be several steps', actionCount };
  }

  if (actionCount >= PLAN_ACTION_THRESHOLD) {
    return { needsPlan: true, reason: `the goal asks for ${actionCount} actions`, actionCount };
  }

  // One action, or none plus a question. Either way there is nothing to plan: the loop reads the screen, acts
  // once, and answers.
  return {
    needsPlan: false,
    reason:
      actionCount === 1
        ? 'the goal is a single action'
        : 'the goal is a question or one small step',
    actionCount,
  };
};

/** Convenience for the loop, which only needs the boolean. */
export const needsPlan = (goal: string): boolean => decidePlanning(goal).needsPlan;

/**
 * Whether the goal only asks for an answer.
 *
 * Decided on the **opening word**, not on whether action verbs appear anywhere. English puts the imperative
 * first, so the first verb is the one that says what is being asked for — and a goal like "tell me which app
 * is open" contains an action word ("open") that is an adjective here, not an instruction.
 *
 * Not used by the planning decision itself: a question is already below the action threshold. It is exported
 * because the prompt builder tells the model to answer rather than act when this holds, and both should read
 * the goal the same way.
 */
export const isQuestionOnly = (goal: string): boolean => {
  const text = normalise(goal);
  if (text === '') return false;

  // A sequence disqualifies it however it opens: "tell me what is on screen and then close the app" is work.
  if (containsAny(text, SEQUENCE_WORDS)) return false;

  return startsWithAny(text, REPORTING_WORDS);
};

const normalise = (goal: string): string => goal.trim().toLowerCase();

/** Whether the goal opens with one of [phrases], ignoring a leading politeness. */
const startsWithAny = (text: string, phrases: readonly string[]): boolean => {
  const withoutPreamble = text.replace(/^(please|could you|can you|would you|hey|ok|okay)\s+/, '');

  return phrases.some((phrase) =>
    new RegExp(`^${phrase.replace(/\s+/g, '\\s+')}\\b`).test(withoutPreamble),
  );
};

const wordCount = (text: string): number => text.split(/\s+/).filter((word) => word !== '').length;

/** Counts how many of [phrases] appear, on word boundaries so "and" does not fire inside "android". */
const countOccurrences = (text: string, phrases: readonly string[]): number =>
  phrases.reduce((total, phrase) => total + matchCount(text, phrase), 0);

const containsAny = (text: string, phrases: readonly string[]): boolean =>
  phrases.some((phrase) => matchCount(text, phrase) > 0);

const matchCount = (text: string, phrase: string): number => {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (text.match(new RegExp(`\\b${escaped}\\b`, 'g')) ?? []).length;
};

/** Sentences, counted by terminal punctuation followed by more content. */
const sentenceCount = (goal: string): number =>
  goal
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter((part) => part !== '').length;
