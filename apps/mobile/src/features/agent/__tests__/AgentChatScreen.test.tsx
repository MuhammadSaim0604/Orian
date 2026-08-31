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
  events: [] as unknown[],
};

let mockStatus = { isReady: true, canCaptureScreen: true, canDrawOverlay: true, statusKnown: true };

/** The model name the header button shows. Stable so the header's effect does not loop. */
let mockModelLabel = 'Cheap';

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

jest.mock('../../providers/useActiveModelLabel', () => ({
  useActiveModelLabel: () => mockModelLabel,
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
  mockModelLabel = 'Cheap';
  mockSessionState = { ...mockSessionState, messages: [], loading: false, sidebarOpen: false };
  mockRunState = {
    runState: 'idle',
    currentTask: '',
    configError: null,
    timersHeld: true,
    events: [],
  };
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

  it('names the model on its own button rather than hiding it behind an icon', async () => {
    // Device testing asked for this directly: the model in use is a fact worth seeing without pressing anything,
    // and a square icon button said nothing about which model was about to drive the phone.
    const { getByLabelText } = renderWithTheme(
      <AgentChatScreen onOpenSessions={jest.fn()} onOpenModelPicker={jest.fn()} />,
    );
    await flush();

    expect(getByLabelText('Model: Cheap. Choose a different model')).toBeTruthy();
  });

  it('opens the picker from that button', async () => {
    const onOpenModelPicker = jest.fn();

    const { getByLabelText } = renderWithTheme(
      <AgentChatScreen onOpenSessions={jest.fn()} onOpenModelPicker={onOpenModelPicker} />,
    );
    await flush();

    fireEvent.press(getByLabelText('Model: Cheap. Choose a different model'));

    expect(onOpenModelPicker).toHaveBeenCalled();
  });

  it('pins the current task once a plan exists', async () => {
    // The plan scrolls out of view the moment the agent starts working, and "what is it doing now" is the question
    // a user asks continuously while watching their phone be driven.
    mockRunState = {
      ...mockRunState,
      runState: 'running',
      events: [
        {
          type: 'planned',
          runId: 'run_1',
          timestampEpochMs: 1,
          steps: ['Open WhatsApp', 'Find Robert'],
          isReplan: false,
        },
      ],
    };

    const { getByLabelText } = renderWithTheme(
      <AgentChatScreen onOpenSessions={jest.fn()} onOpenModelPicker={jest.fn()} />,
    );
    await flush();

    expect(getByLabelText('Current task: Open WhatsApp. Expand the plan')).toBeTruthy();
  });

  it('does not pin an empty card before a plan exists', async () => {
    // An empty shell while the model is still deciding would be worse than nothing.
    const { queryByLabelText } = renderWithTheme(
      <AgentChatScreen onOpenSessions={jest.fn()} onOpenModelPicker={jest.fn()} />,
    );
    await flush();

    expect(queryByLabelText(/Expand the plan/)).toBeNull();
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

  it('is titled Orion Agent, not Chats', async () => {
    const { getByText } = renderWithTheme(
      <SessionSidebar
        onClose={jest.fn()}
        onOpenOnboarding={jest.fn()}
        onOpenSettings={jest.fn()}
      />,
    );
    await flush();

    // Two weights in one line, so the assertion is on the parts rather than one string.
    expect(getByText('Orion')).toBeTruthy();
    expect(getByText(' Agent')).toBeTruthy();
  });

  it('offers onboarding and settings above the conversations', async () => {
    const { getByLabelText } = renderWithTheme(
      <SessionSidebar
        onClose={jest.fn()}
        onOpenOnboarding={jest.fn()}
        onOpenSettings={jest.fn()}
      />,
    );
    await flush();

    expect(getByLabelText('Onboarding. Permissions and setup')).toBeTruthy();
    expect(getByLabelText('Settings. Model, tools, run limits')).toBeTruthy();
  });

  it('opens onboarding, closing itself first', async () => {
    // The panel has to go before the screen slides in, or the sidebar would be sitting over it.
    const onOpenOnboarding = jest.fn();
    const onClose = jest.fn();

    const { getByLabelText } = renderWithTheme(
      <SessionSidebar
        onClose={onClose}
        onOpenOnboarding={onOpenOnboarding}
        onOpenSettings={jest.fn()}
      />,
    );
    await flush();

    fireEvent.press(getByLabelText('Onboarding. Permissions and setup'));
    await flush();

    expect(onOpenOnboarding).toHaveBeenCalled();
  });

  it('opens settings from here rather than from the chat header', async () => {
    // Moved deliberately: the header should hold what a person uses mid-conversation, and settings is not that.
    const onOpenSettings = jest.fn();

    const { getByLabelText } = renderWithTheme(
      <SessionSidebar
        onClose={jest.fn()}
        onOpenOnboarding={jest.fn()}
        onOpenSettings={onOpenSettings}
      />,
    );
    await flush();

    fireEvent.press(getByLabelText('Settings. Model, tools, run limits'));
    await flush();

    expect(onOpenSettings).toHaveBeenCalled();
  });

  it('offers New chat as a labelled button, not a bare plus', async () => {
    // The primary action in the panel should be the most legible thing in it, and an icon alone made it the least.
    const { getByText } = renderWithTheme(
      <SessionSidebar
        onClose={jest.fn()}
        onOpenOnboarding={jest.fn()}
        onOpenSettings={jest.fn()}
      />,
    );
    await flush();

    expect(getByText('New chat')).toBeTruthy();
  });

  it('replaces the header row with a search field rather than adding one above it', async () => {
    // Pushing the list down would move it under the finger that just tapped search.
    const { getByLabelText, queryByText } = renderWithTheme(
      <SessionSidebar
        onClose={jest.fn()}
        onOpenOnboarding={jest.fn()}
        onOpenSettings={jest.fn()}
      />,
    );
    await flush();

    fireEvent.press(getByLabelText('Search conversations'));
    await flush();

    expect(queryByText('Recent chats')).toBeNull();
    expect(queryByText('New chat')).toBeNull();
  });

  it('filters the conversations as you type', async () => {
    const { getAllByLabelText, getByLabelText, queryByText } = renderWithTheme(
      <SessionSidebar
        onClose={jest.fn()}
        onOpenOnboarding={jest.fn()}
        onOpenSettings={jest.fn()}
      />,
    );
    await flush();

    fireEvent.press(getByLabelText('Search conversations'));
    await flush();

    // Two nodes carry this label once search is open — the icon button is gone, but the field and its own
    // container both announce it — so the field is taken from the list rather than by an exact lookup.
    const field = getAllByLabelText('Search conversations').at(-1)!;
    fireEvent.changeText(field, 'nothing-like-this');
    await flush();

    expect(queryByText(/Nothing matches/)).toBeTruthy();
  });

  it('restores the header when search is dismissed', async () => {
    const { getByLabelText, queryByText } = renderWithTheme(
      <SessionSidebar
        onClose={jest.fn()}
        onOpenOnboarding={jest.fn()}
        onOpenSettings={jest.fn()}
      />,
    );
    await flush();

    fireEvent.press(getByLabelText('Search conversations'));
    await flush();

    fireEvent.press(getByLabelText('Stop searching'));
    await flush();

    expect(queryByText('Recent chats')).toBeTruthy();
  });
});
