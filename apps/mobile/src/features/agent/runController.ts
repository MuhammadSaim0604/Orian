import {
  type AgentEvent,
  type AgentRunResult,
  createChatCompletionsProvider,
  runAgent,
} from '@mobile-automation/ai-agent';
import { ExecutionRecorder, type ExecutionTrace } from '@mobile-automation/execution-recorder';
import { invokeTool } from '@mobile-automation/native-automation';
import { type Observation } from '@mobile-automation/prompt-engine';

import { readActiveApiKey } from '../providers/providerRegistry';
import { readRunnableProvider } from '../providers/providerStore';
import { saveTrace } from '../recorder/traceStorage';

import {
  hideAgentOverlay,
  onStopRequestedFromNotification,
  showAgentOverlay,
} from './agentOverlay';
import { enabledToolNames, readAgentSettings } from './agentSettings';
import { startProbe, stopProbe } from './backgroundProbe';
import { holdTimersAwake, releaseTimers } from './runKeepAlive';
import { startRunService, stopRunService } from './runService';
import { contextualGoal, messageForEvent, seedEntriesFor } from './sessionMemory';
import { appendMessage, loadMessages } from './sessionStorage';

/**
 * Owns the agent run.
 *
 * **A module, not a component** (ADR 0016). This is the fix for issue B1: run state used to live in
 * `useAgentRun`, whose unmount aborted the `AbortController` — so leaving the screen killed the agent,
 * and the agent's entire purpose is to work while the user is elsewhere.
 *
 * Nothing here touches React. Components subscribe and read; they never own. The consequences worth
 * knowing:
 *
 * - **No unmount can stop a run.** Only an explicit stop, a completed goal, or a bound being hit.
 * - **Both React roots see one run.** The overlay is a separate root (ADR 0011) and subscribes to this
 *   same module, so a run started in the chat is visible from the overlay with no message passing.
 * - **Exits must be exhaustive.** A run that ends with nothing mounted still has to stop the
 *   foreground service, or the notification outlives the work and tells the user their phone is being
 *   driven when it is not.
 * - **One run at a time**, enforced here. With ownership in a component a second run needed two
 *   mounted screens; now it needs only two calls, so `start` refuses rather than replacing — replacing
 *   would leave the first loop running with nothing tracking it.
 */

export type RunState = 'idle' | 'running' | 'finished';

export type RunSnapshot = {
  readonly runState: RunState;
  /** Identifies the run, and what the overlay is bound to. */
  readonly runId: string | null;
  readonly goal: string;
  /** What the agent is doing right now, for the notification and the overlay strip. */
  readonly currentTask: string;
  readonly events: readonly AgentEvent[];
  readonly result: AgentRunResult | null;
  /** A configuration problem, distinct from a failed run. */
  readonly configError: string | null;
  readonly trace: ExecutionTrace | null;
  readonly startedAtEpochMs: number | null;
  /**
   * An instruction the user typed while a run was in flight.
   *
   * Queued rather than injected. The loop has no mid-run input point — the model's context is built
   * per step from the goal, the plan, and the observation — so genuinely interleaving a new
   * instruction means changing the loop, which belongs with Step 4's session work.
   *
   * What happens instead is honest and useful: the instruction runs as the next goal the moment the
   * current run ends. The UI says so rather than implying the agent heard it immediately.
   */
  readonly queuedFollowUp: string | null;
  /**
   * Whether JS timers are protected for this run.
   *
   * False means the run will freeze the moment the app is backgrounded, because React Native stops
   * firing timers on activity pause. Surfaced rather than hidden: a user whose run stalls deserves to be
   * told why, and it is the difference between a bug and a device limitation.
   */
  readonly timersHeld: boolean;
  /**
   * The conversation this run belongs to.
   *
   * A run belongs to a session, so its activity lands in that session's history and is still there after the
   * user leaves and comes back (issue B3). Held on the snapshot rather than passed around, because the
   * overlay is a separate React root and learns which conversation is running by reading this.
   */
  readonly sessionId: string | null;
};

type Listener = (snapshot: RunSnapshot) => void;

/** Cap on retained events, so a long run cannot grow the list without bound. */
const MAX_RETAINED_EVENTS = 200;

const IDLE: RunSnapshot = {
  runState: 'idle',
  runId: null,
  goal: '',
  currentTask: '',
  events: [],
  result: null,
  configError: null,
  trace: null,
  startedAtEpochMs: null,
  queuedFollowUp: null,
  timersHeld: false,
  sessionId: null,
};

let snapshot: RunSnapshot = IDLE;
let controller: AbortController | null = null;
let recorder = new ExecutionRecorder();
const listeners = new Set<Listener>();

/**
 * Publishes a new snapshot.
 *
 * A listener that throws must not break the run: the agent is mid-way through operating someone's
 * phone, and abandoning that because a log view has a bug would leave the device half-finished. Same
 * reasoning as `AgentEventBus` in the agent package.
 */
const publish = (next: Partial<RunSnapshot>): void => {
  snapshot = { ...snapshot, ...next };

  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch {
      // Deliberately ignored — see above.
    }
  }
};

export const subscribeToRun = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const readRun = (): RunSnapshot => snapshot;

export const isRunning = (): boolean => snapshot.runState === 'running';

/**
 * Wires the notification's stop action to this controller.
 *
 * Called once at startup. The notification is delivered to the foreground service, which cannot reach
 * JavaScript, so the path is service → broadcast → native module → this. Registering here rather than
 * in a component is deliberate: the notification is most useful precisely when no component is mounted.
 *
 * Returns an unsubscribe for symmetry, though in practice nothing calls it — the listener should live
 * as long as the process.
 */
export const listenForExternalStop = (): (() => void) => {
  const subscription = onStopRequestedFromNotification(() => {
    stopRun();
  });

  return () => subscription.remove();
};

/**
 * Reads the current screen for the agent.
 *
 * The compact tree, because the full tree of a busy screen is tens of thousands of tokens and the
 * omitted fields carry no information the model can use.
 */
const observeScreen = async (): Promise<Observation> => {
  const [screen, tree] = await Promise.all([
    invokeTool('getCurrentScreen', {}) as Promise<{
      packageName: string | null;
      activityName: string | null;
    }>,
    invokeTool('getUiTree', { compact: true }),
  ]);

  return {
    packageName: screen.packageName,
    activityName: screen.activityName,
    uiTree: tree,
  };
};

/**
 * A one-line description of what the agent is doing, for the notification and the overlay.
 *
 * Derived from the event rather than stored by the loop, so the loop needs no knowledge that a
 * notification exists. Returns null for events that do not change what the user would call "the
 * current task" — otherwise the notification would flicker between a tool name and a plan on every
 * step.
 */
export const taskLabelFor = (event: AgentEvent): string | null => {
  switch (event.type) {
    case 'runStarted':
      return 'Starting…';

    case 'planned':
      return event.steps[0] ?? 'Working out what to do';

    case 'toolCallProposed':
      return describeTool(event.tool, event.arguments);

    case 'replanning':
      return 'Rethinking the plan';

    case 'runFinished':
      return event.outcome === 'succeeded' ? 'Finished' : 'Stopped';

    default:
      return null;
  }
};

/** Tool calls in the user's terms. A raw tool name plus JSON is not a status line. */
const describeTool = (tool: string, args: Record<string, unknown>): string => {
  const text = typeof args.text === 'string' ? args.text : null;
  const target = typeof args.packageName === 'string' ? args.packageName : null;

  switch (tool) {
    case 'click':
    case 'clickAt':
      return 'Tapping';
    case 'typeText':
      return text === null ? 'Typing' : `Typing “${truncate(text, 24)}”`;
    case 'swipe':
    case 'swipeBetween':
      return 'Swiping';
    case 'openApp':
    case 'openAppByName':
      return target === null ? 'Opening an app' : `Opening ${target}`;
    case 'getUiTree':
    case 'getCurrentScreen':
      return 'Reading the screen';
    case 'takeScreenshot':
      return 'Taking a screenshot';
    case 'findElement':
    case 'waitForElement':
      return 'Looking for something on screen';
    default:
      return tool;
  }
};

const truncate = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`;

export type StartOutcome = 'started' | 'already-running' | 'empty-goal';

/**
 * Starts a run.
 *
 * Refuses while one is active rather than replacing it. The bug this avoids: a second `runAgent` would
 * begin with the first still looping and nothing holding its controller, so two agents would drive the
 * device at once and only one could be stopped.
 *
 * `sessionId` binds the run to a conversation. Optional, because a run can legitimately have no session — the
 * overlay's "run again" and any future headless caller — and in that case nothing is persisted rather than
 * being written to a session that does not exist.
 */
export const startRun = (goal: string, sessionId: string | null = null): StartOutcome => {
  const trimmed = goal.trim();
  if (trimmed === '') return 'empty-goal';
  if (snapshot.runState === 'running') return 'already-running';

  const active = new AbortController();
  controller = active;
  recorder = new ExecutionRecorder();

  // Generated here rather than taken from the loop's own run id, because the overlay has to be bound to
  // something before the first event arrives - and the first thing a user does is look at it.
  const runId = `run_${Date.now().toString(36)}`;

  publish({
    runState: 'running',
    runId,
    goal: trimmed,
    currentTask: 'Starting…',
    events: [],
    result: null,
    configError: null,
    trace: null,
    startedAtEpochMs: Date.now(),
    queuedFollowUp: null,
    timersHeld: false,
    // Falls back to the session the previous run used, so a follow-up from the overlay - which knows a run id
    // but not a session - still lands in the right conversation.
    sessionId: sessionId ?? snapshot.sessionId,
  });

  // Fire and forget: the run owns its own lifetime from here, which is the entire point of this
  // module. The promise is deliberately not returned — a caller awaiting it would recreate the
  // component-lifetime coupling this replaces.
  void execute(trimmed, active, runId);

  return 'started';
};

const execute = async (goal: string, active: AbortController, runId: string): Promise<void> => {
  // Started before the provider is read: if the key is missing this stops immediately, and a
  // notification that appeared for a second is better than a run that silently had no service.
  await startRunService('Starting…');

  // **Before the loop begins, and the order matters.** The headless task has to start while the activity
  // is still resumed: one started after the user has already left would race the callback removal it
  // exists to prevent, and React Native refuses to start a foreground-disallowed task from a resumed
  // activity at all.
  const timersHeld = await holdTimersAwake();
  publish({ timersHeld });

  startProbe();

  // Shown without awaiting the result. An overlay that could not be drawn - permission revoked,
  // window rejected - must not stop the run; the automation is the point and the strip is how the
  // user watches it.
  void showAgentOverlay(runId);

  try {
    const readiness = await readRunnableProvider();

    if (!readiness.ok) {
      await finish({ configError: readiness.reason, runState: 'idle' });
      return;
    }

    const provider = createChatCompletionsProvider({
      baseUrl: readiness.provider.baseUrl,
      model: readiness.provider.model,
      // Read at call time, from the Keystore. Never stored here (ADR 0007).
      apiKey: readActiveApiKey,
    });

    const settings = readAgentSettings();
    const sessionId = snapshot.sessionId;

    // Seeded from the conversation's own history, so a second run in a session knows what the first did. Fed
    // into `packages/ai-agent`'s existing memory rather than a second implementation: the stuck and replan
    // detectors already reason over exactly this, and two versions of "what has been tried" would eventually
    // disagree with the untested one on the critical path.
    const seedMemory = sessionId === null ? [] : await seedEntriesFor(sessionId);

    // A follow-up like "now do the same for Sarah" is meaningless without what came before. Rather than
    // changing the loop's one-goal contract, the recent exchange is folded into the goal itself.
    const messages = sessionId === null ? [] : await loadMessages(sessionId);
    const effectiveGoal = contextualGoal(goal, messages);

    const result = await runAgent(
      {
        provider,
        tools: { isAvailable: true, invoke: invokeTool },
        observe: observeScreen,
      },
      {
        goal: effectiveGoal,
        signal: active.signal,
        maxSteps: settings.maxSteps,
        deadlineMs: settings.deadlineMs,
        // **This is what makes a tool toggle mean something.** `allowedTools` filters the tool list in the
        // prompt as well as the validator, so a disabled tool is never advertised - rather than being offered
        // and then refused, which reads as the agent malfunctioning.
        allowedTools: enabledToolNames(settings),
        seedMemory,
        onEvent: (event) => {
          handleEvent(event, readiness.provider.model);
        },
      },
    );

    const recorded = recorder.result;

    // Persisted regardless of outcome, and only when the user asked for recordings. A failed run is often the
    // more interesting one to look at, which is why the outcome is not a condition.
    if (settings.recordTraces && recorded !== null && recorded.steps.length > 0) {
      await saveTrace(recorded).catch(() => false);
    }

    await finish({ result, trace: recorded, runState: 'finished' });
  } catch (error) {
    // A thrown error from runAgent means a provider misconfiguration; an ordinary failed run comes
    // back in the result instead.
    await finish({
      configError: error instanceof Error ? error.message : 'The agent could not start.',
      runState: 'idle',
    });
  }
};

const handleEvent = (event: AgentEvent, model: string): void => {
  // The recorder is fed first and unconditionally: it must see every step even if nothing is
  // mounted, or the trace would be missing the tail of the run.
  feedRecorder(event, model);

  const task = taskLabelFor(event);

  publish({
    events:
      snapshot.events.length >= MAX_RETAINED_EVENTS
        ? [...snapshot.events.slice(1), event]
        : [...snapshot.events, event],
    currentTask: task ?? snapshot.currentTask,
  });

  // Persisted so the conversation survives the run. Fire and forget, and deliberately not awaited: a database
  // write must not pace the loop, and a session the user deleted mid-run simply returns false.
  void persistEvent(event);

  // The notification follows the task, so a user who only sees the shade still knows what is
  // happening. Fire and forget: a failed notification update must not interrupt a step.
  if (task !== null) void startRunService(task);
};

/**
 * Writes an event into the run's conversation.
 *
 * Only some events are worth keeping — `observed` fires before every step, and a transcript reading "Looking
 * at the screen" forty times is worse than one that omits it. `messageForEvent` decides.
 *
 * Reads the session id from the snapshot at call time rather than closing over it, so a run whose session was
 * deleted stops writing rather than resurrecting rows against a missing parent.
 */
const persistEvent = async (event: AgentEvent): Promise<void> => {
  const sessionId = snapshot.sessionId;
  if (sessionId === null) return;

  const message = messageForEvent(event);
  if (message === null) return;

  await appendMessage({
    sessionId,
    role: message.role,
    text: message.text,
    detail: message.detail,
    runId: snapshot.runId,
  });
};

/**
 * Queues an instruction typed while a run is in flight.
 *
 * **Not injected into the current run.** The loop builds the model's context per step from the goal,
 * the plan, and the observation; there is no mid-run input point, and inventing one would mean changing
 * the loop — which belongs with Step 4's session work rather than being smuggled in here.
 *
 * So it becomes the next goal, started automatically when this run ends. The overlay says exactly that,
 * because an input box that silently swallows what you typed is worse than one that explains itself.
 */
export const queueFollowUp = (instruction: string): void => {
  const trimmed = instruction.trim();
  if (trimmed === '') return;

  publish({ queuedFollowUp: trimmed });
};

export const clearFollowUp = (): void => {
  publish({ queuedFollowUp: null });
};

/**
 * Ends a run, whatever the reason.
 *
 * Every exit routes through here. That is the invariant that keeps the service, the notification and
 * the overlay honest — an early return that forgot one of them would leave the user believing their
 * phone was still being driven, with a stop button for work that already finished.
 */
const finish = async (next: Partial<RunSnapshot>): Promise<void> => {
  controller = null;
  stopProbe();

  publish(next);

  const queued = snapshot.queuedFollowUp;

  // A queued instruction starts the next run rather than being dropped. Only when the run ended on its
  // own: after an explicit stop the user wants it to stop, and starting something else would be the
  // opposite of what they pressed.
  const endedNaturally = next.runState === 'finished' && snapshot.result?.outcome !== 'cancelled';

  if (queued !== null && endedNaturally) {
    publish({ queuedFollowUp: null });
    // Same session, deliberately: a follow-up belongs to the conversation it was typed into.
    startRun(queued, snapshot.sessionId);
    return;
  }

  // Both, always, and in this order: the overlay is what the user is looking at, so it goes first.
  await hideAgentOverlay();
  await stopRunService();

  // Released last. An unreleased headless task keeps React Native's timer callback posted for the life
  // of the process - battery for nothing, and it would make the next run appear protected whether or
  // not the mechanism works.
  await releaseTimers();
};

/**
 * Stops the run.
 *
 * Aborting the signal is what actually stops it: the loop checks before every step, so stopping takes
 * effect within one step rather than after the agent finishes whatever it planned. `runAgent` then
 * returns a `cancelled` result and the normal exit path runs.
 *
 * Safe to call when nothing is running, because it is reachable from three places — the chat, the
 * overlay, and the notification — and none of them can be sure of the state at the moment it is
 * pressed.
 */
export const stopRun = (): void => {
  controller?.abort();
};

/** Clears a finished run so the UI can offer a fresh start. Aborts first, if somehow still running. */
export const resetRun = (): void => {
  controller?.abort();
  controller = null;
  recorder = new ExecutionRecorder();
  stopProbe();
  // The session is kept: clearing a finished run means clearing the run, not leaving the conversation.
  publish({ ...IDLE, sessionId: snapshot.sessionId });
  void hideAgentOverlay();
  void stopRunService();
  void releaseTimers();
};

/**
 * Binds the controller to a conversation.
 *
 * Called when the user opens a session, so a run started afterwards lands in the right place. Refuses while a
 * run is in flight: moving a running agent's transcript to another conversation would split it across two,
 * and neither would make sense on its own.
 */
export const bindSession = (sessionId: string | null): void => {
  if (snapshot.runState === 'running') return;
  publish({ sessionId });
};

/**
 * Test-only.
 *
 * Module state persists between tests, and the point of this module is that it outlives components —
 * so tests need an explicit way back to a known state.
 */
export const resetRunControllerForTests = (): void => {
  controller = null;
  recorder = new ExecutionRecorder();
  snapshot = IDLE;
  listeners.clear();
};

/**
 * Routes an agent event into the recorder.
 *
 * Three of the nine event types matter to a recording; the rest are UI narration. Kept here rather
 * than inside the recorder so the recorder stays independent of the agent's event union — which is
 * what lets it be tested against a plain object.
 */
const feedRecorder = (event: AgentEvent, model: string): void => {
  switch (event.type) {
    case 'runStarted':
      recorder.start({
        runId: event.runId,
        goal: event.goal,
        model,
        timestampEpochMs: event.timestampEpochMs,
      });
      return;

    case 'toolExecuted':
      recorder.record(event);
      return;

    case 'runFinished':
      recorder.finish({
        outcome: event.outcome,
        summary: event.summary,
        timestampEpochMs: event.timestampEpochMs,
      });
      return;

    default:
      return;
  }
};
