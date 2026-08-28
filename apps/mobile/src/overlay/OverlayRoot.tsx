import { ThemeProvider } from '@mobile-automation/ui';

import '../global.css';
import { ConfigureOverlay } from '../features/overlay/ConfigureOverlay';

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
  // A missing node id means the native side failed to pass its initial prop. Rendering an
  // unbound toolset would let the user configure a step nobody chose, so this says so instead.
  if (nodeId === undefined || nodeId === '') {
    return null;
  }

  return (
    <ThemeProvider>
      <ConfigureOverlay nodeId={nodeId} />
    </ThemeProvider>
  );
}
