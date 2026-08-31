import { create } from 'zustand';

import { bindSession } from './runController';
import {
  type ChatMessage,
  type SessionMode,
  type SessionSummary,
  UNTITLED_SESSION,
  appendMessage,
  createSession,
  deleteSession,
  listSessions,
  loadMessages,
  onMessageAppended,
  renameSession,
  titleFromMessage,
} from './sessionStorage';

/**
 * Session state, shared.
 *
 * A module-level store rather than component state, for the same reason the run controller is a module
 * (ADR 0016): the overlay is a separate React root and reaches app state only through the stores it
 * imports. A run started from the in-app chat has to land in the same session the overlay is showing, and
 * that only works if both read one store.
 *
 * ## Derived lists are hooks, not selectors
 *
 * Nothing here returns a filtered or mapped collection. zustand v5 compares snapshots with `Object.is`, so
 * a selector building a new array re-renders forever — the symptom is the app or a Jest run hanging with no
 * error, which cost real time in Step 2. Collections are derived in `useMemo` hooks instead
 * (`useSessionViews`), and the store only exposes identity-stable slices.
 */

export type SessionState = {
  readonly mode: SessionMode;
  readonly sessions: readonly SessionSummary[];
  /** The open conversation, or null before one is chosen. */
  readonly activeSessionId: string | null;
  /** The open conversation's transcript, oldest first. */
  readonly messages: readonly ChatMessage[];
  readonly loading: boolean;
  /** True while the sidebar is open. Held here so the overlay could read it too. */
  readonly sidebarOpen: boolean;
};

export type SessionActions = {
  /** Loads the session list and opens the most recent, or creates one if there are none. */
  initialise: (mode: SessionMode) => Promise<void>;
  refresh: () => Promise<void>;
  open: (sessionId: string) => Promise<void>;
  startNew: () => Promise<string>;
  rename: (sessionId: string, title: string) => Promise<void>;
  remove: (sessionId: string) => Promise<void>;
  /** Records a message in the open session, titling the session from the first one. */
  post: (input: {
    readonly role: ChatMessage['role'];
    readonly text: string;
    readonly detail?: unknown;
    readonly runId?: string | null;
    /** Overrides the target, for a run persisting into a session the user has since navigated away from. */
    readonly sessionId?: string;
  }) => Promise<void>;
  /** Re-reads the open session's transcript from storage. */
  reloadMessages: () => Promise<void>;
  setSidebarOpen: (open: boolean) => void;
  /** Test seam. Module state outlives a test, so tests need a way back to a known state. */
  resetForTests: () => void;
};

const INITIAL: SessionState = {
  mode: 'agent',
  sessions: [],
  activeSessionId: null,
  messages: [],
  loading: false,
  sidebarOpen: false,
};

export const useSessionStore = create<SessionState & SessionActions>((set, get) => ({
  ...INITIAL,

  initialise: async (mode) => {
    set({ mode, loading: true });

    const sessions = await listSessions(mode);

    // The most recent conversation, because that is the one someone was last in. Ordering comes from the
    // query rather than being re-sorted here, so the sidebar and this agree by construction.
    const mostRecent = sessions[0];

    if (mostRecent === undefined) {
      set({ sessions, loading: false });
      // A mode with no conversations still needs one to type into. Creating it here rather than lazily on
      // first message means the transcript has somewhere to go the moment a run starts.
      await get().startNew();
      return;
    }

    set({ sessions, loading: false });
    await get().open(mostRecent.id);
  },

  refresh: async () => {
    const sessions = await listSessions(get().mode);
    set({ sessions });
  },

  open: async (sessionId) => {
    set({ activeSessionId: sessionId, loading: true, messages: [] });

    // Told before the messages load, so a run started immediately lands in the right conversation. Refused by
    // the controller while a run is in flight, which is correct: moving a running agent's transcript would
    // split it across two conversations.
    bindSession(sessionId);

    const messages = await loadMessages(sessionId);

    // Guarded against a race: the user can tap another session while this read is in flight, and writing
    // these messages into that one would show the wrong conversation under the right title.
    if (get().activeSessionId !== sessionId) return;

    set({ messages, loading: false });
  },

  startNew: async () => {
    const created = await createSession(get().mode);

    set((state) => ({
      sessions: [created, ...state.sessions],
      activeSessionId: created.id,
      messages: [],
      sidebarOpen: false,
    }));

    bindSession(created.id);

    return created.id;
  },

  rename: async (sessionId, title) => {
    const trimmed = title.trim();
    if (trimmed === '') return;

    // Optimistic, because a rename is the user's own text being echoed back and waiting for a database
    // round trip to see it would feel broken.
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId ? { ...session, title: trimmed } : session,
      ),
    }));

    await renameSession(sessionId, trimmed);
  },

  remove: async (sessionId) => {
    await deleteSession(sessionId);

    const remaining = get().sessions.filter((session) => session.id !== sessionId);
    const wasActive = get().activeSessionId === sessionId;

    set({ sessions: remaining });

    if (!wasActive) return;

    // Deleting the open conversation has to leave the user somewhere. The next most recent, or a fresh one
    // if that was the last — never an empty screen with no way forward.
    const next = remaining[0];

    if (next === undefined) {
      set({ activeSessionId: null, messages: [] });
      bindSession(null);
      await get().startNew();
      return;
    }

    await get().open(next.id);
  },

  post: async ({ role, text, detail, runId, sessionId }) => {
    const target = sessionId ?? get().activeSessionId;
    if (target === null) return;

    const stored = await appendMessage({ sessionId: target, role, text, detail, runId });

    // False means the session was deleted, quite possibly while a run was still writing into it. Nothing to
    // recover: the messages have nowhere to go and the run carries on.
    if (!stored) return;

    // No re-read here: `appendMessage` notifies, and the module-level subscription below reloads the open
    // transcript. Doing it in both places would read twice for every message.

    // The first thing the user says becomes the title, so the sidebar reads as a list of tasks. Only from a
    // user message: titling a conversation after the agent's first tool call would be meaningless.
    if (role === 'user') {
      const session = get().sessions.find((candidate) => candidate.id === target);

      if (session !== undefined && session.title === UNTITLED_SESSION) {
        await get().rename(target, titleFromMessage(text));
      }
    }

    await get().refresh();
  },

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  reloadMessages: async () => {
    const sessionId = get().activeSessionId;
    if (sessionId === null) return;

    const messages = await loadMessages(sessionId);

    // Guarded, because the read is async and the user may have switched conversation while it was in flight —
    // writing these into the new one would show the wrong transcript under the right title.
    if (get().activeSessionId !== sessionId) return;

    set({ messages });
  },

  resetForTests: () => set({ ...INITIAL }),
}));

/**
 * Keeps the open transcript current while a run writes into it.
 *
 * **This is the fix for the defect device testing found.** The run controller persists the agent's replies and
 * tool rows through `sessionStorage` directly; the store only re-read inside `post()` and `open()`. So the
 * messages were being stored correctly and the chat simply never looked again — the user saw their own message
 * and nothing else until they left the screen and came back, because reopening calls `open()`.
 *
 * Subscribed at module scope rather than in a component effect, deliberately. The run outlives any screen
 * (ADR 0016), and a subscription that came and went with a mount would miss exactly the messages written while
 * the user was elsewhere — which is most of them.
 *
 * The listener is never removed. It should live as long as the process, like the store it updates.
 */
onMessageAppended(({ sessionId }) => {
  // Only for the conversation on screen. A run persisting into a background session must not replace the
  // transcript the user is reading.
  if (sessionId !== useSessionStore.getState().activeSessionId) return;

  void useSessionStore.getState().reloadMessages();
});

/** Identity-stable selectors only. Anything that builds a collection belongs in a hook. */
export const selectActiveSessionId = (state: SessionState): string | null => state.activeSessionId;

export const selectMessages = (state: SessionState): readonly ChatMessage[] => state.messages;

export const selectSessions = (state: SessionState): readonly SessionSummary[] => state.sessions;
