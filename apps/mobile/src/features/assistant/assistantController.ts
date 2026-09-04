import { createChatCompletionsProvider } from '@mobile-automation/ai-agent';
import { type PromptMessage } from '@mobile-automation/prompt-engine';

import { readActiveApiKey } from '../providers/providerRegistry';
import { readRunnableProvider } from '../providers/providerStore';

import { runAssistantTurn } from './assistantTurn';

/**
 * Owns an Orion Assist exchange.
 *
 * **A module, not a component**, for the same reason as `runController` (ADR 0016): the panel is a separate React
 * root that Android may dismiss at any moment, and an exchange whose lifetime was a component's lifetime would
 * die when the system decided to close the window rather than when the work finished.
 *
 * ## How this differs from `runController`
 *
 * Not a copy with a different prompt. Four deliberate differences, and each one is why a shared controller would
 * have been the wrong call:
 *
 * - **No session, nothing persisted.** No id, no database write, no trace, no recorder. A spoken question about
 *   the screen in front of you is not a thread anyone returns to, and writing it into the chat list would bury
 *   the conversations that matter.
 * - **No foreground service and no keep-alive.** Both exist so a run survives the user leaving the app. This
 *   exchange happens while they are looking at the panel; if they leave, it should end.
 * - **The turn is the unit, not the run.** The user asks, it answers, it waits. There is no long-running loop to
 *   watch, so there is no notification and no status strip.
 * - **It speaks.** The answer goes to text-to-speech as well as to the panel, which means the controller has to
 *   know when an answer is *final* rather than intermediate.
 *
 * What it does share is the conversation shape. Within one summoning the user can follow up, and the message
 * array behaves exactly as it does in Agent Mode — the same `Conversation`, the same tool answers, the same
 * every-call-is-answered rule.
 */

export type AssistantState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

/** One line of the panel transcript. Its own type: this is a display record, not a wire message. */
export type AssistantTurn = {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly text: string;
  /** What the assistant did to answer, phrased. Shown small, under the reply. */
  readonly actions: readonly string[];
};

export type AssistantSnapshot = {
  readonly state: AssistantState;
  readonly turns: readonly AssistantTurn[];
  /** Live partial speech, so the user sees words appear as they talk. */
  readonly partialSpeech: string;
  /** A configuration or permission problem, distinct from a failed answer. */
  readonly error: string | null;
  /**
   * The most recent answer, and whether it has been spoken yet.
   *
   * Held rather than fired as an event: the panel root can mount after an answer arrives — Android decides when
   * the window appears — and an event would have been missed.
   */
  readonly pendingSpeech: string | null;
};

const IDLE: AssistantSnapshot = {
  state: 'idle',
  turns: [],
  partialSpeech: '',
  error: null,
  pendingSpeech: null,
};

type Listener = (snapshot: AssistantSnapshot) => void;

let snapshot: AssistantSnapshot = IDLE;
let controller: AbortController | null = null;
const listeners = new Set<Listener>();

/** Same reasoning as `runController.publish`: a listener that throws must not break the exchange. */
const publish = (next: Partial<AssistantSnapshot>): void => {
  snapshot = { ...snapshot, ...next };

  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch {
      // Deliberately ignored.
    }
  }
};

export const subscribeToAssistant = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const readAssistant = (): AssistantSnapshot => snapshot;

export const isAssistantBusy = (): boolean =>
  snapshot.state === 'thinking' || snapshot.state === 'listening';

/**
 * Clears the exchange.
 *
 * Called when the panel is dismissed. **Everything goes** — this is what "no session" means in practice, and it
 * is the difference between an assistant and a second chat screen. A user who summons Orion twice gets two
 * unrelated conversations, deliberately.
 */
export const endAssistantExchange = (): void => {
  controller?.abort();
  controller = null;
  snapshot = IDLE;

  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch {
      // As above.
    }
  }
};

/** Stops the current answer without clearing the transcript, for the panel's stop button. */
export const stopAssistantTurn = (): void => {
  controller?.abort();
  controller = null;

  if (snapshot.state === 'thinking' || snapshot.state === 'speaking') {
    publish({ state: 'idle', pendingSpeech: null });
  }
};

/** Marks the pending answer as spoken, so a re-render cannot make it say the same thing twice. */
export const markSpoken = (): void => {
  if (snapshot.pendingSpeech !== null) publish({ pendingSpeech: null });
};

export const setPartialSpeech = (text: string): void => {
  publish({ partialSpeech: text, state: 'listening' });
};

export const setListening = (listening: boolean): void => {
  publish({
    state: listening ? 'listening' : snapshot.state === 'listening' ? 'idle' : snapshot.state,
    partialSpeech: listening ? snapshot.partialSpeech : '',
  });
};

const newId = (): string =>
  `turn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

/**
 * Asks Orion something.
 *
 * Refuses while an answer is in flight rather than queueing, and the reason is specific to voice: a queued
 * question would be answered after the user has stopped listening and possibly walked away. Cancel-and-replace
 * would be worse, since the model may be mid-action on the device.
 */
export const askAssistant = async (question: string): Promise<void> => {
  const trimmed = question.trim();
  if (trimmed === '') return;

  if (snapshot.state === 'thinking') return;

  const active = new AbortController();
  controller = active;

  const history = conversationHistory();

  publish({
    state: 'thinking',
    partialSpeech: '',
    error: null,
    pendingSpeech: null,
    turns: [...snapshot.turns, { id: newId(), role: 'user', text: trimmed, actions: [] }],
  });

  try {
    const readiness = await readRunnableProvider();

    if (!readiness.ok) {
      publish({ state: 'error', error: readiness.reason });
      return;
    }

    const provider = createChatCompletionsProvider({
      baseUrl: readiness.provider.baseUrl,
      model: readiness.provider.model,
      // Read at call time from the Keystore, never held here (ADR 0007).
      apiKey: readActiveApiKey,
    });

    const actions: string[] = [];

    const result = await runAssistantTurn({
      provider,
      question: trimmed,
      history,
      signal: active.signal,
      onAction: (phrase) => {
        actions.push(phrase);
        // Republished as they happen so the panel can show what it is doing. A voice assistant that sits silent
        // for eight seconds reads as broken, even when it is working.
        publish({ turns: withActions(snapshot.turns, actions) });
      },
    });

    if (active.signal.aborted) return;

    publish({
      state: 'speaking',
      turns: [
        ...snapshot.turns,
        { id: newId(), role: 'assistant', text: result.answer, actions: [...actions] },
      ],
      // The panel reads this and speaks it. Held on the snapshot rather than fired as an event because the root
      // can mount after the answer arrives — Android decides when the window appears.
      pendingSpeech: result.spoken,
    });
  } catch (error) {
    if (active.signal.aborted) return;

    publish({
      state: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (controller === active) controller = null;
  }
};

/**
 * The exchange so far, as wire messages.
 *
 * Rebuilt from the transcript rather than kept as a second array, so there is one source of truth for what was
 * said. Tool results are deliberately **not** replayed: they are large, they describe a screen that has since
 * changed, and the assistant's turns are short questions rather than a chain of dependent actions.
 */
const conversationHistory = (): readonly PromptMessage[] =>
  snapshot.turns.map((turn) => ({ role: turn.role, content: turn.text }));

const withActions = (
  turns: readonly AssistantTurn[],
  actions: readonly string[],
): readonly AssistantTurn[] => {
  const last = turns.at(-1);
  if (last === undefined || last.role !== 'user') return turns;

  // Attached to the user's turn while thinking, so the actions appear under the question they answer rather than
  // under a reply that does not exist yet.
  return [...turns.slice(0, -1), { ...last, actions: [...actions] }];
};
