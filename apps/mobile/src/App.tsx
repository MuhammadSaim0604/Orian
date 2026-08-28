import { ThemeProvider } from '@mobile-automation/ui';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import './global.css';
import { RootScreen } from './features/shell/RootScreen';

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
        <ThemeProvider>
          <RootScreen />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
