/**
 * The assembled theme: semantic colours plus the raw scales, exposed as a
 * single object. `useTheme()` returns this, which is how Skia and other
 * imperative APIs (which cannot use classNames) stay on-theme.
 */

import { type ColorSchemeName, type SemanticColors, semanticColors } from './semantic.js';
import {
  durations,
  elevation,
  fontSizes,
  fontWeights,
  lineHeights,
  radii,
  spacing,
} from './tokens.js';

export interface Theme {
  readonly name: ColorSchemeName;
  readonly colors: SemanticColors;
  readonly spacing: typeof spacing;
  readonly radii: typeof radii;
  readonly fontSizes: typeof fontSizes;
  readonly fontWeights: typeof fontWeights;
  readonly lineHeights: typeof lineHeights;
  readonly elevation: typeof elevation;
  readonly durations: typeof durations;
}

const buildTheme = (name: ColorSchemeName): Theme => ({
  name,
  colors: semanticColors[name],
  spacing,
  radii,
  fontSizes,
  fontWeights,
  lineHeights,
  elevation,
  durations,
});

export const lightTheme = buildTheme('light');
export const darkTheme = buildTheme('dark');

export const themes = {
  light: lightTheme,
  dark: darkTheme,
} as const;

/** What the user chose. `system` follows the OS setting. */
export type ThemePreference = ColorSchemeName | 'system';

/** Resolves a stored preference plus the OS scheme into a concrete theme. */
export const resolveTheme = (preference: ThemePreference, systemScheme: ColorSchemeName): Theme =>
  preference === 'system' ? themes[systemScheme] : themes[preference];
