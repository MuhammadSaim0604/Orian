import { ThemeProvider } from '@mobile-automation/ui';
import { colorScheme } from 'nativewind';
import { useEffect } from 'react';

import '../global.css';
import { ConfigureOverlay } from '../features/overlay/ConfigureOverlay';
import { useShellStore } from '../features/shell/shellStore';

/**
 * Root for the overlay window.
 *
 * A **second** React root, registered separately and mounted by Kotlin into a `WindowManager`
 * window. It repeats the theme provider and the CSS import because it shares no ancestor with the
 * app's root - two roots in one process, not one tree in two places.
 *
 * Deliberately thinner than `App`: no gesture handler root and no safe-area provider. The overlay
 * is a small floating panel positioned by `OverlayGeometry`, which already accounts for the system
 * bars, and it must start instantly.
 */
export default function OverlayRoot({ nodeId }: { readonly nodeId?: string }) {
  // Read from the store module both roots import — the only state they share (ADR 0011). Without
  // this the overlay would follow the OS scheme while the app followed the user's choice, which is
  // most visible in exactly the case the overlay exists for: floating over another app.
  const themePreference = useShellStore((state) => state.themePreference);
  const preference = themePreference ?? 'system';

  useEffect(() => {
    // NativeWind's colour scheme is per process, not per root, so this is idempotent rather than
    // duplicated work - but it must be set here too, because the overlay can be the first root to
    // mount if the app was killed and only the overlay was restored.
    colorScheme.set(preference);
  }, [preference]);

  // A missing node id means the native side failed to pass its initial prop. Rendering an
  // unbound toolset would let the user configure a step nobody chose, so this says so instead.
  if (nodeId === undefined || nodeId === '') {
    return null;
  }

  return (
    <ThemeProvider preference={preference}>
      <ConfigureOverlay nodeId={nodeId} />
    </ThemeProvider>
  );
}
