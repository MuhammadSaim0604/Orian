/**
 * `ThemeProvider` and `useTheme`.
 *
 * Class-based styling covers most of the UI via NativeWind. This context
 * exists for the cases that cannot use classNames - Skia canvas drawing, chart
 * colours, imperative animation values - so those still follow the active
 * theme instead of hardcoding colours.
 */

import { createContext, createElement, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { type ColorSchemeName } from './semantic.js';
import { type Theme, type ThemePreference, resolveTheme } from './theme.js';

export interface ThemeContextValue {
  readonly theme: Theme;
  /** What the user selected, which may be `system`. */
  readonly preference: ThemePreference;
  /** The scheme actually in effect after resolving `system`. */
  readonly scheme: ColorSchemeName;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export interface ThemeProviderProps {
  readonly children: ReactNode;
  /** Defaults to following the OS setting. */
  readonly preference?: ThemePreference;
}

export const ThemeProvider = ({
  children,
  preference = 'system',
}: ThemeProviderProps): ReturnType<typeof createElement> => {
  const systemScheme: ColorSchemeName = useColorScheme() === 'dark' ? 'dark' : 'light';

  const value = useMemo<ThemeContextValue>(() => {
    const theme = resolveTheme(preference, systemScheme);
    return { theme, preference, scheme: theme.name };
  }, [preference, systemScheme]);

  return createElement(ThemeContext.Provider, { value }, children);
};

/** Access the active theme. Throws if used outside `ThemeProvider`. */
export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used inside a ThemeProvider');
  }
  return context;
};

/** Raw semantic colours, for Skia and other imperative drawing APIs. */
export const useThemeColors = (): Theme['colors'] => useTheme().theme.colors;
