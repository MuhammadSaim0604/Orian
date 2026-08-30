import { type AgentEvent } from '@mobile-automation/ai-agent';

import {
  isRunning,
  readRun,
  resetRunControllerForTests,
  startRun,
  stopRun,
  subscribeToRun,
  taskLabelFor,
} from '../runController';

/**
 * The run controller.
 *
 * These tests exist because of issue B1, and the one that matters most is the simplest: **a run must
 * outlive the thing that started it**. The old implementation held the run in a React hook whose
 * unmount aborted it, so leaving the screen killed the agent — which is precisely when the agent is
 * supposed to be working.
 *
 * The provider and the native bridge are mocked, so nothing here reaches a device. What is under test
 * is ownership and lifecycle: who can stop a run, what happens on every exit, and whether the service
 * and overlay are told.
 */

/**
 * Mock functions must be named `mock*`.
 *
 * Jest hoists `jest.mock` factories above the file, so a factory referencing an ordinary `const` reads
 * an uninitialised variable. The `mock` prefix is the documented opt-out, and it is required rather
 * than stylistic.
 */
const mockStartService = jest.fn(async (_label: string) => undefined);
const mockStopService = jest.fn(async () => undefined);
const mockShowOverlay = jest.fn(async (_runId: string) => true);
const mockHideOverlay = jest.fn(async () => undefined);
const mockHoldTimers = jest.fn(async () => true);
const mockReleaseTimers = jest.fn(async () => undefined);

/**
 * What the provider registry reports.
 *
 * A function rather than a constant so a test can make the provider unusable — which is the path that produces
 * a `configError` rather than a failed run, and they are different states with different UI.
 */
let mockProviderReadiness: () => unknown = () => ({
  ok: true,
  provider: { baseUrl: 'https://example.invalid/v1', model: 'test-model', hasApiKey: true },
});

let mockRunAgent: (
  deps: unknown,
  options: { signal?: AbortSignal; onEvent?: (e: AgentEvent) => void },
) => Promise<unknown>;

jest.mock('@mobile-automation/native-automation', () => ({
  isAvailable: () => true,
  invokeTool: jest.fn(async () => ({})),
  startAutomationService: (label: string) => mockStartService(label),
  stopAutomationService: () => mockStopService(),
}));

jest.mock('../agentOverlay', () => ({
  showAgentOverlay: (runId: string) => mockShowOverlay(runId),
  hideAgentOverlay: () => mockHideOverlay(),
  onStopRequestedFromNotification: () => ({ remove: () => undefined }),
}));

jest.mock('../runKeepAlive', () => ({
  holdTimersAwake: () => mockHoldTimers(),
  releaseTimers: () => mockReleaseTimers(),
}));

jest.mock('../../providers/providerRegistry', () => ({
  readActiveApiKey: async () => 'key',
}));

jest.mock('../../providers/providerStore', () => ({
  readRunnableProvider: async () => mockProviderReadiness(),
}));

jest.mock('../agentSettings', () => ({
  readAgentSettings: () => ({
    disabledTools: [],
    maxSteps: 40,
    deadlineMs: 600_000,
    recordTraces: true,
  }),
  enabledToolNames: () => ['click', 'getUiTree'],
}));

jest.mock('../sessionStorage', () => ({
  appendMessage: async () => true,
  loadMessages: async () => [],
}));

jest.mock('../sessionMemory', () => ({
  seedEntriesFor: async () => [],
  contextualGoal: (goal: string) => goal,
  messageForEvent: () => null,
}));

jest.mock('../../recorder/traceStorage', () => ({
  saveTrace: jest.fn(async () => true),
}));

jest.mock('@mobile-automation/ai-agent', () => ({
  createChatCompletionsProvider: () => ({}),
  runAgent: (deps: unknown, options: never) => mockRunAgent(deps, options),
}));

/**
 * A run that never settles, so a test can observe one mid-flight.
 *
 * A promise that simply never resolves, rather than a long `setTimeout`: a pending timer keeps Jest's
 * worker alive after the suite finishes, which surfaces as "a worker process has failed to exit
 * gracefully" and hides any real leak behind noise.
 */
const neverFinishes = () => new Promise<unknown>(() => undefined);

/**
 * Lets the run's promise chain drain.
 *
 * More flushes than look necessary, deliberately: `finish` awaits the overlay before the service, and
 * each `await` is another microtask. Too few and the test asserts on a teardown that has not reached its
 * second step yet — which fails as "the service was never stopped" and sends you looking at the wrong
 * code.
 */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 12; i += 1) {
    await Promise.resolve();
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  resetRunControllerForTests();

  mockProviderReadiness = () => ({
    ok: true,
    provider: { baseUrl: 'https://example.invalid/v1', model: 'test-model', hasApiKey: true },
  });

  mockRunAgent = async () => ({ outcome: 'succeeded', stepsTaken: 1, summary: 'done' });
});

describe('starting a run', () => {
  it('refuses an empty goal', () => {
    expect(startRun('   ')).toBe('empty-goal');
    expect(readRun().runState).toBe('idle');
  });

  it('reports the run as running immediately', () => {
    mockRunAgent = neverFinishes;

    expect(startRun('send a message')).toBe('started');
    expect(readRun().runState).toBe('running');
  });

  it('keeps the goal on the snapshot', () => {
    mockRunAgent = neverFinishes;
    startRun('  send a message  ');

    expect(readRun().goal).toBe('send a message');
  });

  it('assigns a run id before the first event', () => {
    // The overlay is bound to it, and the user looks at the overlay before anything has happened.
    mockRunAgent = neverFinishes;
    startRun('send a message');

    expect(readRun().runId).not.toBeNull();
  });

  it('refuses a second run while one is in flight', async () => {
    // The bug this prevents: two loops driving the device with only one controller tracked, so only
    // one can be stopped.
    mockRunAgent = neverFinishes;

    startRun('first');
    await settle();

    expect(startRun('second')).toBe('already-running');
    expect(readRun().goal).toBe('first');
  });

  it('starts the foreground service', async () => {
    mockRunAgent = neverFinishes;
    startRun('send a message');
    await settle();

    expect(mockStartService).toHaveBeenCalled();
  });

  it('shows the status overlay', async () => {
    mockRunAgent = neverFinishes;
    startRun('send a message');
    await settle();

    expect(mockShowOverlay).toHaveBeenCalledWith(readRun().runId);
  });

  it('holds JS timers awake', async () => {
    // The fix for the freeze. The headless task has to be running while the activity is still resumed,
    // because React Native clears the timer callback on pause and refuses to start a
    // foreground-disallowed task from a resumed activity.
    mockRunAgent = neverFinishes;
    startRun('send a message');
    await settle();

    expect(mockHoldTimers).toHaveBeenCalled();
  });

  it('records that timers are protected', async () => {
    mockRunAgent = neverFinishes;
    startRun('send a message');
    await settle();

    expect(readRun().timersHeld).toBe(true);
  });

  it('records an unprotected run rather than refusing to run', async () => {
    // A run without protected timers still works while the app is in front. Abandoning it would be the
    // worse outcome; the overlay warns instead.
    mockHoldTimers.mockResolvedValueOnce(false);
    mockRunAgent = neverFinishes;

    startRun('send a message');
    await settle();

    expect(readRun().runState).toBe('running');
    expect(readRun().timersHeld).toBe(false);
  });
});

describe('the run outliving its subscribers', () => {
  it('keeps running when every subscriber has gone', async () => {
    // The heart of B1. A screen unmounting removes its listener and must not touch the run.
    mockRunAgent = neverFinishes;

    const unsubscribe = subscribeToRun(() => undefined);
    startRun('send a message');
    await settle();

    unsubscribe();

    expect(isRunning()).toBe(true);
  });

  it('survives a subscriber that throws', async () => {
    // The agent is mid-way through operating someone's phone; a broken log view must not abandon it.
    mockRunAgent = neverFinishes;

    subscribeToRun(() => {
      throw new Error('render failure');
    });

    startRun('send a message');
    await settle();

    expect(isRunning()).toBe(true);
  });

  it('lets a late subscriber read the run in progress', async () => {
    // The "reconnection" requirement: returning to the app shows the run with its history rather than
    // a fresh screen.
    mockRunAgent = neverFinishes;
    startRun('send a message');
    await settle();

    expect(readRun().runState).toBe('running');
    expect(readRun().goal).toBe('send a message');
  });
});

describe('finishing', () => {
  it('records the result', async () => {
    startRun('send a message');
    await settle();

    expect(readRun().runState).toBe('finished');
    expect(readRun().result?.outcome).toBe('succeeded');
  });

  it('stops the foreground service', async () => {
    // A notification outliving the work tells the user their phone is being driven when it is not.
    startRun('send a message');
    await settle();

    expect(mockStopService).toHaveBeenCalled();
  });

  it('hides the status overlay', async () => {
    startRun('send a message');
    await settle();

    expect(mockHideOverlay).toHaveBeenCalled();
  });

  it('releases the keep-alive task', async () => {
    // An unreleased headless task keeps React Native's timer callback posted for the life of the
    // process, which would also make the next run look protected whether or not it is.
    startRun('send a message');
    await settle();

    expect(mockReleaseTimers).toHaveBeenCalled();
  });

  it('stops the service even when the provider is misconfigured', async () => {
    // The early-return path. Forgetting it here is exactly how a notification gets orphaned.
    mockRunAgent = async () => {
      throw new Error('bad base url');
    };

    startRun('send a message');
    await settle();

    expect(readRun().configError).toBe('bad base url');
    expect(mockStopService).toHaveBeenCalled();
    expect(mockHideOverlay).toHaveBeenCalled();
    expect(mockReleaseTimers).toHaveBeenCalled();
  });

  it('reports an unconfigured provider without starting the loop', async () => {
    // A different failure from a thrown error, and the one a new user hits: no provider at all. The reason has
    // to name what to do, because "cannot start" with no explanation is the most frustrating thing this screen
    // could say.
    mockProviderReadiness = () => ({
      ok: false,
      reason: 'Add an AI provider in settings before running the agent.',
    });

    let started = false;
    mockRunAgent = async () => {
      started = true;
      return { outcome: 'succeeded', stepsTaken: 0, summary: '' };
    };

    startRun('send a message');
    await settle();

    expect(started).toBe(false);
    expect(readRun().configError).toContain('Add an AI provider');
    expect(mockStopService).toHaveBeenCalled();
  });

  it('passes the enabled tool list to the loop', async () => {
    // The whole point of a tool toggle. A disabled tool must never be advertised to the model rather than being
    // offered and then refused, which reads as the agent malfunctioning.
    let seen: readonly string[] | undefined;

    mockRunAgent = async (_deps, options) => {
      seen = (options as { allowedTools?: readonly string[] }).allowedTools;
      return { outcome: 'succeeded', stepsTaken: 1, summary: 'done' };
    };

    startRun('send a message');
    await settle();

    expect(seen).toEqual(['click', 'getUiTree']);
  });

  it('passes the configured run bounds to the loop', async () => {
    // These are the user's protection against a confused model driving their phone, so they have to actually
    // reach the engine rather than only being stored.
    let bounds: { maxSteps?: number; deadlineMs?: number } = {};

    mockRunAgent = async (_deps, options) => {
      bounds = options as { maxSteps?: number; deadlineMs?: number };
      return { outcome: 'succeeded', stepsTaken: 1, summary: 'done' };
    };

    startRun('send a message');
    await settle();

    expect(bounds.maxSteps).toBe(40);
    expect(bounds.deadlineMs).toBe(600_000);
  });

  it('returns to idle after a configuration failure, not to finished', async () => {
    // A run that never started is not a run that finished, and the UI offers different things for each.
    mockRunAgent = async () => {
      throw new Error('bad base url');
    };

    startRun('send a message');
    await settle();

    expect(readRun().runState).toBe('idle');
  });
});

describe('stopping', () => {
  it('aborts the signal the loop is watching', async () => {
    let observed: AbortSignal | undefined;

    mockRunAgent = async (_deps, options) => {
      observed = options.signal;
      return neverFinishes();
    };

    startRun('send a message');
    await settle();

    stopRun();

    expect(observed?.aborted).toBe(true);
  });

  it('is safe when nothing is running', () => {
    // Reachable from the chat, the overlay, and the notification, none of which can be sure of the
    // state at the moment it is pressed.
    expect(() => stopRun()).not.toThrow();
  });
});

describe('the task label', () => {
  const base = { runId: 'r', timestampEpochMs: 0 } as const;

  it('describes a tap in the user’s terms', () => {
    // A raw tool name plus JSON is not a status line.
    const label = taskLabelFor({
      ...base,
      type: 'toolCallProposed',
      step: 1,
      tool: 'click',
      arguments: {},
    });

    expect(label).toBe('Tapping');
  });

  it('names the app being opened', () => {
    const label = taskLabelFor({
      ...base,
      type: 'toolCallProposed',
      step: 1,
      tool: 'openApp',
      arguments: { packageName: 'com.whatsapp' },
    });

    expect(label).toBe('Opening com.whatsapp');
  });

  it('shows what is being typed, truncated', () => {
    const label = taskLabelFor({
      ...base,
      type: 'toolCallProposed',
      step: 1,
      tool: 'typeText',
      arguments: { text: 'a very long message that will not fit on one line of a notification' },
    });

    expect(label?.length).toBeLessThan(40);
    expect(label).toContain('Typing');
  });

  it('returns null for events that do not change the task', () => {
    // Otherwise the notification would flicker on every observation.
    const label = taskLabelFor({
      ...base,
      type: 'observed',
      packageName: null,
      activityName: null,
      elementCount: 0,
      screenshotPath: null,
    });

    expect(label).toBeNull();
  });

  it('reports the first planned step as the task', () => {
    const label = taskLabelFor({
      ...base,
      type: 'planned',
      steps: ['Open WhatsApp', 'Find Robert'],
      isReplan: false,
    });

    expect(label).toBe('Open WhatsApp');
  });
});
