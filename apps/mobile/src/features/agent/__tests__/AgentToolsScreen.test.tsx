import { act, fireEvent } from '@testing-library/react-native';

/**
 * The tools page.
 *
 * Device testing found a specific hole here: every tool read "On" from a fresh install regardless of whether its
 * permission had been granted, and the only way to trigger a request was to switch a tool off and on again — which
 * nobody would think to do.
 *
 * The underlying default is deliberate and stays. The stored set is the **disabled** tools, so everything reads On
 * initially and a newly shipped tool is never silently missing. What was wrong was the row saying only "On" when it
 * could not act, so what these tests protect is the three-state distinction: off, on, and on-but-blocked.
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
  toolsWithImpact: (impact: string) =>
    impact === 'read' ? ['getContacts', 'getUiTree'] : impact === 'interact' ? ['click'] : [],
  TOOL_GROUPS: [
    { impact: 'read', label: 'Reading', explanation: 'Observe.' },
    { impact: 'interact', label: 'Touching the screen', explanation: 'Act.' },
  ],
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

beforeEach(() => {
  jest.clearAllMocks();
  mockDisabledTools = [];
  mockCapabilities = [capability('contacts', true, 'Contacts')];
});

describe('a tool whose permission is granted', () => {
  it('reads On with no warning', async () => {
    const { getByLabelText, queryByLabelText } = renderWithTheme(
      <AgentToolsScreen onBack={jest.fn()} />,
    );
    await flush();

    expect(getByLabelText('getContacts, on')).toBeTruthy();
    expect(queryByLabelText('Grant the permission getContacts needs')).toBeNull();
  });
});

describe('a tool that is on but cannot act', () => {
  beforeEach(() => {
    mockCapabilities = [capability('contacts', false, 'Contacts')];
  });

  it('says the permission is not granted, rather than only "On"', async () => {
    // The bug, directly: the row previously said On and nothing else, so a tool that could not run looked no
    // different from one that could.
    const { getByText } = renderWithTheme(<AgentToolsScreen onBack={jest.fn()} />);
    await flush();

    expect(getByText(/Contacts is not granted yet/)).toBeTruthy();
  });

  it('announces the blocked state to a screen reader', async () => {
    const { getByLabelText } = renderWithTheme(<AgentToolsScreen onBack={jest.fn()} />);
    await flush();

    expect(getByLabelText('getContacts, on, permission not granted')).toBeTruthy();
  });

  it('offers the grant from the row', async () => {
    // The fix for the workaround the user found. Previously the only route to a request was toggling off and on.
    const { getByLabelText } = renderWithTheme(<AgentToolsScreen onBack={jest.fn()} />);
    await flush();

    fireEvent.press(getByLabelText('Grant the permission getContacts needs'));
    await flush();

    expect(mockRequest).toHaveBeenCalledWith('contacts');
  });

  it('does not flip the toggle off on the user’s behalf', async () => {
    // Turning it off would be tidier-looking and a lie about what they set. The toggle reflects their choice; the
    // label reflects whether it can be honoured.
    const { getByLabelText } = renderWithTheme(<AgentToolsScreen onBack={jest.fn()} />);
    await flush();

    expect(getByLabelText('getContacts, on, permission not granted')).toBeTruthy();
    expect(mockWriteDisabled).not.toHaveBeenCalled();
  });
});

describe('a tool that is off', () => {
  beforeEach(() => {
    mockDisabledTools = ['getContacts'];
    mockCapabilities = [capability('contacts', false, 'Contacts')];
  });

  it('mentions the permission without treating it as a problem', async () => {
    // Nothing is broken until they want it, so this is information rather than a warning.
    const { getByText, queryByLabelText } = renderWithTheme(
      <AgentToolsScreen onBack={jest.fn()} />,
    );
    await flush();

    expect(getByText(/switching this on will ask for it/)).toBeTruthy();
    expect(queryByLabelText('Grant the permission getContacts needs')).toBeNull();
  });

  it('requests the permission when switched on', async () => {
    // Issue E4: the moment a user says they want a capability is the moment to ask, not the moment a run needs it.
    const { getByLabelText } = renderWithTheme(<AgentToolsScreen onBack={jest.fn()} />);
    await flush();

    fireEvent.press(getByLabelText('getContacts, off'));
    await flush();

    expect(mockWriteDisabled).toHaveBeenCalledWith([]);
    expect(mockRequest).toHaveBeenCalledWith('contacts');
  });
});

describe('a tool that needs no permission of its own', () => {
  it('never shows a permission line', async () => {
    // Tapping and reading the screen need the accessibility service, which onboarding already gates on. Listing it
    // against twenty tools would be noise.
    const { queryByText } = renderWithTheme(<AgentToolsScreen onBack={jest.fn()} />);
    await flush();

    expect(queryByText(/getUiTree.*permission/)).toBeNull();
  });

  it('switches off without requesting anything', async () => {
    const { getByLabelText } = renderWithTheme(<AgentToolsScreen onBack={jest.fn()} />);
    await flush();

    fireEvent.press(getByLabelText('click, on'));
    await flush();

    expect(mockWriteDisabled).toHaveBeenCalledWith(['click']);
    expect(mockRequest).not.toHaveBeenCalled();
  });
});
