/**
 * The wake word's JS surface.
 *
 * Small on purpose — the listening is native. What is tested here is the honesty of the reporting, because the
 * commonest failure of this feature is invisible: the user turns it on, says the phrase, nothing happens, and there
 * is no way to tell which of three preconditions is missing.
 */

const mockGetState = jest.fn(
  () => '{"running":false,"hasMicrophone":true,"isDefaultAssistant":true}',
);
const mockEnable = jest.fn(async () => true);
const mockDisable = jest.fn(async () => true);
const mockOpenPanel = jest.fn(async () => true);

jest.mock('react-native', () => ({
  NativeModules: {
    OrionWakeWord: {
      getState: () => mockGetState(),
      enable: () => mockEnable(),
      disable: () => mockDisable(),
      openPanel: () => mockOpenPanel(),
    },
  },
}));

import { disableWakeWord, enableWakeWord, openAssistPanel, readWakeWordState } from '../wakeWord';

beforeEach(() => {
  mockGetState.mockClear();
  mockEnable.mockClear();
  mockDisable.mockClear();
  mockOpenPanel.mockClear();

  mockGetState.mockReturnValue('{"running":false,"hasMicrophone":true,"isDefaultAssistant":true}');
  mockEnable.mockImplementation(async () => true);
});

describe('reading the state', () => {
  it('reports the three preconditions separately', () => {
    // Three flags rather than one "enabled", because each has a different fix and a single boolean would send the
    // user to the wrong place.
    mockGetState.mockReturnValue(
      '{"running":true,"hasMicrophone":true,"isDefaultAssistant":false}',
    );

    expect(readWakeWordState()).toEqual({
      running: true,
      hasMicrophone: true,
      isDefaultAssistant: false,
      available: true,
    });
  });

  it('is read live rather than cached', () => {
    // The user can change their assistant or revoke the microphone while the app is open, and neither produces a
    // callback.
    readWakeWordState();
    readWakeWordState();

    expect(mockGetState).toHaveBeenCalledTimes(2);
  });

  it('treats a malformed payload as unavailable rather than half-true', () => {
    mockGetState.mockReturnValue('not json');

    expect(readWakeWordState()).toMatchObject({ available: false, running: false });
  });

  it('reads a missing field as false rather than undefined', () => {
    mockGetState.mockReturnValue('{}');

    expect(readWakeWordState()).toEqual({
      running: false,
      hasMicrophone: false,
      isDefaultAssistant: false,
      available: true,
    });
  });
});

describe('enabling', () => {
  it('resolves with null when it started', () => {
    return expect(enableWakeWord()).resolves.toBeNull();
  });

  it('returns a code rather than throwing', async () => {
    // Every failure here is something the *user* has to fix, and the screen has to say which. A rejected promise
    // would have to be re-inspected for its code anyway.
    mockEnable.mockImplementation(async () => {
      throw Object.assign(new Error('nope'), { code: 'not_default_assistant' });
    });

    await expect(enableWakeWord()).resolves.toBe('not_default_assistant');
  });

  it('reports a denied microphone by its own code', async () => {
    mockEnable.mockImplementation(async () => {
      throw Object.assign(new Error('nope'), { code: 'microphone_denied' });
    });

    await expect(enableWakeWord()).resolves.toBe('microphone_denied');
  });

  it('falls back to a generic failure for an unrecognised code', async () => {
    mockEnable.mockImplementation(async () => {
      throw new Error('something else');
    });

    await expect(enableWakeWord()).resolves.toBe('failed');
  });
});

describe('disabling', () => {
  it('never throws, because there is nothing the user could do about it', async () => {
    mockDisable.mockImplementation(async () => {
      throw new Error('already stopped');
    });

    await expect(disableWakeWord()).resolves.toBeUndefined();
  });
});

describe('opening the panel', () => {
  it('reports whether the panel actually opened', async () => {
    mockOpenPanel.mockImplementation(async () => false);

    // False means Orion is not the active assistant. Reported rather than swallowed, because the caller shows a
    // different thing in that case.
    await expect(openAssistPanel()).resolves.toBe(false);
  });

  it('goes through the same route the wake word uses', async () => {
    await openAssistPanel();

    // One code path for a spoken summoning and an in-app one, rather than two implementations that could drift.
    expect(mockOpenPanel).toHaveBeenCalled();
  });
});
