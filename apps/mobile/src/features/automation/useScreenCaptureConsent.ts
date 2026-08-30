import {
  isAutomationError,
  releaseScreenCapture,
  requestScreenCaptureConsent,
} from '@mobile-automation/native-automation';
import { useCallback, useState } from 'react';

export type ConsentState = 'idle' | 'requesting' | 'granted' | 'declined' | 'failed';

/**
 * Drives the MediaProjection consent flow.
 *
 * This is the caller Phase 2 was missing: the Kotlin capture pipeline existed but
 * nothing could grant it a session, because launching the system dialog needs an
 * Activity and therefore belongs to the RN layer.
 *
 * Consent is **per session** and cannot be persisted
 * (`conventions/Permission_Model.md`), so this must be run again after a restart or
 * after the user stops the recording from the notification shade. Declining is a
 * legitimate choice, not an error - it produces `declined`, not `failed`, so the UI
 * can explain the consequence instead of showing a scary message.
 */
export const useScreenCaptureConsent = (): {
  state: ConsentState;
  errorMessage: string | null;
  request: () => Promise<boolean>;
  release: () => Promise<void>;
} => {
  const [state, setState] = useState<ConsentState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const request = useCallback(async (): Promise<boolean> => {
    setState('requesting');
    setErrorMessage(null);

    try {
      // Resolves once the answer is genuinely known, which is later than it looks: on API 34+ the
      // native side has to bring a mediaProjection foreground service up before the projection can be
      // created, so `granted` false can mean either "the user declined" or "consent was accepted and
      // the service could not start". The panel distinguishes those by reading the capability state
      // afterwards, because only the second one is worth telling the user how to fix.
      const granted = await requestScreenCaptureConsent();
      setState(granted ? 'granted' : 'declined');
      return granted;
    } catch (error) {
      setState('failed');
      setErrorMessage(
        isAutomationError(error) ? error.message : 'Could not ask for screen capture permission',
      );
      return false;
    }
  }, []);

  const release = useCallback(async (): Promise<void> => {
    try {
      await releaseScreenCapture();
      setState('idle');
    } catch {
      // Releasing is best-effort: the session may already be gone because the user
      // stopped it themselves, which is not worth surfacing.
      setState('idle');
    }
  }, []);

  return { state, errorMessage, request, release };
};
