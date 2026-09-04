import { ThemeProvider } from '@mobile-automation/ui';
import { colorScheme } from 'nativewind';
import { useEffect } from 'react';

import '../global.css';
import { AssistPanel } from '../features/assistant/AssistPanel';
import { useShellStore } from '../features/shell/shellStore';

/**
 * Root for the Orion Assist panel.
 *
 * A **fourth** React root — the app, the node toolset, the agent status strip, and this — mounted by Kotlin into
 * the voice-interaction session's own window. It repeats the theme provider and the CSS import because it shares
 * no ancestor with any of the others.
 *
 * ## No bound id, unlike the other two
 *
 * `OverlayRoot` takes a node id and `AgentOverlayRoot` takes a run id, and both render nothing without one. This
 * root takes neither, and that absence is the feature: Orion Assist has no session and no run to bind to. Its
 * state lives in `assistantController`, a module this root imports directly.
 *
 * What does cross as a prop is whether Android shared the screen this time — knowable only at the moment of
 * summoning, and worth telling the user about because they can change it.
 *
 * Deliberately thin: no gesture handler root and no safe-area provider. The session owns the window and has
 * already accounted for the system bars, and the panel must appear the instant the gesture is used.
 */
export default function AssistPanelRoot({
  hasScreenContext,
}: {
  readonly hasScreenContext?: boolean;
}) {
  const themePreference = useShellStore((state) => state.themePreference);
  const preference = themePreference ?? 'system';

  useEffect(() => {
    // NativeWind's colour scheme is per process rather than per root, so this is idempotent — but it has to happen
    // here too, because this can easily be the first root to mount: the assist gesture works whether or not the app
    // has ever been opened.
    colorScheme.set(preference);
  }, [preference]);

  return (
    <ThemeProvider preference={preference}>
      {/* Defaulted to true rather than false. A missing initial prop means the native side failed to pass it, not
          that context was withheld — and warning about a setting the user has not actually changed would send them
          to fix something that is not broken. */}
      <AssistPanel hasScreenContext={hasScreenContext ?? true} />
    </ThemeProvider>
  );
}
