/**
 * Raw design tokens - the single source of truth for every visual value in the
 * product. Components never use these directly; they use the semantic tokens
 * built on top (see `semantic.ts`) so the app can be re-themed without
 * touching a single component (ADR 0004).
 */

/** Raw colour palette. Add a shade here, not in a component. */
export const palette = {
  white: '#ffffff',
  black: '#000000',

  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate300: '#cbd5e1',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1e293b',
  slate900: '#0f172a',
  slate950: '#020617',

  indigo300: '#a5b4fc',
  indigo400: '#818cf8',
  indigo500: '#6366f1',
  indigo600: '#4f46e5',
  indigo700: '#4338ca',

  emerald400: '#34d399',
  emerald500: '#10b981',
  emerald600: '#059669',

  amber400: '#fbbf24',
  amber500: '#f59e0b',

  red400: '#f87171',
  red500: '#ef4444',
  red600: '#dc2626',

  cyan400: '#22d3ee',
  violet400: '#a78bfa',
} as const;

/** Spacing scale in density-independent pixels. */
export const spacing = {
  0: 0,
  px: 1,
  0.5: 2,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
} as const;

export const radii = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  full: 9999,
} as const;

export const fontSizes = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
} as const;

export const fontWeights = {
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const lineHeights = {
  tight: 1.25,
  normal: 1.5,
  relaxed: 1.75,
} as const;

/** Elevation presets. Kept small and named by intent, not by shadow values. */
export const elevation = {
  none: 0,
  low: 2,
  medium: 6,
  high: 12,
} as const;

/** Durations in milliseconds for canvas and UI animation. */
export const durations = {
  instant: 0,
  fast: 120,
  normal: 200,
  slow: 320,
} as const;

export type Palette = typeof palette;
export type Spacing = typeof spacing;
export type Radii = typeof radii;
export type FontSizes = typeof fontSizes;
