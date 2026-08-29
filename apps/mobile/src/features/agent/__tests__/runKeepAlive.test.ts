/**
 * The keep-alive wrapper.
 *
 * The mechanism it fronts cannot be tested off-device — whether React Native's timer choreographer
 * callback survives `onHostPause` is a question only a phone answers. What is testable, and what these
 * cover, is the contract the run controller depends on: **it never throws, and it reports honestly
 * whether timers are protected.**
 *
 * That matters because of how it is used. A run whose keep-alive failed still works while the app is in
 * front, so `execute` must not abandon it — but the UI has to be able to say the run may pause. A wrapper
 * that threw would take the run down; one that lied would leave the user watching a frozen agent with no
 * explanation.
 *
 * The module reads `NativeModules.RunKeepAlive` **once at import time**, deliberately — that lookup can
 * throw, and doing it repeatedly would mean repeatedly risking it. So the mock has to be in place before
 * the import, which is why `react-native` is mocked here rather than the property being assigned in a
 * `beforeEach`.
 */

const mockStart = jest.fn(async () => true);
const mockStop = jest.fn(async () => undefined);
const mockIsHeld = jest.fn(async () => true);

jest.mock('react-native', () => ({
  NativeModules: {
    RunKeepAlive: {
      start: () => mockStart(),
      stop: () => mockStop(),
      isHeld: () => mockIsHeld(),
    },
  },
}));

import {
  areTimersHeld,
  holdTimersAwake,
  isKeepAliveAvailable,
  releaseTimers,
} from '../runKeepAlive';

beforeEach(() => {
  jest.clearAllMocks();
  mockStart.mockResolvedValue(true);
  mockStop.mockResolvedValue(undefined);
  mockIsHeld.mockResolvedValue(true);
});

describe('holding timers awake', () => {
  it('reports the module as available', () => {
    expect(isKeepAliveAvailable()).toBe(true);
  });

  it('returns true when the task started', async () => {
    await expect(holdTimersAwake()).resolves.toBe(true);
    expect(mockStart).toHaveBeenCalled();
  });

  it('returns false when the task could not start', async () => {
    // The native side resolves false rather than rejecting, because a run without protected timers is
    // degraded rather than broken.
    mockStart.mockResolvedValueOnce(false);

    await expect(holdTimersAwake()).resolves.toBe(false);
  });

  it('returns false rather than throwing when start rejects', async () => {
    // The important one: a throw here would propagate into `execute` and abandon the run.
    mockStart.mockRejectedValueOnce(new Error('no react context'));

    await expect(holdTimersAwake()).resolves.toBe(false);
  });
});

describe('releasing', () => {
  it('releases the task', async () => {
    await releaseTimers();

    expect(mockStop).toHaveBeenCalled();
  });

  it('swallows a failure to release', async () => {
    // Release runs inside the run's teardown, which must complete. An unreleased task is a battery
    // problem; a throw here would skip the rest of `finish` and orphan the notification.
    mockStop.mockRejectedValueOnce(new Error('already gone'));

    await expect(releaseTimers()).resolves.toBeUndefined();
  });
});

describe('reading the state', () => {
  it('reads whether the task is held', async () => {
    await expect(areTimersHeld()).resolves.toBe(true);
  });

  it('reports not held when the read fails', async () => {
    mockIsHeld.mockRejectedValueOnce(new Error('gone'));

    await expect(areTimersHeld()).resolves.toBe(false);
  });
});
