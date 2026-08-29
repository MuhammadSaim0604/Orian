import { ThemeProvider } from '@mobile-automation/ui';
import { colorScheme } from 'nativewind';
import { useEffect } from 'react';

import '../global.css';
import { AgentStatusOverlay } from '../features/agent-overlay/AgentStatusOverlay';
import { useShellStore } from '../features/shell/shellStore';

/**
 * Root for the agent status overlay window.
 *
 * A **third** React root — the app, the node toolset, and this — mounted by Kotlin into a
 * `WindowManager` window. It repeats the theme provider and the CSS import because it shares no
 * ancestor with either of the others.
 *
 * The run itself is not passed in. It lives in `runController`, a module every root imports (ADR 0016),
 * so this root subscribes to the same run the in-app chat is showing without anything being sent
 * between them. Only the run id crosses as a prop, and only so the overlay can never render unbound.
 *
 * Deliberately thin: no gesture handler root and no safe-area provider. The window is positioned by
 * `AgentOverlayGeometry`, which already accounts for the system bars, and it must appear the moment a
 * run starts.
 */
export default function AgentOverlayRoot({ runId }: { readonly runId?: string }) {
  // Read from the store module every root imports — the only state they share. Without it the overlay
  // would follow the OS theme while the app followed the user's choice, which is most visible in
  // exactly the situation this overlay exists for.
  const themePreference = useShellStore((state) => state.themePreference);
  const preference = themePreference ?? 'system';

  useEffect(() => {
    // NativeWind's colour scheme is per process rather than per root, so this is idempotent — but it
    // has to happen here too, because this can be the first root to mount if the app was killed and
    // only the overlay was restored.
    colorScheme.set(preference);
  }, [preference]);

  // A missing run id means the native side failed to pass its initial prop. An unbound status overlay
  // would show a stop button that belongs to no run, so it renders nothing instead.
  if (runId === undefined || runId === '') {
    return null;
  }

  return (
    <ThemeProvider preference={preference}>
      <AgentStatusOverlay runId={runId} />
    </ThemeProvider>
  );
}
