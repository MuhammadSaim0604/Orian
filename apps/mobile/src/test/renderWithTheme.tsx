import { ThemeProvider } from '@mobile-automation/ui';
import { render as rtlRender } from '@testing-library/react-native';
import { type ReactElement } from 'react';

/**
 * Renders inside the app's providers.
 *
 * `useTheme` throws outside `ThemeProvider` deliberately - a component silently falling back
 * to default colours would be worse than a loud failure - so any component using a themed
 * primitive has to be rendered through this rather than through `render` directly.
 */
export const renderWithTheme = (element: ReactElement) =>
  rtlRender(<ThemeProvider>{element}</ThemeProvider>);
