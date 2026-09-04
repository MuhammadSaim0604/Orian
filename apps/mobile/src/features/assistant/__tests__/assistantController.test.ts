/**
 * The Orion Assist exchange.
 *
 * What these are really testing is the **no-session** rule, because that is the design decision most likely to be
 * eroded later: it is always tempting to persist a conversation, and the moment this one is persisted it becomes a
 * second chat screen rather than an assistant.
 */

// Mock factories are hoisted above the file, so anything they reference must be named `mock*`. The prefix is a
// required opt-out rather than a style choice.
const mockRunTurn = jest.fn(
  async (_input: unknown) => ({ answer: 'Done.', spoken: 'Done.' }) as unknown,
);

const mockProviderReadiness = jest.fn(() => ({
  ok: true as boolean,
  provider: { baseUrl: 'https://api.example.com/v1', model: 'gpt-4o-mini' },
  reason: '',
}));

jest.mock('../assistantTurn', () => ({
  runAssistantTurn: (input: unknown) => mockRunTurn(input),
}));

jest.mock('../../providers/providerRegistry', () => ({
  readActiveApiKey: async () => 'key',
}));

jest.mock('../../providers/providerStore', () => ({
  readRunnableProvider: async () => mockProviderReadiness(),
}));

jest.mock('@mobile-automation/ai-agent', () => ({
  createChatCompletionsProvider: () => ({ model: 'gpt-4o-mini' }),
}));

import {
  askAssistant,
  endAssistantExchange,
  markSpoken,
  readAssistant,
  setPartialSpeech,
  stopAssistantTurn,
  subscribeToAssistant,
} from '../assistantController';

/** Drains enough microtasks for the async turn to settle. */
const flush = async (): Promise<void> => {
  for (let index = 0; index < 12; index++) await Promise.resolve();
};

beforeEach(() => {
  endAssistantExchange();
  mockRunTurn.mockClear();
  mockRunTurn.mockImplementation(async () => ({ answer: 'Done.', spoken: 'Done.' }));
  mockProviderReadiness.mockReturnValue({
    ok: true,
    provider: { baseUrl: 'https://api.example.com/v1', model: 'gpt-4o-mini' },
    reason: '',
  });
});

describe('asking something', () => {
  it('records the question, then the answer', async () => {
    await askAssistant('what does this say');
    await flush();

    const { turns } = readAssistant();

    expect(turns.map((turn) => turn.role)).toEqual(['user', 'assistant']);
    expect(turns[0]?.text).toBe('what does this say');
    expect(turns[1]?.text).toBe('Done.');
  });

  it('holds the answer for speech rather than firing an event', async () => {
    // The panel root can mount *after* an answer arrives — Android decides when the window appears — so an event
    // would simply be missed.
    await askAssistant('read this');
    await flush();

    expect(readAssistant().pendingSpeech).toBe('Done.');
  });

  it('clears the pending speech once spoken, so it cannot be said twice', async () => {
    await askAssistant('read this');
    await flush();

    markSpoken();

    expect(readAssistant().pendingSpeech).toBeNull();
  });

  it('ignores an empty question', async () => {
    await askAssistant('   ');

    expect(readAssistant().turns).toEqual([]);
    expect(mockRunTurn).not.toHaveBeenCalled();
  });

  it('refuses a second question while one is in flight', async () => {
    // Not queued, and not cancel-and-replace. A queued question would be answered after the user has stopped
    // listening, and cancelling could interrupt the model mid-action on the device.
    mockRunTurn.mockImplementation(() => new Promise(() => undefined));

    void askAssistant('first');
    await flush();

    await askAssistant('second');

    expect(mockRunTurn).toHaveBeenCalledTimes(1);
  });

  it('replays the exchange so a follow-up resolves', async () => {
    await askAssistant('what is this app');
    await flush();

    await askAssistant('and what does that button do');
    await flush();

    const history = (mockRunTurn.mock.calls[1]?.[0] as { history: unknown[] }).history;

    expect(history).toHaveLength(2);
  });
});

describe('nothing is persisted', () => {
  it('starts empty every time', () => {
    // The rule that makes this an assistant rather than a chat screen. Summoning Orion twice gives two unrelated
    // conversations, deliberately.
    expect(readAssistant().turns).toEqual([]);
  });

  it('clears everything when the exchange ends', async () => {
    await askAssistant('anything');
    await flush();

    endAssistantExchange();

    expect(readAssistant()).toMatchObject({
      state: 'idle',
      turns: [],
      pendingSpeech: null,
      error: null,
    });
  });

  it('has no session id anywhere in its state', () => {
    expect(Object.keys(readAssistant())).not.toContain('sessionId');
  });
});

describe('stopping', () => {
  it('leaves the transcript but drops the pending speech', async () => {
    await askAssistant('something');
    await flush();

    stopAssistantTurn();

    // Stop is not dismiss: the user may want to read what was said without hearing the rest of it.
    expect(readAssistant().turns).toHaveLength(2);
    expect(readAssistant().pendingSpeech).toBeNull();
  });

  it('does not deliver an answer that arrives after a stop', async () => {
    let settle: ((value: unknown) => void) | undefined;
    mockRunTurn.mockImplementation(() => new Promise((resolve) => (settle = resolve)));

    void askAssistant('slow one');
    await flush();

    stopAssistantTurn();
    settle?.({ answer: 'too late', spoken: 'too late' });
    await flush();

    expect(readAssistant().turns.map((turn) => turn.text)).not.toContain('too late');
  });
});

describe('a provider that is not set up', () => {
  it('reports the reason rather than failing silently', async () => {
    mockProviderReadiness.mockReturnValue({
      ok: false,
      provider: { baseUrl: '', model: '' },
      reason: 'Add an AI provider key in settings',
    });

    await askAssistant('anything');
    await flush();

    expect(readAssistant()).toMatchObject({
      state: 'error',
      error: 'Add an AI provider key in settings',
    });
  });
});

describe('subscribers', () => {
  it('publishes on every change', async () => {
    const seen: string[] = [];
    const unsubscribe = subscribeToAssistant((snapshot) => seen.push(snapshot.state));

    await askAssistant('anything');
    await flush();
    unsubscribe();

    expect(seen).toContain('thinking');
    expect(seen).toContain('speaking');
  });

  it('carries on when a listener throws', async () => {
    // The panel is mid-exchange on someone's phone. Abandoning that because a view has a bug would be worse than
    // the bug.
    const unsubscribe = subscribeToAssistant(() => {
      throw new Error('listener bug');
    });

    await expect(askAssistant('anything')).resolves.toBeUndefined();
    unsubscribe();
  });

  it('reflects partial speech as it is heard', () => {
    setPartialSpeech('what does th');

    expect(readAssistant()).toMatchObject({ partialSpeech: 'what does th', state: 'listening' });
  });
});
