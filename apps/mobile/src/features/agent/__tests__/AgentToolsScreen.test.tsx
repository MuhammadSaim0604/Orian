import { act, fireEvent } from '@testing-library/react-native';

/**
 * The tools page, grouped by permission.
 *
 * Device testing asked for the page to be organised around what the user has allowed rather than around
 * individual tools, and the rewrite is what these tests protect:
 *
 * - one card per permission, collapsed by default, so the page fits on a screen;
 * - a chevron immediately left of the toggle, each its own target, so opening a card and granting a
 *   permission are never the same press;
 * - tools inside as checkboxes with names only;
 * - and the distinction that matters — the card's toggle is a **device state** only Android can change, while
 *   a tool's checkbox is the **user's choice** stored locally.
 */

const mockRequest = jest.fn(async (_id: string) => 'granted');
const mockWriteDisabled = jest.fn(async (_disabled: readonly string[]) => undefined);

let mockCapabilities: {
  id: string;
  tier: string;
  grant: string;
  granted: boolean;
  title: string;
  explanation: string;
  consequenceIfDenied: string;
  requiresSettingsVisit: boolean;
}[] = [];

let mockDisabledTools: string[] = [];

jest.mock('../agentSettings', () => ({
  readAgentSettings: () => ({
    disabledTools: mockDisabledTools,
    maxSteps: 40,
    deadlineMs: 600_000,
    recordTraces: true,
  }),
  writeDisabledTools: (disabled: readonly string[]) => mockWriteDisabled(disabled),
  toggleTool: (
    settings: { disabledTools: readonly string[] },
    name: string,
    enabled: boolean,
  ): readonly string[] =>
    enabled
      ? settings.disabledTools.filter((candidate) => candidate !== name)
      : [...settings.disabledTools, name],
}));

jest.mock('../../permissions/capabilityStore', () => ({
  useCapabilityStore: (selector: (state: unknown) => unknown) =>
    selector({
      capabilities: mockCapabilities,
      request: mockRequest,
      refresh: jest.fn(async () => undefined),
    }),
}));

import { renderWithTheme } from '../../../test/renderWithTheme';
import { AgentToolsScreen } from '../AgentToolsScreen';

const capability = (id: string, granted: boolean, title: string) => ({
  id,
  tier: 'optional',
  grant: 'runtime_prompt',
  granted,
  title,
  explanation: '',
  consequenceIfDenied: '',
  requiresSettingsVisit: false,
});

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const render = () => renderWithTheme(<AgentToolsScreen onBack={jest.fn()} />);

beforeEach(() => {
  jest.clearAllMocks();
  mockDisabledTools = [];
  mockCapabilities = [
    capability('accessibility', true, 'Screen access'),
    capability('contacts', false, 'Contacts'),
    capability('screen_capture', false, 'Screen recording'),
    capability('exact_alarm', true, 'Alarms'),
    capability('notifications', true, 'Notifications'),
  ];
});

describe('the cards', () => {
  it('shows one card per permission rather than one row per tool', async () => {
    const { getByText } = render();
    await flush();

    expect(getByText('Screen access')).toBeTruthy();
    expect(getByText('Contacts')).toBeTruthy();
    expect(getByText('Screen recording')).toBeTruthy();
  });

  it('has a card for the tools that need no permission at all', async () => {
    // The substantive half of the grouping: nine tools work on a device where nothing has been granted, and
    // the old page effectively claimed they all needed accessibility.
    const { getByText } = render();
    await flush();

    expect(getByText('No permission needed')).toBeTruthy();
  });

  it('starts collapsed, so the page fits on a screen', async () => {
    const { queryByLabelText } = render();
    await flush();

    expect(queryByLabelText('Read the screen')).toBeNull();
  });

  it('expands to the tools that permission enables', async () => {
    const { getByLabelText } = render();
    await flush();

    fireEvent.press(getByLabelText('Show the Screen access tools'));
    await flush();

    expect(getByLabelText('Read the screen')).toBeTruthy();
    expect(getByLabelText('Tap something')).toBeTruthy();
  });

  it('collapses again', async () => {
    const { getByLabelText, queryByLabelText } = render();
    await flush();

    fireEvent.press(getByLabelText('Show the Screen access tools'));
    await flush();

    fireEvent.press(getByLabelText('Hide the Screen access tools'));
    await flush();

    expect(queryByLabelText('Read the screen')).toBeNull();
  });

  it('keeps two cards open at once', async () => {
    // Closing one to open another would hide something the user was comparing against.
    const { getByLabelText } = render();
    await flush();

    fireEvent.press(getByLabelText('Show the Screen access tools'));
    await flush();
    fireEvent.press(getByLabelText('Show the Contacts tools'));
    await flush();

    expect(getByLabelText('Read the screen')).toBeTruthy();
    expect(getByLabelText('Search contacts')).toBeTruthy();
  });

  it('puts a tool in exactly one card', async () => {
    // takeScreenshot needs screen capture, not accessibility. It used to be grouped by impact, which put it
    // with every other read tool and said nothing about what it required.
    const { getByLabelText, queryByLabelText } = render();
    await flush();

    fireEvent.press(getByLabelText('Show the Screen access tools'));
    await flush();

    expect(queryByLabelText('Take a screenshot')).toBeNull();

    fireEvent.press(getByLabelText('Show the Screen recording tools'));
    await flush();

    expect(getByLabelText('Take a screenshot')).toBeTruthy();
  });
});

describe('the permission toggle', () => {
  it('reads as allowed when the permission is granted', async () => {
    const { getByLabelText } = render();
    await flush();

    expect(getByLabelText('Screen access is allowed')).toBeTruthy();
  });

  it('offers to allow one that is not granted', async () => {
    const { getByLabelText } = render();
    await flush();

    expect(getByLabelText('Allow Contacts')).toBeTruthy();
  });

  it('requests the permission when switched on', async () => {
    const { getByLabelText } = render();
    await flush();

    fireEvent.press(getByLabelText('Allow Contacts'));
    await flush();

    expect(mockRequest).toHaveBeenCalledWith('contacts');
  });

  it('does nothing when already granted, because the app cannot revoke it', async () => {
    // There is no API to revoke a permission from inside the app. A toggle that appeared to turn one off
    // would be lying about what it did.
    const { getByLabelText } = render();
    await flush();

    fireEvent.press(getByLabelText('Screen access is allowed'));
    await flush();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('says a settings visit is coming when that is the grant mechanism', async () => {
    // A settings redirect has no callback, so the label has to warn before the screen changes under the user.
    mockCapabilities = [
      { ...capability('contacts', false, 'Contacts'), requiresSettingsVisit: true },
    ];

    const { getByLabelText } = render();
    await flush();

    expect(getByLabelText('Allow Contacts. Opens system settings')).toBeTruthy();
  });

  it('shows no toggle for the group that needs nothing', async () => {
    const { getByText, queryByLabelText } = render();
    await flush();

    expect(getByText('Always')).toBeTruthy();
    expect(queryByLabelText(/Allow No permission needed/)).toBeNull();
  });
});

describe('the tool checkboxes', () => {
  it('is checked by default, because the stored set is the disabled one', async () => {
    // Deliberate: a newly shipped tool is available without the user having to come here and find it.
    const { getByLabelText } = render();
    await flush();

    fireEvent.press(getByLabelText('Show the Contacts tools'));
    await flush();

    expect(getByLabelText('Search contacts').props.accessibilityState.checked).toBe(true);
  });

  it('persists a tool being switched off', async () => {
    const { getByLabelText } = render();
    await flush();

    fireEvent.press(getByLabelText('Show the Contacts tools'));
    await flush();

    fireEvent.press(getByLabelText('Search contacts'));
    await flush();

    expect(mockWriteDisabled).toHaveBeenCalledWith(['findContacts']);
  });

  it('persists a tool being switched back on', async () => {
    mockDisabledTools = ['findContacts'];

    const { getByLabelText } = render();
    await flush();

    fireEvent.press(getByLabelText('Show the Contacts tools'));
    await flush();

    fireEvent.press(getByLabelText('Search contacts'));
    await flush();

    expect(mockWriteDisabled).toHaveBeenCalledWith([]);
  });

  it('does not request a permission when a tool is ticked', async () => {
    // The card grants; the checkbox records a choice. Conflating them is what made the old page's two
    // controls feel like the same thing.
    const { getByLabelText } = render();
    await flush();

    fireEvent.press(getByLabelText('Show the Contacts tools'));
    await flush();

    fireEvent.press(getByLabelText('Search contacts'));
    await flush();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('still lets a tool be ticked while its permission is missing', async () => {
    // The choice is theirs to record now and grant later. A disabled checkbox would have the page argue with
    // the user.
    const { getByLabelText } = render();
    await flush();

    fireEvent.press(getByLabelText('Show the Screen recording tools'));
    await flush();

    const row = getByLabelText('Take a screenshot');
    expect(row.props.accessibilityState.disabled).toBeFalsy();
    expect(row.props.accessibilityHint).toContain('not allowed yet');
  });

  it('shows names, not descriptions', async () => {
    // Asked for explicitly: a description per row turned twenty-four rows into a wall of prose.
    const { getByLabelText, queryByText } = render();
    await flush();

    fireEvent.press(getByLabelText('Show the Contacts tools'));
    await flush();

    expect(queryByText(/Prefer findContacts/)).toBeNull();
  });
});
