/**
 * The session store.
 *
 * What is protected here is the behaviour a user would notice: a conversation that opens where they left it, a
 * title that comes from what they asked rather than "New chat", and a run that keeps writing into the right
 * conversation while they read another one.
 *
 * `sessionStorage` is mocked rather than the bridge, because the store's job is the orchestration — which
 * session is open, what happens when one is deleted, when a title is derived — and testing that through a fake
 * native module would be testing the wrapper twice.
 */

const mockSessions: {
  id: string;
  mode: string;
  title: string;
  messageCount: number;
  createdAtEpochMs: number;
  updatedAtEpochMs: number;
}[] = [];

const mockMessages = new Map<string, unknown[]>();
const mockAppend = jest.fn(async () => true);
const mockBindSession = jest.fn();

let mockNextId = 0;

jest.mock('../sessionStorage', () => ({
  UNTITLED_SESSION: 'New chat',
  listSessions: async () =>
    [...mockSessions].sort((a, b) => b.updatedAtEpochMs - a.updatedAtEpochMs),
  createSession: async (mode: string) => {
    mockNextId += 1;
    const created = {
      id: `session_${mockNextId}`,
      mode,
      title: 'New chat',
      messageCount: 0,
      createdAtEpochMs: Date.now(),
      updatedAtEpochMs: Date.now(),
    };
    mockSessions.push(created);
    return created;
  },
  deleteSession: async (id: string) => {
    const index = mockSessions.findIndex((session) => session.id === id);
    if (index >= 0) mockSessions.splice(index, 1);
    mockMessages.delete(id);
  },
  renameSession: async (id: string, title: string) => {
    const session = mockSessions.find((candidate) => candidate.id === id);
    if (session !== undefined) session.title = title;
  },
  loadMessages: async (id: string) => mockMessages.get(id) ?? [],
  appendMessage: async (input: { sessionId: string; role: string; text: string }) => {
    const stored = await mockAppend();
    if (!stored) return false;

    const existing = mockMessages.get(input.sessionId) ?? [];
    existing.push({
      id: `m_${existing.length}`,
      ...input,
      detail: null,
      runId: null,
      createdAtEpochMs: Date.now(),
    });
    mockMessages.set(input.sessionId, existing);
    return true;
  },
  titleFromMessage: (text: string) => text.slice(0, 48),
}));

jest.mock('../runController', () => ({
  bindSession: (id: string | null) => mockBindSession(id),
}));

import { useSessionStore } from '../sessionStore';

beforeEach(() => {
  mockSessions.length = 0;
  mockMessages.clear();
  // Reset so ids do not collide with a session removed in a previous test — a reused id would make a "fresh
  // conversation" assertion pass or fail for the wrong reason.
  mockNextId = 0;
  mockAppend.mockClear();
  mockAppend.mockResolvedValue(true);
  mockBindSession.mockClear();
  useSessionStore.getState().resetForTests();
});

describe('opening the mode', () => {
  it('creates a conversation when there are none', async () => {
    // A mode with nowhere to type is not usable, and creating lazily on first message would mean a run had
    // nowhere to write its transcript.
    await useSessionStore.getState().initialise('agent');

    expect(useSessionStore.getState().activeSessionId).not.toBeNull();
    expect(mockSessions).toHaveLength(1);
  });

  it('opens the most recently active conversation', async () => {
    mockSessions.push(
      {
        id: 'old',
        mode: 'agent',
        title: 'Old',
        messageCount: 2,
        createdAtEpochMs: 1,
        updatedAtEpochMs: 1,
      },
      {
        id: 'recent',
        mode: 'agent',
        title: 'Recent',
        messageCount: 1,
        createdAtEpochMs: 2,
        updatedAtEpochMs: 99,
      },
    );

    await useSessionStore.getState().initialise('agent');

    expect(useSessionStore.getState().activeSessionId).toBe('recent');
  });

  it('tells the run controller which conversation is open', async () => {
    // Without this a run started immediately would write into whatever session was bound last, or none.
    await useSessionStore.getState().initialise('agent');

    expect(mockBindSession).toHaveBeenCalledWith(useSessionStore.getState().activeSessionId);
  });
});

describe('posting a message', () => {
  it('titles the conversation from the first thing the user says', async () => {
    await useSessionStore.getState().initialise('agent');

    await useSessionStore.getState().post({ role: 'user', text: 'Message Robert about tomorrow' });

    expect(mockSessions[0]?.title).toBe('Message Robert about tomorrow');
  });

  it('does not retitle on the second message', async () => {
    await useSessionStore.getState().initialise('agent');
    await useSessionStore.getState().post({ role: 'user', text: 'First thing' });

    await useSessionStore.getState().post({ role: 'user', text: 'Second thing' });

    expect(mockSessions[0]?.title).toBe('First thing');
  });

  it('does not title from a tool message', async () => {
    // Naming a conversation after the agent's first tool call would be meaningless to the person looking for it.
    await useSessionStore.getState().initialise('agent');

    await useSessionStore.getState().post({ role: 'tool', text: 'Tapped “Send”' });

    expect(mockSessions[0]?.title).toBe('New chat');
  });

  it('appears in the open transcript', async () => {
    await useSessionStore.getState().initialise('agent');

    await useSessionStore.getState().post({ role: 'user', text: 'Hello' });

    expect(useSessionStore.getState().messages).toHaveLength(1);
  });

  it('does not replace the open transcript when writing to another session', async () => {
    // A run persisting into a background conversation must not overwrite what the user is reading.
    await useSessionStore.getState().initialise('agent');
    const other = await useSessionStore.getState().startNew();
    await useSessionStore.getState().post({ role: 'user', text: 'In the open one' });

    const openId = useSessionStore.getState().activeSessionId;
    await useSessionStore
      .getState()
      .post({ role: 'tool', text: 'elsewhere', sessionId: openId === other ? 'session_1' : other });

    expect(useSessionStore.getState().messages).toHaveLength(1);
  });

  it('survives the session having been deleted mid-run', async () => {
    // The run outliving its session is a real case: the user can delete a conversation while the agent works in
    // it. The write returns false and nothing else happens.
    await useSessionStore.getState().initialise('agent');
    mockAppend.mockResolvedValueOnce(false);

    await expect(
      useSessionStore.getState().post({ role: 'tool', text: 'orphaned' }),
    ).resolves.toBeUndefined();
  });

  it('does nothing when no conversation is open', async () => {
    await useSessionStore.getState().post({ role: 'user', text: 'nowhere to go' });

    expect(mockAppend).not.toHaveBeenCalled();
  });
});

describe('deleting', () => {
  it('opens the next conversation when the open one is deleted', async () => {
    // Deleting what you are reading has to leave you somewhere, never on an empty screen with no way forward.
    mockSessions.push(
      {
        id: 'a',
        mode: 'agent',
        title: 'A',
        messageCount: 0,
        createdAtEpochMs: 1,
        updatedAtEpochMs: 5,
      },
      {
        id: 'b',
        mode: 'agent',
        title: 'B',
        messageCount: 0,
        createdAtEpochMs: 2,
        updatedAtEpochMs: 9,
      },
    );
    await useSessionStore.getState().initialise('agent');

    await useSessionStore.getState().remove('b');

    expect(useSessionStore.getState().activeSessionId).toBe('a');
  });

  it('creates a fresh conversation when the last one is deleted', async () => {
    await useSessionStore.getState().initialise('agent');
    const only = useSessionStore.getState().activeSessionId!;

    await useSessionStore.getState().remove(only);

    expect(useSessionStore.getState().activeSessionId).not.toBeNull();
    expect(useSessionStore.getState().activeSessionId).not.toBe(only);
  });

  it('leaves the open conversation alone when deleting another', async () => {
    mockSessions.push(
      {
        id: 'a',
        mode: 'agent',
        title: 'A',
        messageCount: 0,
        createdAtEpochMs: 1,
        updatedAtEpochMs: 5,
      },
      {
        id: 'b',
        mode: 'agent',
        title: 'B',
        messageCount: 0,
        createdAtEpochMs: 2,
        updatedAtEpochMs: 9,
      },
    );
    await useSessionStore.getState().initialise('agent');

    await useSessionStore.getState().remove('a');

    expect(useSessionStore.getState().activeSessionId).toBe('b');
  });
});

describe('starting a new conversation', () => {
  it('opens it immediately', async () => {
    await useSessionStore.getState().initialise('agent');

    const id = await useSessionStore.getState().startNew();

    expect(useSessionStore.getState().activeSessionId).toBe(id);
    expect(useSessionStore.getState().messages).toEqual([]);
  });

  it('closes the sidebar', async () => {
    // The user asked for a new conversation; leaving the list open in front of it would be one more tap for
    // no reason.
    await useSessionStore.getState().initialise('agent');
    useSessionStore.getState().setSidebarOpen(true);

    await useSessionStore.getState().startNew();

    expect(useSessionStore.getState().sidebarOpen).toBe(false);
  });

  it('binds the run controller to it', async () => {
    await useSessionStore.getState().initialise('agent');
    mockBindSession.mockClear();

    const id = await useSessionStore.getState().startNew();

    expect(mockBindSession).toHaveBeenCalledWith(id);
  });
});
