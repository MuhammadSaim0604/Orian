import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid } from 'react-native';

import { setListening, setPartialSpeech } from './assistantController';
import {
  type AssistantSpeechError,
  cancelListening,
  hasMicrophonePermission,
  isSpeechAvailable,
  onSpeechEnd,
  onSpeechError,
  onSpeechLevel,
  onSpeechPartial,
  onSpeechResult,
  startListening,
  stopListening,
} from './assistSpeech';

/**
 * The microphone button's behaviour.
 *
 * ## Just-in-time permission
 *
 * `RECORD_AUDIO` is requested on **first tap of the mic**, never during onboarding. Someone who only ever summons
 * the panel and types should not be asked for their microphone at all, and a permission requested before it is
 * needed is a permission the user cannot evaluate.
 *
 * `PermissionsAndroid` is used directly rather than the capability registry, deliberately: the registry describes
 * the permissions that gate device tools, and adding a microphone entry there would put it on the tools page
 * beside things the agent uses to drive the phone. This one belongs to a single button.
 *
 * ## Why the transcript goes through the controller
 *
 * Partial speech is published to `assistantController` rather than held in local state, because the panel is a
 * separate React root that Android can dismiss mid-sentence. State in a component would vanish with it; state in
 * the module survives long enough for the exchange to end cleanly.
 */

export type UseAssistMicResult = {
  readonly available: boolean;
  readonly listening: boolean;
  /** 0 to 1, for the level indicator. Smoothed, because raw RMS jitters enough to look broken. */
  readonly level: number;
  readonly error: AssistantSpeechError | null;
  readonly start: () => void;
  readonly stop: () => void;
};

/** Above this the meter is at full. Speech rarely exceeds it, and a scale nobody reaches looks dead. */
const MAX_RMS_DB = 10;

export const useAssistMic = (onTranscript: (text: string) => void): UseAssistMicResult => {
  const [listening, setListeningState] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<AssistantSpeechError | null>(null);

  // Held in a ref so the subscriptions below never need to re-register when the callback identity changes — a
  // re-registered speech listener drops the result that arrives between teardown and setup.
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const available = isSpeechAvailable();

  useEffect(() => {
    const subscriptions = [
      onSpeechPartial((text) => {
        setPartialSpeech(text);
      }),

      onSpeechResult((text) => {
        setListeningState(false);
        setListening(false);
        setLevel(0);
        onTranscriptRef.current(text);
      }),

      onSpeechError((code) => {
        setListeningState(false);
        setListening(false);
        setLevel(0);
        setError(code);
      }),

      onSpeechLevel((rms) => {
        // Clamped and normalised here rather than in the panel: a level meter fed raw decibels either barely moves
        // or pins to full, depending on the device.
        setLevel(Math.max(0, Math.min(1, rms / MAX_RMS_DB)));
      }),

      onSpeechEnd(() => {
        setLevel(0);
      }),
    ];

    return () => {
      for (const subscription of subscriptions) subscription.remove();

      // Cancelled rather than stopped on unmount: an unmounting panel is a dismissed panel, and delivering a
      // transcript to a window that has gone would answer a question nobody is waiting for.
      void cancelListening();
    };
  }, []);

  const start = useCallback(() => {
    setError(null);

    void (async () => {
      if (!hasMicrophonePermission()) {
        // `PERMISSIONS.RECORD_AUDIO` is typed as possibly undefined because the constant map is platform-dependent.
        // The literal is used as the fallback rather than a non-null assertion, so a platform without the constant
        // still asks for the right permission instead of throwing.
        const permission =
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO ?? 'android.permission.RECORD_AUDIO';

        const granted = await PermissionsAndroid.request(permission, {
          title: 'Let Orion hear you',
          message: 'Orion needs the microphone to listen to what you ask.',
          buttonPositive: 'Allow',
          buttonNegative: 'Not now',
        });

        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          setError('microphone_denied');
          return;
        }
      }

      try {
        await startListening();
        setListeningState(true);
        setListening(true);
      } catch {
        setError('failed');
      }
    })();
  }, []);

  const stop = useCallback(() => {
    setListeningState(false);
    setListening(false);
    setLevel(0);
    void stopListening();
  }, []);

  return { available, listening, level, error, start, stop };
};
