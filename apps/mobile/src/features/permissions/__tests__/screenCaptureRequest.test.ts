/**
 * Requesting screen capture from the tools page.
 *
 * Device testing found the toggle doing nothing: a spinner appeared, cleared, and no system dialog was ever
 * shown. `requestCapability('screen_capture')` resolves the string `session_consent`, which is the native
 * side correctly saying "not mine — MediaProjection consent is an activity result and that plumbing lives on
 * `AutomationModule`". Every caller then treated that answer as a *finished request*.
 *
 * These tests hold the store to finishing the job, so `request()` means the same thing for all thirteen
 * capabilities. A store action called `request` that silently does nothing for one of them is worse than one
 * that throws.
 */

const mockRequestCapability = jest.fn(async (_id: string) => 'granted');
const mockRequestScreenCaptureSession = jest.fn(async () => 'granted');
const mockRefresh = jest.fn(async () => []);

jest.mock('../capabilities', () => {
  const actual = jest.requireActual('../capabilities');

  return {
    ...actual,
    arePermissionsAvailable: () => true,
    readCapabilities: jest.fn(async () => []),
    refreshCapabilities: () => mockRefresh(),
    requestCapability: (id: string) => mockRequestCapability(id),
    requestScreenCaptureSession: () => mockRequestScreenCaptureSession(),
    openSettingsFor: jest.fn(async () => true),
  };
});

import { useCapabilityStore } from '../capabilityStore';

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestCapability.mockImplementation(async () => 'granted');
  mockRequestScreenCaptureSession.mockImplementation(async () => 'granted');
  useCapabilityStore.getState().reset();
});

describe('screen capture', () => {
  it('continues into the MediaProjection flow rather than stopping at session_consent', async () => {
    // The bug, directly. Without this the toggle asked, was told where to go, and stopped.
    mockRequestCapability.mockImplementation(async () => 'session_consent');

    const outcome = await useCapabilityStore.getState().request('screen_capture');

    expect(mockRequestScreenCaptureSession).toHaveBeenCalled();
    expect(outcome).toBe('granted');
  });

  it('reports the user dismissing the dialog as denied', async () => {
    mockRequestCapability.mockImplementation(async () => 'session_consent');
    mockRequestScreenCaptureSession.mockImplementation(async () => 'denied');

    expect(await useCapabilityStore.getState().request('screen_capture')).toBe('denied');
  });

  it('does not leave session_consent as the outcome a caller sees', async () => {
    // `session_consent` is an instruction to the store, not a result for the UI. A row rendering it would
    // have to know about MediaProjection to make sense of it.
    mockRequestCapability.mockImplementation(async () => 'session_consent');

    const outcome = await useCapabilityStore.getState().request('screen_capture');

    expect(outcome).not.toBe('session_consent');
  });

  it('clears the in-flight marker afterwards', async () => {
    mockRequestCapability.mockImplementation(async () => 'session_consent');

    await useCapabilityStore.getState().request('screen_capture');

    expect(useCapabilityStore.getState().requesting).toBeNull();
  });

  it('does not treat the consent flow as a settings round trip', async () => {
    // There is nothing to come back from: the dialog resolves. Marking it as awaited would leave the row
    // saying "come back when you have allowed it" forever.
    mockRequestCapability.mockImplementation(async () => 'session_consent');

    await useCapabilityStore.getState().request('screen_capture');

    expect(useCapabilityStore.getState().awaitingSettings).toEqual([]);
  });

  it('surfaces an unavailable capture flow as an error the user can read', async () => {
    mockRequestCapability.mockImplementation(async () => 'session_consent');
    mockRequestScreenCaptureSession.mockImplementation(async () => 'unsupported');

    await useCapabilityStore.getState().request('screen_capture');

    expect(useCapabilityStore.getState().error).toMatch(/cannot be requested/);
  });
});

describe('every other capability', () => {
  it('is unaffected by the screen-capture path', async () => {
    const outcome = await useCapabilityStore.getState().request('contacts');

    expect(outcome).toBe('granted');
    expect(mockRequestScreenCaptureSession).not.toHaveBeenCalled();
  });

  it('still records a settings round trip', async () => {
    mockRequestCapability.mockImplementation(async () => 'settings_opened');

    await useCapabilityStore.getState().request('accessibility');

    expect(useCapabilityStore.getState().awaitingSettings).toContain('accessibility');
  });

  it('re-reads state afterwards, since a runtime prompt has already resolved', async () => {
    await useCapabilityStore.getState().request('contacts');

    expect(mockRefresh).toHaveBeenCalled();
  });
});
