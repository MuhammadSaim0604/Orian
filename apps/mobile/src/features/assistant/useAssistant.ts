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
import {
  dismissPanel,
  onPanelHidden,
  onPanelShown,
  onScreenContextChanged,
  prepareSpeech,
  speak,
  stopSpeaking,
} from './assistSpeech';

/**
 * A view onto the assistant exchange.
 *
 * A subscription with **no cleanup that ends the exchange**, exactly like `useAgentRun`. The panel's window can be
 * dismissed by Android at any moment, and an unmount that ended the exchange would make the work's lifetime the
 * window's lifetime — which is the bug ADR 0016 exists to prevent, in a place where the system rather than the user
 * decides when the window goes.
 *
 * Ending the exchange is `dismiss()`, an explicit action — or the native hide event.
 *
 * ## Why show and hide are events here
 *
 * The panel's React tree is built once per session and stays mounted between summonings: a stopped React surface
 * cannot be restarted, which is why the first version opened exactly once. So this hook cannot use mounting to mean
 * "a new question is being asked" — it listens for `assistPanelShown` instead, and that is what clears the previous
 * exchange.
 */
export const useAssistant = () => {
  const [snapshot, setSnapshot] = useState<AssistantSnapshot>(readAssistant);

  /**
   * Window insets and screen context, from the native show event.
   *
   * Held here rather than in the controller because they describe the *window*, not the exchange, and the controller
   * is deliberately ignorant of anything visual.
   *
   * The bottom inset starts at the same fallback the native side uses. A first paint with zero padding would put the
   * send button under the navigation bar for a frame, which is exactly the defect being fixed.
   */
  const [chrome, setChrome] = useState<{
    readonly hasScreenContext: boolean;
    readonly topInsetDp: number;
    readonly bottomInsetDp: number;
  }>({ hasScreenContext: true, topInsetDp: 0, bottomInsetDp: 24 });

  useEffect(() => subscribeToAssistant(setSnapshot), []);

  useEffect(() => {
    const subscriptions = [
      onPanelShown((event) => {
        setChrome(event);

        // A new summoning is a new conversation. The tree did not remount, so this is the only thing that makes each
        // invocation its own exchange rather than a continuation of the last one.
        endAssistantExchange();
        void stopSpeaking();
      }),

      onPanelHidden(() => {
        // The window is going; the voice must go with it. A voice still talking about an answer whose panel has
        // gone is the most irritating failure this feature has.
        void stopSpeaking();
        endAssistantExchange();
      }),

      onScreenContextChanged((hasScreenContext) => {
        // Assist data arrives after the show, so the first answer can change a moment later.
        setChrome((current) => ({ ...current, hasScreenContext }));
      }),
    ];

    return () => {
      for (const subscription of subscriptions) subscription.remove();
    };
  }, []);

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
    ...chrome,
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
