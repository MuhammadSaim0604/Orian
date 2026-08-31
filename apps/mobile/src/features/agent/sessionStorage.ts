import { NativeModules } from 'react-native';

/**
 * Chat sessions, over the native Room module.
 *
 * A session is one conversation with its own memory and context (issue B3). Before this, Agent Mode was a
 * single text box whose history vanished when a run ended — so there was no way to ask a follow-up, and no
 * way for the agent to know what it had already tried.
 *
 * Two things this layer is careful about:
 *
 * - **Mode scoping is explicit.** Every read takes a mode, so Agent Mode cannot see the workflow builder
 *   agent's conversations even by mistake (ADR 0014). They share a table and nothing else; the builder
 *   agent deliberately has no device tools, and mixing transcripts would put device actions in a context
 *   where they cannot happen.
 * - **A missing native module degrades rather than throws.** The same defensive lookup adopted after the
 *   launch crash: `NativeModules.X` validates a module's whole method table on first access, so touching an
 *   absent or malformed module at import time takes the app down before any error boundary exists.
 */

/**
 * Who or what produced a message.
 *
 * Wider than the OpenAI roles on purpose. `tool` records what a tool call did and `event` records loop
 * narration — a plan, a replan — and both belong in the transcript the user reads. They are also both
 * things the **prompt** must be able to exclude: the model gets its tool history from memory, not by
 * re-reading the chat, and feeding narration back would have it commenting on its own commentary.
 */
export const MESSAGE_ROLES = ['user', 'assistant', 'tool', 'event'] as const;

export type MessageRole = (typeof MESSAGE_ROLES)[number];

/** Which product's conversations. Must match `SessionStore`'s constants on the Kotlin side. */
export const SESSION_MODES = ['agent', 'workflowBuilder'] as const;

export type SessionMode = (typeof SESSION_MODES)[number];

export type SessionSummary = {
  readonly id: string;
  readonly mode: SessionMode;
  readonly title: string;
  readonly messageCount: number;
  readonly createdAtEpochMs: number;
  readonly updatedAtEpochMs: number;
};

export type ChatMessage = {
  readonly id: string;
  readonly sessionId: string;
  readonly role: MessageRole;
  readonly text: string;
  /**
   * Structured detail as JSON, for a tool call's arguments and result.
   *
   * A string rather than an object because that is how it is stored, and because the renderer decides what
   * to make of it. Parsed with {@link parseMessageDetail}, which never throws — a transcript that fails to
   * render because one row has malformed detail would lose the whole conversation.
   */
  readonly detail: string | null;
  /** The run this message came from, so a transcript can group by run. Null for typed messages. */
  readonly runId: string | null;
  readonly createdAtEpochMs: number;
};

type SessionStorageNative = {
  list: (mode: string) => Promise<SessionSummary[]>;
  create: (id: string, mode: string, title: string) => Promise<SessionSummary>;
  rename: (id: string, title: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  count: (mode: string) => Promise<number>;
  messages: (sessionId: string) => Promise<ChatMessage[]>;
  recentMessages: (sessionId: string, limit: number) => Promise<ChatMessage[]>;
  appendMessage: (
    id: string,
    sessionId: string,
    role: string,
    text: string,
    detail: string | null,
    runId: string | null,
  ) => Promise<boolean>;
  clearMessages: (sessionId: string) => Promise<void>;
};

const native = ((): SessionStorageNative | undefined => {
  try {
    return (NativeModules as { SessionStorage?: SessionStorageNative }).SessionStorage;
  } catch {
    return undefined;
  }
})();

export const isSessionStorageAvailable = (): boolean => native !== undefined;

/**
 * How many messages to seed the agent's memory from.
 *
 * Matches `SessionStore.MEMORY_SEED_MESSAGES`. Duplicated rather than fetched because it is a tuning
 * constant read on every run, and a bridge call to learn a number would be absurd — but it is stated here
 * so a future change knows to touch both.
 */
export const MEMORY_SEED_MESSAGES = 60;

/** The name a session gets before the user has said anything. */
export const UNTITLED_SESSION = 'New chat';

/**
 * Generates an id.
 *
 * Time-based with a random suffix rather than a UUID: no dependency, sorts roughly chronologically, and
 * the collision risk within one device's millisecond is not worth a library.
 */
const newId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const listSessions = async (mode: SessionMode): Promise<readonly SessionSummary[]> => {
  if (native === undefined) return [];

  try {
    return await native.list(mode);
  } catch {
    // An unreadable session list must not stop the mode from opening. The user can still start a new
    // conversation, which is the important path.
    return [];
  }
};

export const createSession = async (
  mode: SessionMode,
  title: string = UNTITLED_SESSION,
): Promise<SessionSummary> => {
  const id = newId('session');
  const nowMs = Date.now();

  /**
   * The optimistic value, returned when there is no native module and used as the shape the caller can
   * navigate to immediately. A session that exists on screen before it exists on disk is fine; a screen
   * that waits for a database round trip is a visible stall for no reason.
   */
  const optimistic: SessionSummary = {
    id,
    mode,
    title,
    messageCount: 0,
    createdAtEpochMs: nowMs,
    updatedAtEpochMs: nowMs,
  };

  if (native === undefined) return optimistic;

  try {
    return await native.create(id, mode, title);
  } catch {
    return optimistic;
  }
};

/**
 * Renames a session.
 *
 * Called both by the user and automatically from the first message, which is why it is a plain write with
 * no confirmation: an auto-title that asked permission would be absurd.
 */
export const renameSession = async (id: string, title: string): Promise<void> => {
  const trimmed = title.trim();
  if (trimmed === '') return;

  try {
    await native?.rename(id, trimmed);
  } catch {
    // A failed rename leaves the old title. Not worth interrupting anyone over.
  }
};

export const deleteSession = async (id: string): Promise<void> => {
  try {
    await native?.remove(id);
  } catch {
    // Nothing useful to do. The list re-reads and the session either went or did not.
  }
};

export const loadMessages = async (sessionId: string): Promise<readonly ChatMessage[]> => {
  if (native === undefined) return [];

  try {
    return await native.messages(sessionId);
  } catch {
    return [];
  }
};

/** The most recent messages, oldest first — for seeding memory on a long conversation. */
export const loadRecentMessages = async (
  sessionId: string,
  limit: number = MEMORY_SEED_MESSAGES,
): Promise<readonly ChatMessage[]> => {
  if (native === undefined) return [];

  try {
    return await native.recentMessages(sessionId, limit);
  } catch {
    return [];
  }
};

/**
 * Told when a message has been stored, so a reader can re-read.
 *
 * This exists because of a device-testing bug worth stating plainly: the run controller wrote its messages
 * here directly, and the chat store only re-read inside `post()` and `open()`. So an agent's replies and tool
 * rows **were** being saved and the transcript simply never looked again — the chat showed only what the user
 * had typed until they left the screen and came back, because reopening calls `open()`.
 *
 * The fix belongs at this layer rather than at either end. `sessionStorage` is the one module both the run
 * controller and the store already import, so a notifier here creates no new dependency; having the controller
 * call the store would invert the direction, and having the store poll would be guesswork about timing.
 */
type MessageListener = (event: { readonly sessionId: string; readonly role: MessageRole }) => void;

const messageListeners = new Set<MessageListener>();

/**
 * Subscribes to stored messages.
 *
 * The payload carries only what a listener needs to decide whether to act — which conversation, and what kind
 * of message. Deliberately not the message itself: a listener that rendered from this would be maintaining a
 * second copy of the transcript, and the database is the one that is authoritative.
 */
export const onMessageAppended = (listener: MessageListener): (() => void) => {
  messageListeners.add(listener);
  return () => {
    messageListeners.delete(listener);
  };
};

/**
 * Appends a message.
 *
 * Resolves **false** when the session is gone. That is a real case rather than an error: the user can delete
 * a conversation while a run is still working in it, and the run must carry on rather than crash. The caller
 * stops persisting to that session and nothing else changes.
 *
 * Notifies listeners **only after a successful write**, so nothing re-reads for a message that was never
 * stored.
 */
export const appendMessage = async (input: {
  readonly sessionId: string;
  readonly role: MessageRole;
  readonly text: string;
  readonly detail?: unknown;
  readonly runId?: string | null;
}): Promise<boolean> => {
  if (native === undefined) return false;

  try {
    const stored = await native.appendMessage(
      newId('msg'),
      input.sessionId,
      input.role,
      input.text,
      input.detail === undefined ? null : JSON.stringify(input.detail),
      input.runId ?? null,
    );

    if (stored) notifyMessageAppended({ sessionId: input.sessionId, role: input.role });

    return stored;
  } catch {
    return false;
  }
};

/**
 * Fans the notification out.
 *
 * A listener that throws must not fail the write or stop the other listeners: the message is already stored,
 * and this is happening in the middle of an agent run. Same reasoning as `AgentEventBus` and the run
 * controller's `publish`.
 */
const notifyMessageAppended = (event: {
  readonly sessionId: string;
  readonly role: MessageRole;
}): void => {
  for (const listener of messageListeners) {
    try {
      listener(event);
    } catch {
      // Deliberately ignored — see above.
    }
  }
};

export const clearMessages = async (sessionId: string): Promise<void> => {
  try {
    await native?.clearMessages(sessionId);
  } catch {
    // Same reasoning as delete: the read that follows tells the truth either way.
  }
};

/**
 * Parses a message's structured detail.
 *
 * Never throws. Detail is opaque storage written by an earlier version of the app in principle, and one
 * malformed row must not take down the transcript around it — the user would lose a whole conversation
 * because of one bad line.
 */
export const parseMessageDetail = <T = Record<string, unknown>>(
  detail: string | null,
): T | null => {
  if (detail === null) return null;

  try {
    return JSON.parse(detail) as T;
  } catch {
    return null;
  }
};

/**
 * A title derived from the first thing the user said.
 *
 * So the sidebar reads as a list of tasks rather than "New chat, New chat, New chat". Trimmed to a phrase:
 * a whole paragraph in a narrow sidebar is unreadable, and the first few words are what identifies it.
 */
export const titleFromMessage = (text: string): string => {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed === '') return UNTITLED_SESSION;

  return collapsed.length <= MAX_TITLE_LENGTH
    ? collapsed
    : `${collapsed.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`;
};

const MAX_TITLE_LENGTH = 48;
