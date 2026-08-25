import { ThemeProvider } from '@mobile-automation/ui';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import './global.css';
import { HomeScreen } from './features/home/HomeScreen';

/**
 * App shell. Phase 1 renders a single themed placeholder screen to prove the
 * monorepo, NativeWind, and the shared theme are wired end to end. Navigation
 * and the real screens arrive with the builder UI in Phase 6.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <HomeScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
