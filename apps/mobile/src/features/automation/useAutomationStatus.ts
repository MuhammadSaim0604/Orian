import {
  type AutomationStatus,
  addAutomationListener,
  getStatus,
  isAvailable,
} from '@mobile-automation/native-automation';
import { useCallback, useEffect, useState } from 'react';

const UNAVAILABLE: AutomationStatus = {
  isReady: false,
  canCaptureScreen: false,
  canDrawOverlay: false,
  // Not a claim that the user revoked anything - there is simply no module to ask.
  statusKnown: false,
};

/**
 * Tracks whether automation is currently possible.
 *
 * Seeded synchronously from `getStatus()` so the first paint shows the real state
 * rather than flashing "unavailable", then kept current by the native
 * `automationStatusChanged` event - which matters because the user can revoke the
 * accessibility grant or stop screen capture from the notification at any moment,
 * and the UI should reflect that immediately rather than on the next action.
 */
export const useAutomationStatus = (): {
  status: AutomationStatus;
  bridgeAvailable: boolean;
  refresh: () => void;
} => {
  const bridgeAvailable = isAvailable();

  const [status, setStatus] = useState<AutomationStatus>(() =>
    bridgeAvailable ? getStatus() : UNAVAILABLE,
  );

  const refresh = useCallback(() => {
    setStatus(isAvailable() ? getStatus() : UNAVAILABLE);
  }, []);

  useEffect(() => {
    if (!bridgeAvailable) return;

    const subscription = addAutomationListener('automationStatusChanged', (event) => {
      setStatus({
        isReady: event.isReady,
        canCaptureScreen: event.canCaptureScreen,
        canDrawOverlay: event.canDrawOverlay,
        // A delivered event is a real reading by definition.
        statusKnown: true,
      });
    });

    // The native event carries every capability, but a read on mount is what makes the *first* paint
    // correct - the event only fires when something changes, so without this the screen would show
    // whatever it was seeded with until the user changed a permission.
    refresh();

    return () => subscription.remove();
  }, [bridgeAvailable, refresh]);

  return { status, bridgeAvailable, refresh };
};
