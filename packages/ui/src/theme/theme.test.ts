/**
 * Theme tests import the token modules directly rather than the package
 * barrel, because the barrel pulls in `ThemeProvider`, which imports
 * `react-native` and cannot be loaded in a plain Node test environment. The
 * provider itself is covered by RN component tests in the app (Phase 6).
 */

import { describe, expect, it } from 'vitest';

import { semanticColors } from './semantic.js';
import { darkTheme, lightTheme, resolveTheme } from './theme.js';
import { palette, spacing } from './tokens.js';

describe('theme tokens', () => {
  it('defines light and dark schemes', () => {
    expect(Object.keys(semanticColors)).toEqual(['light', 'dark']);
  });

  it('gives light and dark the same semantic roles', () => {
    expect(Object.keys(semanticColors.light).sort()).toEqual(
      Object.keys(semanticColors.dark).sort(),
    );
  });

  it('inverts foreground and background between schemes', () => {
    expect(lightTheme.colors.background).not.toBe(darkTheme.colors.background);
    expect(lightTheme.colors.textPrimary).not.toBe(darkTheme.colors.textPrimary);
  });

  it('builds semantic colours from the raw palette', () => {
    expect(Object.values(palette)).toContain(lightTheme.colors.primary);
  });

  it('exposes canvas colours so Skia can stay on-theme', () => {
    expect(darkTheme.colors.canvasGrid).toBeTruthy();
    expect(darkTheme.colors.nodeSelected).toBeTruthy();
  });

  it('exposes the spacing scale on the theme', () => {
    expect(lightTheme.spacing[4]).toBe(spacing[4]);
  });
});

describe('resolveTheme', () => {
  it('honours an explicit dark preference', () => {
    expect(resolveTheme('dark', 'light').name).toBe('dark');
  });

  it('honours an explicit light preference', () => {
    expect(resolveTheme('light', 'dark').name).toBe('light');
  });

  it('follows the system scheme when set to system', () => {
    expect(resolveTheme('system', 'dark').name).toBe('dark');
    expect(resolveTheme('system', 'light').name).toBe('light');
  });
});
