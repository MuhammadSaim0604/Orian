import { ThemeProvider } from '@mobile-automation/ui';
import { colorScheme } from 'nativewind';
import { type ReactNode, useEffect } from 'react';
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
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Themed>
          <CapabilityWatcher />
          <RootScreen />
        </Themed>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Applies the user's theme choice to **both** styling systems.
 *
 * There are two, and they are genuinely independent:
 *
 * - `useTheme()` returns the TypeScript theme object, for Skia and other imperative APIs that
 *   cannot use classNames. `ThemeProvider` resolves it from the `preference` prop.
 * - `className` styling resolves through NativeWind, which chooses between the light and dark
 *   CSS-variable blocks in `global.css` by evaluating `@media (prefers-color-scheme: dark)` against
 *   **its own** `colorScheme` observable — not against the prop above.
 *
 * That observable follows the OS until something calls `colorScheme.set`, so setting only the prop
 * left every `bg-background` and `text-text-primary` on the system scheme. Since nearly all visible
 * colour comes from classNames, the theme buttons appeared to do nothing whatsoever.
 *
 * Both are set here, from one value, so they cannot disagree.
 */
const Themed = ({ children }: { readonly children: ReactNode }) => {
  // `null` means follow the system setting, which both systems spell 'system'.
  const themePreference = useShellStore((state) => state.themePreference);
  const preference = themePreference ?? 'system';

  useEffect(() => {
    colorScheme.set(preference);
  }, [preference]);

  return <ThemeProvider preference={preference}>{children}</ThemeProvider>;
};

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
