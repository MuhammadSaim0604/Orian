import { act, fireEvent } from '@testing-library/react-native';

/**
 * The chat and the sidebar, rendered.
 *
 * These cover what a user would report as broken: an empty conversation with no idea what to type, a Send button
 * that works while the agent is not ready, a Stop button that is not there during a run, and a delete that goes
 * through without asking.
 *
 * The stores are mocked rather than the bridge, because the question here is what the screen does with state —
 * the stores have their own tests.
 */

const mockPost = jest.fn(async () => undefined);
const mockStart = jest.fn();
const mockStop = jest.fn();
const mockRemove = jest.fn(async () => undefined);
const mockStartNew = jest.fn(async () => 'session_new');
const mockOpen = jest.fn(async () => undefined);
const mockAlert = jest.fn();

let mockSessionState = {
  messages: [] as {
    id: string;
    sessionId: string;
    role: string;
    text: string;
    detail: string | null;
    runId: string | null;
    createdAtEpochMs: number;
  }[],
  loading: false,
  activeSessionId: 'session_1',
  sidebarOpen: false,
  sessions: [
    {
      id: 'session_1',
      mode: 'agent',
      title: 'Message Robert',
      messageCount: 2,
      createdAtEpochMs: 1,
      updatedAtEpochMs: Date.now(),
    },
  ],
};

let mockRunState = {
  runState: 'idle' as 'idle' | 'running' | 'finished',
  currentTask: '',
  configError: null as string | null,
  timersHeld: true,
};

let mockStatus = { isReady: true, canCaptureScreen: true, canDrawOverlay: true, statusKnown: true };

jest.mock('../sessionStore', () => ({
  useSessionStore: (selector: (state: unknown) => unknown) =>
    selector({
      ...mockSessionState,
      post: mockPost,
      remove: mockRemove,
      startNew: mockStartNew,
      open: mockOpen,
      setSidebarOpen: jest.fn(),
    }),
}));

jest.mock('../useSessionViews', () => ({
  useActiveSession: () => mockSessionState.sessions[0] ?? null,
  useGroupedSessions: () =>
    mockSessionState.sessions.length === 0
      ? []
      : [{ label: 'Today', sessions: mockSessionState.sessions }],
}));

jest.mock('../useAgentRun', () => ({
  useAgentRun: () => ({ ...mockRunState, start: mockStart, stop: mockStop }),
}));

jest.mock('../../automation/useAutomationStatus', () => ({
  useAutomationStatus: () => ({ status: mockStatus, bridgeAvailable: true, refresh: jest.fn() }),
}));

jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: (...args: unknown[]) => mockAlert(...args),
}));

import { renderWithTheme } from '../../../test/renderWithTheme';
import { AgentChatScreen } from '../AgentChatScreen';
import { SessionSidebar } from '../SessionSidebar';

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSessionState = { ...mockSessionState, messages: [], loading: false, sidebarOpen: false };
  mockRunState = { runState: 'idle', currentTask: '', configError: null, timersHeld: true };
  mockStatus = { isReady: true, canCaptureScreen: true, canDrawOverlay: true, statusKnown: true };
});

describe('the chat', () => {
  it('shows the conversation title', async () => {
    const { getByText } = renderWithTheme(
      <AgentChatScreen onOpenSessions={jest.fn()} onOpenModelPicker={jest.fn()} />,
    );
    await flush();

    expect(getByText('Message Robert')).toBeTruthy();
  });

  it('suggests what to type when the conversation is empty', async () => {
    // An empty chat with no prompt is the commonest way a good feature goes unused.
    const { getByText } = renderWithTheme(
      <AgentChatScreen onOpenSessions={jest.fn()} onOpenModelPicker={jest.fn()} />,
    );
    await flush();

    expect(getByText(/Describe what you want done/)).toBeTruthy();
  });

  it('renders a stored transcript', async () => {
    mockSessionState.messages = [
      {
        id: 'm1',
        sessionId: 'session_1',
        role: 'user',
        text: 'Message Robert',
        detail: null,
        runId: null,
        createdAtEpochMs: 1,
      },
      {
        id: 'm2',
        sessionId: 'session_1',
        role: 'tool',
        text: 'Tapped “Send”',
        detail: JSON.stringify({ outcome: 'succeeded' }),
        runId: 'run_1',
        createdAtEpochMs: 2,
      },
    ];

    const { getAllByText, getByText } = renderWithTheme(
      <AgentChatScreen onOpenSessions={jest.fn()} onOpenModelPicker={jest.fn()} />,
    );
    await flush();

    // Twice: once as the header title, which is derived from the first message, and once as the message itself.
    expect(getAllByText('Message Robert')).toHaveLength(2);
    expect(getByText('Tapped “Send”')).toBeTruthy();
  });

  it('records the message before starting the run', async () => {
    // So the user's words survive a run that fails to begin — a conversation that dropped what you typed because
    // the provider was misconfigured would look like the app lost it.
    const { getByLabelText } = renderWithTheme(
      <AgentChatScreen onOpenSessions={jest.fn()} onOpenModelPicker={jest.fn()} />,
    );
    await flush();

    fireEvent.changeText(getByLabelText('What should the agent do?'), 'Message Robert');
    fireEvent.press(getByLabelText('Send to the agent'));
    await flush();

    expect(mockPost).toHaveBeenCalledWith({ role: 'user', text: 'Message Robert' });
    expect(mockStart).toHaveBeenCalledWith('Message Robert');
  });

  it('refuses to send when accessibility is off', async () => {
    // Different problem, different fix — and starting a run that cannot touch the screen would fail in a way
    // that looks like the agent's fault.
    mockStatus = { ...mockStatus, isReady: false };

    const { getByLabelText, getByText } = renderWithTheme(
      <AgentChatScreen onOpenSessions={jest.fn()} onOpenModelPicker={jest.fn()} />,
    );
    await flush();

    expect(getByText('Accessibility service is off')).toBeTruthy();

    fireEvent.changeText(getByLabelText('What should the agent do?'), 'Do something');
    fireEvent.press(getByLabelText('Send to the agent'));
    await flush();

    expect(mockStart).not.toHaveBeenCalled();
  });

  it('refuses to send an empty message', async () => {
    const { getByLabelText } = renderWithTheme(
      <AgentChatScreen onOpenSessions={jest.fn()} onOpenModelPicker={jest.fn()} />,
    );
    await flush();

    fireEvent.press(getByLabelText('Send to the agent'));
    await flush();

    expect(mockStart).not.toHaveBeenCalled();
  });

  it('offers stop instead of send while running', async () => {
    // One control in one place. A disabled Send beside an active Stop invites tapping the wrong one, and during
    // a run stop is the only thing anyone wants.
    mockRunState = { ...mockRunState, runState: 'running', currentTask: 'Opening WhatsApp' };

    const { getByLabelText, queryByLabelText } = renderWithTheme(
      <AgentChatScreen onOpenSessions={jest.fn()} onOpenModelPicker={jest.fn()} />,
    );
    await flush();

    expect(queryByLabelText('Send to the agent')).toBeNull();

    fireEvent.press(getByLabelText('Stop the agent'));
    expect(mockStop).toHaveBeenCalled();
  });

  it('shows what the agent is doing now', async () => {
    mockRunState = { ...mockRunState, runState: 'running', currentTask: 'Opening WhatsApp' };

    const { getByText } = renderWithTheme(
      <AgentChatScreen onOpenSessions={jest.fn()} onOpenModelPicker={jest.fn()} />,
    );
    await flush();

    expect(getByText('Opening WhatsApp')).toBeTruthy();
  });

  it('warns before the user leaves when timers are unprotected', async () => {
    // Something they need to know beforehand, not after coming back to a stalled run.
    mockRunState = { ...mockRunState, runState: 'running', timersHeld: false };

    const { getByText } = renderWithTheme(
      <AgentChatScreen onOpenSessions={jest.fn()} onOpenModelPicker={jest.fn()} />,
    );
    await flush();

    expect(getByText(/may pause if you leave the app/)).toBeTruthy();
  });

  it('says nothing about pausing when timers are held', async () => {
    mockRunState = { ...mockRunState, runState: 'running', timersHeld: true };

    const { queryByText } = renderWithTheme(
      <AgentChatScreen onOpenSessions={jest.fn()} onOpenModelPicker={jest.fn()} />,
    );
    await flush();

    expect(queryByText(/may pause if you leave the app/)).toBeNull();
  });

  it('reports a configuration problem plainly', async () => {
    mockRunState = { ...mockRunState, configError: 'Add an API key for OpenAI in settings.' };

    const { getByText } = renderWithTheme(
      <AgentChatScreen onOpenSessions={jest.fn()} onOpenModelPicker={jest.fn()} />,
    );
    await flush();

    expect(getByText('Add an API key for OpenAI in settings.')).toBeTruthy();
  });
});

describe('the sidebar', () => {
  it('lists conversations by their title', async () => {
    const { getByLabelText } = renderWithTheme(
      <SessionSidebar
        onClose={jest.fn()}
        onOpenOnboarding={jest.fn()}
        onOpenSettings={jest.fn()}
      />,
    );
    await flush();

    expect(getByLabelText('Open “Message Robert”')).toBeTruthy();
  });

  it('starts a new conversation', async () => {
    const { getByLabelText } = renderWithTheme(
      <SessionSidebar
        onClose={jest.fn()}
        onOpenOnboarding={jest.fn()}
        onOpenSettings={jest.fn()}
      />,
    );
    await flush();

    fireEvent.press(getByLabelText('Start a new conversation'));
    await flush();

    expect(mockStartNew).toHaveBeenCalled();
  });

  it('confirms before deleting rather than deleting on the tap', async () => {
    // Messages cascade with the conversation and nothing is recoverable, so this must never happen by mis-tap.
    const { getByLabelText } = renderWithTheme(
      <SessionSidebar
        onClose={jest.fn()}
        onOpenOnboarding={jest.fn()}
        onOpenSettings={jest.fn()}
      />,
    );
    await flush();

    fireEvent.press(getByLabelText('Delete “Message Robert”'));

    expect(mockAlert).toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('names the conversation and its size in the confirmation', async () => {
    // So the user can tell they tapped the row they meant.
    const { getByLabelText } = renderWithTheme(
      <SessionSidebar
        onClose={jest.fn()}
        onOpenOnboarding={jest.fn()}
        onOpenSettings={jest.fn()}
      />,
    );
    await flush();

    fireEvent.press(getByLabelText('Delete “Message Robert”'));

    const body = String(mockAlert.mock.calls[0]?.[1] ?? '');
    expect(body).toContain('Message Robert');
    expect(body).toContain('2 messages');
  });

  it('says so when there are no conversations', async () => {
    mockSessionState = { ...mockSessionState, sessions: [] };

    const { getByText } = renderWithTheme(
      <SessionSidebar
        onClose={jest.fn()}
        onOpenOnboarding={jest.fn()}
        onOpenSettings={jest.fn()}
      />,
    );
    await flush();

    expect(getByText('No conversations yet.')).toBeTruthy();
  });
});
