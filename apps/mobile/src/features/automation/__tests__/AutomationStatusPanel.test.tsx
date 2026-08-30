import { act } from '@testing-library/react-native';

import { renderWithTheme } from '../../../test/renderWithTheme';
import { AutomationStatusPanel } from '../AutomationStatusPanel';

/**
 * The capability rows.
 *
 * These exist because of a specific device report: granting screen capture made the **other two rows flip
 * from on to off**. The cause was a status read that failed and was rendered as three revoked
 * permissions, so the assertions here are about the distinction that was missing — **"off" and "unknown"
 * are different claims**, and only one of them means the user needs to visit Settings.
 *
 * The three capabilities are also independent by nature: accessibility is a service, capture is a
 * per-session MediaProjection grant, overlay is a settings toggle. A test that let them move together
 * would not catch the bug recurring.
 */

const mockStatus = jest.fn();
const mockConsent = jest.fn();

jest.mock('../useAutomationStatus', () => ({
  useAutomationStatus: () => mockStatus(),
}));

jest.mock('../useScreenCaptureConsent', () => ({
  useScreenCaptureConsent: () => mockConsent(),
}));

const status = (overrides: Record<string, unknown> = {}) => ({
  status: {
    isReady: true,
    canCaptureScreen: true,
    canDrawOverlay: true,
    statusKnown: true,
    ...overrides,
  },
  bridgeAvailable: true,
  refresh: jest.fn(),
});

beforeEach(() => {
  jest.clearAllMocks();
  mockStatus.mockReturnValue(status());
  mockConsent.mockReturnValue({
    state: 'idle',
    request: jest.fn(),
    release: jest.fn(),
    errorMessage: null,
  });
});

const render = async () => {
  const result = renderWithTheme(<AutomationStatusPanel />);

  await act(async () => {
    await Promise.resolve();
  });

  return result;
};

describe('reporting each capability', () => {
  it('shows all three as granted', async () => {
    const { getByLabelText } = await render();

    expect(getByLabelText(/Accessibility service: granted/)).toBeTruthy();
    expect(getByLabelText(/Screen capture: granted/)).toBeTruthy();
    expect(getByLabelText(/Display over other apps: granted/)).toBeTruthy();
  });

  it('reports capture off without touching the other two', async () => {
    // The exact shape of the reported bug: one capability off must not move the others.
    mockStatus.mockReturnValue(status({ canCaptureScreen: false }));

    const { getByLabelText } = await render();

    expect(getByLabelText(/Screen capture: off/)).toBeTruthy();
    expect(getByLabelText(/Accessibility service: granted/)).toBeTruthy();
    expect(getByLabelText(/Display over other apps: granted/)).toBeTruthy();
  });

  it('reports accessibility off without touching capture', async () => {
    // The inverse, which was issue E1: capture was reported off because accessibility was.
    mockStatus.mockReturnValue(status({ isReady: false }));

    const { getByLabelText } = await render();

    expect(getByLabelText(/Accessibility service: off/)).toBeTruthy();
    expect(getByLabelText(/Screen capture: granted/)).toBeTruthy();
  });
});

describe('when the status could not be read', () => {
  it('says unknown rather than off', async () => {
    // The distinction the panel was missing. Off is a fact about the user's choices; unknown is an
    // admission that the app could not tell.
    mockStatus.mockReturnValue(
      status({
        isReady: false,
        canCaptureScreen: false,
        canDrawOverlay: false,
        statusKnown: false,
      }),
    );

    const { getByLabelText, queryByLabelText } = await render();

    expect(getByLabelText(/Accessibility service: unknown/)).toBeTruthy();
    expect(queryByLabelText(/Screen capture: off/)).toBeNull();
  });

  it('warns that the state may be stale', async () => {
    mockStatus.mockReturnValue(status({ statusKnown: false }));

    const { getByText } = await render();

    expect(getByText(/Could not read the current state/)).toBeTruthy();
  });

  it('does not tell the user how to grant something it cannot read', async () => {
    // Telling someone to enable what may already be enabled is worse than saying nothing.
    mockStatus.mockReturnValue(status({ isReady: false, statusKnown: false }));

    const { queryByText } = await render();

    expect(queryByText(/Settings → Accessibility/)).toBeNull();
  });

  it('treats an absent flag as known', async () => {
    // Optional field: existing readers must keep working, and absent means the read succeeded.
    mockStatus.mockReturnValue({
      status: { isReady: false, canCaptureScreen: false, canDrawOverlay: false },
      bridgeAvailable: true,
      refresh: jest.fn(),
    });

    const { getByLabelText } = await render();

    expect(getByLabelText(/Accessibility service: off/)).toBeTruthy();
  });
});

describe('consent granted but capture still off', () => {
  it('names notifications as the thing to check', async () => {
    // Reached when capture stops after having worked - the projection can be revoked from the shade.
    // The user did not cause it and cannot deduce the cause, so name the one thing they can check.
    mockStatus.mockReturnValue(status({ canCaptureScreen: false }));
    mockConsent.mockReturnValue({
      state: 'granted',
      request: jest.fn(),
      release: jest.fn(),
      errorMessage: null,
    });

    const { getByText } = await render();

    expect(getByText(/notifications are enabled/)).toBeTruthy();
  });

  it('shows the failure message when the capture service could not start', async () => {
    // The grant path's version of the same problem: consent was given, the mediaProjection service
    // could not reach the foreground, and the native side rejects with an actionable message rather
    // than resolving false - which the UI would otherwise render as "you declined".
    mockStatus.mockReturnValue(status({ canCaptureScreen: false }));
    mockConsent.mockReturnValue({
      state: 'failed',
      request: jest.fn(),
      release: jest.fn(),
      errorMessage:
        'Screen recording was allowed but could not start. Check that notifications are enabled for this app, then try again.',
    });

    const { getByText, queryByText } = await render();

    expect(getByText(/could not start/)).toBeTruthy();
    // And it must not also claim the user declined.
    expect(queryByText(/Declined/)).toBeNull();
  });

  it('says nothing when capture is working', async () => {
    mockConsent.mockReturnValue({
      state: 'granted',
      request: jest.fn(),
      release: jest.fn(),
      errorMessage: null,
    });

    const { queryByText } = await render();

    expect(queryByText(/notifications are enabled/)).toBeNull();
  });
});

describe('when the bridge is absent', () => {
  it('says so instead of reporting revoked permissions', async () => {
    mockStatus.mockReturnValue({
      status: {
        isReady: false,
        canCaptureScreen: false,
        canDrawOverlay: false,
        statusKnown: false,
      },
      bridgeAvailable: false,
      refresh: jest.fn(),
    });

    const { getByText, queryByLabelText } = await render();

    expect(getByText(/native automation module is not present/)).toBeTruthy();
    expect(queryByLabelText(/Screen capture/)).toBeNull();
  });
});
