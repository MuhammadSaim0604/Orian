import { ThemeProvider } from '@mobile-automation/ui';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import './global.css';
import { useCapabilityWatcher } from './features/permissions/useCapability';
import { RootScreen } from './features/shell/RootScreen';
import { useShellStore } from './features/shell/shellStore';

/**
 * App shell.
 *
 * `GestureHandlerRootView` must wrap everything and must fill the screen. Gesture
 * Handler only sees touches inside it, so a wrapper that does not stretch produces a
 * canvas that ignores pans in the area outside - a bug that looks like broken gesture
 * maths rather than a missing style.
 */
export default function App() {
  // Read here rather than inside the provider so the whole tree re-renders on a theme change.
  // `null` means follow the system setting, which is what `ThemeProvider` calls 'system'.
  const themePreference = useShellStore((state) => state.themePreference);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider preference={themePreference ?? 'system'}>
          <CapabilityWatcher />
          <RootScreen />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Keeps capability state current for the whole app.
 *
 * Its own component so the effects sit above every screen but below the providers, and so a
 * re-render from a permission change does not re-render `App` itself. Renders nothing.
 *
 * The load-bearing part is the app-resume listener inside the hook: four of the five required
 * permissions can only be granted in system settings, and Android gives no callback — returning to
 * the foreground is the only moment the app can learn the answer.
 */
const CapabilityWatcher = () => {
  useCapabilityWatcher();
  return null;
};
