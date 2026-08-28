import { ThemeProvider } from '@mobile-automation/ui';
import { render as rtlRender } from '@testing-library/react-native';
import { type ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

/**
 * Renders inside the app's providers.
 *
 * Two providers, both for the same reason: they fail loudly rather than falling back, which is the
 * right behaviour in the app and means tests have to supply them.
 *
 * - `useTheme` throws outside `ThemeProvider`, because a component silently using default colours
 *   would be a worse bug than a crash.
 * - `useSafeAreaInsets` throws outside `SafeAreaProvider`. Every screen the shell renders reads
 *   insets, so from Step 1 onward this is not optional.
 *
 * The frame is supplied explicitly. `SafeAreaProvider` normally measures a real window, and under
 * Jest there is none — without initial metrics it renders nothing at all and every query fails with
 * an empty tree, which looks like a broken component rather than a missing measurement.
 */
const TEST_FRAME = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export const renderWithTheme = (element: ReactElement) =>
  rtlRender(
    <SafeAreaProvider initialMetrics={TEST_FRAME}>
      <ThemeProvider>{element}</ThemeProvider>
    </SafeAreaProvider>,
  );
