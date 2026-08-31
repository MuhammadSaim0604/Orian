/**
 * The live-message notifier.
 *
 * This exists because of a device-testing bug that looked like the agent not replying at all: the user's message
 * appeared, nothing else did, and pressing back and reopening the conversation revealed the whole exchange.
 *
 * The messages were always being stored. `runController` writes them through `sessionStorage`, and the chat store
 * only re-read inside `post()` and `open()` — so nothing told the transcript to look again, and reopening called
 * `open()`. The notifier is what closes that gap.
 *
 * What is protected here is the contract at the seam: notify **after** a successful write, never for a failed
 * one, and never let a listener's failure break the write or the other listeners.
 */

const mockAppend = jest.fn(
  async (
    _sessionId: string,
    _role: string,
    _text: string,
    _detail: string | null,
    _runId: string | null,
  ) => true,
);

jest.mock('react-native', () => ({
  NativeModules: {
    SessionStorage: {
      appendMessage: (
        _id: string,
        sessionId: string,
        role: string,
        text: string,
        detail: string | null,
        runId: string | null,
      ) => mockAppend(sessionId, role, text, detail, runId),
    },
  },
}));

import {
  appendMessage,
  onMessageAppended,
  parseMessageDetail,
  titleFromMessage,
} from '../sessionStorage';

beforeEach(() => {
  mockAppend.mockReset();
  mockAppend.mockResolvedValue(true);
});

describe('notifying that a message was stored', () => {
  it('tells listeners which conversation and what kind', async () => {
    const seen: unknown[] = [];
    const stop = onMessageAppended((event) => seen.push(event));

    await appendMessage({ sessionId: 'session_1', role: 'tool', text: 'Tapped “Send”' });

    expect(seen).toEqual([{ sessionId: 'session_1', role: 'tool' }]);
    stop();
  });

  it('does not notify when the session is gone', async () => {
    // A run can outlive the conversation it was writing into. Notifying for a message that was not stored would
    // have the transcript re-read for nothing.
    mockAppend.mockResolvedValue(false);

    const seen: unknown[] = [];
    const stop = onMessageAppended((event) => seen.push(event));

    const stored = await appendMessage({ sessionId: 'gone', role: 'tool', text: 'orphaned' });

    expect(stored).toBe(false);
    expect(seen).toEqual([]);
    stop();
  });

  it('does not notify when the write throws', async () => {
    mockAppend.mockRejectedValue(new Error('database is locked'));

    const seen: unknown[] = [];
    const stop = onMessageAppended((event) => seen.push(event));

    await expect(
      appendMessage({ sessionId: 'session_1', role: 'user', text: 'hello' }),
    ).resolves.toBe(false);

    expect(seen).toEqual([]);
    stop();
  });

  it('reaches every listener', async () => {
    // The chat store subscribes at module scope, and a second reader is plausible — the overlay is another React
    // root reading the same modules.
    const first: unknown[] = [];
    const second: unknown[] = [];
    const stopFirst = onMessageAppended((event) => first.push(event));
    const stopSecond = onMessageAppended((event) => second.push(event));

    await appendMessage({ sessionId: 'session_1', role: 'assistant', text: 'Done.' });

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    stopFirst();
    stopSecond();
  });

  it('keeps going when a listener throws', async () => {
    // This runs mid-run, in the middle of operating someone's phone. A broken log view must not stop the agent, and
    // must not stop the other listeners either. Same reasoning as AgentEventBus.
    const survived: unknown[] = [];
    const stopBroken = onMessageAppended(() => {
      throw new Error('a rendering bug');
    });
    const stopGood = onMessageAppended((event) => survived.push(event));

    await expect(
      appendMessage({ sessionId: 'session_1', role: 'tool', text: 'Tapped' }),
    ).resolves.toBe(true);

    expect(survived).toHaveLength(1);
    stopBroken();
    stopGood();
  });

  it('stops notifying after unsubscribing', async () => {
    const seen: unknown[] = [];
    const stop = onMessageAppended((event) => seen.push(event));
    stop();

    await appendMessage({ sessionId: 'session_1', role: 'user', text: 'hello' });

    expect(seen).toEqual([]);
  });

  it('serialises structured detail on the way in', async () => {
    // The renderer needs the tool call's outcome to draw a failed row. Detail crosses as a string, so a caller
    // handing over an object must have it stringified here rather than at every call site.
    await appendMessage({
      sessionId: 'session_1',
      role: 'tool',
      text: 'Tapped',
      detail: { outcome: 'failed', error: 'element_not_found' },
    });

    const detail = mockAppend.mock.calls[0]?.[3] ?? null;

    expect(parseMessageDetail(detail)).toEqual({
      outcome: 'failed',
      error: 'element_not_found',
    });
  });

  it('passes null detail through rather than the string "undefined"', async () => {
    await appendMessage({ sessionId: 'session_1', role: 'user', text: 'hello' });

    expect(mockAppend.mock.calls[0]?.[3]).toBeNull();
  });
});

describe('reading detail back', () => {
  it('returns null for a malformed row rather than throwing', () => {
    // One bad row must not take down the transcript around it — the user would lose a whole conversation because
    // of one unreadable line.
    expect(parseMessageDetail('not json')).toBeNull();
  });

  it('returns null when there is no detail', () => {
    expect(parseMessageDetail(null)).toBeNull();
  });
});

describe('deriving a title', () => {
  it('uses the first message', () => {
    expect(titleFromMessage('Message Robert about tomorrow')).toBe('Message Robert about tomorrow');
  });

  it('collapses whitespace, so a pasted paragraph reads as one line', () => {
    expect(titleFromMessage('one\n\ntwo   three')).toBe('one two three');
  });

  it('truncates rather than letting a paragraph fill the sidebar', () => {
    const title = titleFromMessage('x'.repeat(200));

    expect(title.length).toBeLessThanOrEqual(48);
    expect(title.endsWith('…')).toBe(true);
  });

  it('falls back for an empty message', () => {
    expect(titleFromMessage('   ')).toBe('New chat');
  });
});
