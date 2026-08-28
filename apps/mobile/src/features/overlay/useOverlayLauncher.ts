import {
  OverlayError,
  hasOverlayPermission,
  hideOverlay,
  isOverlayAvailable,
  onOverlayDismissed,
  requestOverlayPermission,
  showOverlay,
} from '@mobile-automation/native-automation';
import { useCallback, useEffect, useState } from 'react';

/**
 * Opening the Configure-with-AI overlay from the node editor.
 *
 * The permission is the awkward part. `SYSTEM_ALERT_WINDOW` has no runtime prompt - it can only be
 * granted in Settings - so the flow is: try, discover it is missing, offer to open Settings, and
 * re-check when the user comes back. Anything smoother is not available on Android.
 */

export type OverlayLauncher = {
  readonly available: boolean;
  readonly granted: boolean | null;
  readonly showing: boolean;
  /** Set when the last attempt failed for a reason the user should see. */
  readonly error: string | null;
  /** True when the failure is a missing permission, so the UI can offer Settings. */
  readonly needsPermission: boolean;
  open: (nodeId: string) => void;
  close: () => void;
  openSettings: () => void;
  recheck: () => void;
};

export const useOverlayLauncher = (): OverlayLauncher => {
  const [granted, setGranted] = useState<boolean | null>(null);
  const [showing, setShowing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);

  const recheck = useCallback(() => {
    void hasOverlayPermission().then(setGranted);
  }, []);

  useEffect(recheck, [recheck]);

  useEffect(() => {
    // The overlay can be dismissed from inside itself, and the window can be torn down with the
    // React context. Without this the button would keep claiming the toolset is open.
    const subscription = onOverlayDismissed(() => setShowing(false));
    return () => subscription.remove();
  }, []);

  const open = useCallback((nodeId: string) => {
    setError(null);
    setNeedsPermission(false);

    void showOverlay(nodeId)
      .then(() => {
        setShowing(true);
        setGranted(true);
      })
      .catch((cause: unknown) => {
        if (cause instanceof OverlayError && cause.needsUserAction) {
          setNeedsPermission(true);
          setGranted(false);
          setError('The floating toolset needs permission to display over other apps.');
          return;
        }

        setError(
          cause instanceof Error ? cause.message : 'The floating toolset could not be opened.',
        );
      });
  }, []);

  const close = useCallback(() => {
    void hideOverlay().then(() => setShowing(false));
  }, []);

  const openSettings = useCallback(() => {
    void requestOverlayPermission().catch((cause: unknown) => {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Android settings for this permission could not be opened.',
      );
    });
  }, []);

  return {
    available: isOverlayAvailable(),
    granted,
    showing,
    error,
    needsPermission,
    open,
    close,
    openSettings,
    recheck,
  };
};
