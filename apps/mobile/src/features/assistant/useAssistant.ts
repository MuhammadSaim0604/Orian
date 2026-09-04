import { useEffect, useState } from 'react';

import {
  type AssistantSnapshot,
  askAssistant,
  endAssistantExchange,
  markSpoken,
  readAssistant,
  stopAssistantTurn,
  subscribeToAssistant,
} from './assistantController';
import { dismissPanel, prepareSpeech, speak, stopSpeaking } from './assistSpeech';

/**
 * A view onto the assistant exchange.
 *
 * A subscription with **no cleanup that ends the exchange**, exactly like `useAgentRun`. The panel's window can be
 * dismissed by Android at any moment, and an unmount that ended the exchange would make the work's lifetime the
 * window's lifetime — which is the bug ADR 0016 exists to prevent, in a place where the system rather than the user
 * decides when the window goes.
 *
 * Ending the exchange is `dismiss()`, an explicit action.
 */
export const useAssistant = () => {
  const [snapshot, setSnapshot] = useState<AssistantSnapshot>(readAssistant);

  useEffect(() => subscribeToAssistant(setSnapshot), []);

  // Started when the panel mounts, so the engine is warm by the time the first answer arrives. Prepared here rather
  // than at app startup because it spins up a service and loads voice data.
  useEffect(() => {
    void prepareSpeech();
  }, []);

  /**
   * Speaks a pending answer, once.
   *
   * `pendingSpeech` is on the snapshot rather than delivered as an event because this root can mount *after* an
   * answer arrives — Android decides when the window appears, so an event would have been missed. `markSpoken`
   * clears it, which is what stops a re-render from saying the same thing twice.
   */
  useEffect(() => {
    if (snapshot.pendingSpeech === null) return;

    const text = snapshot.pendingSpeech;
    markSpoken();
    void speak(text);
  }, [snapshot.pendingSpeech]);

  return {
    ...snapshot,
    ask: askAssistant,

    /** Stops the answer and the voice together. Either alone leaves the other running. */
    stop: () => {
      void stopSpeaking();
      stopAssistantTurn();
    },

    /**
     * Closes the panel.
     *
     * Order matters: the voice is silenced first, then the exchange is cleared, then the window is asked to close.
     * Dismissing first would leave a voice talking about an answer whose panel has gone.
     */
    dismiss: () => {
      void stopSpeaking();
      endAssistantExchange();
      void dismissPanel();
    },
  };
};
