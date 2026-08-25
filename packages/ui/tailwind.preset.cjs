/**
 * Tailwind/NativeWind preset generated from the design tokens.
 *
 * The app's `tailwind.config.js` extends this, so semantic classes such as
 * `bg-surface` and `text-primary` exist and resolve to the active scheme's
 * values. Dark mode is driven by the `class` strategy that NativeWind toggles.
 *
 * CommonJS because Tailwind loads its config synchronously.
 */

// Keep these values in sync with `src/theme/tokens.ts` and `src/theme/semantic.ts`.
// They are duplicated here only because Tailwind config must be CJS and cannot
// import the TypeScript sources.
const palette = {
  white: '#ffffff',
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
  emerald600: '#059669',
  amber400: '#fbbf24',
  amber500: '#f59e0b',
  red400: '#f87171',
  red600: '#dc2626',
  cyan400: '#22d3ee',
};

/**
 * Semantic colour with a light default and a dark variant. NativeWind resolves
 * `dark:` variants, so each token is declared once and varies by scheme.
 */
const semantic = {
  background: { light: palette.slate50, dark: palette.slate950 },
  surface: { light: palette.white, dark: palette.slate900 },
  'surface-raised': { light: palette.white, dark: palette.slate800 },
  'surface-muted': { light: palette.slate100, dark: palette.slate800 },
  border: { light: palette.slate200, dark: palette.slate700 },
  'border-strong': { light: palette.slate300, dark: palette.slate600 },
  'text-primary': { light: palette.slate900, dark: palette.slate50 },
  'text-secondary': { light: palette.slate600, dark: palette.slate300 },
  'text-muted': { light: palette.slate400, dark: palette.slate500 },
  'text-on-primary': { light: palette.white, dark: palette.white },
  primary: { light: palette.indigo600, dark: palette.indigo400 },
  'primary-hover': { light: palette.indigo700, dark: palette.indigo300 },
  'primary-muted': { light: palette.indigo300, dark: palette.indigo700 },
  success: { light: palette.emerald600, dark: palette.emerald400 },
  warning: { light: palette.amber500, dark: palette.amber400 },
  danger: { light: palette.red600, dark: palette.red400 },
  info: { light: palette.cyan400, dark: palette.cyan400 },
  'canvas-background': { light: palette.slate100, dark: palette.slate950 },
  'canvas-grid': { light: palette.slate200, dark: palette.slate800 },
  'node-surface': { light: palette.white, dark: palette.slate800 },
  'node-border': { light: palette.slate300, dark: palette.slate600 },
  'node-selected': { light: palette.indigo500, dark: palette.indigo400 },
  edge: { light: palette.slate400, dark: palette.slate600 },
  'edge-active': { light: palette.indigo500, dark: palette.indigo400 },
};

// Light values become the base colour; `dark:` variants come from the dark map.
const colors = Object.fromEntries(
  Object.entries(semantic).map(([name, value]) => [name, value.light]),
);

const darkColors = Object.fromEntries(
  Object.entries(semantic).map(([name, value]) => [name, value.dark]),
);

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors,
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '24px',
      },
      fontSize: {
        xs: '12px',
        sm: '14px',
        base: '16px',
        lg: '18px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '30px',
        '4xl': '36px',
      },
      spacing: {
        0.5: '2px',
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        5: '20px',
        6: '24px',
        8: '32px',
        10: '40px',
        12: '48px',
        16: '64px',
        20: '80px',
        24: '96px',
      },
    },
  },
  plugins: [
    // Emit `dark:` colour variants from the dark scheme map.
    function darkSchemeColors({ addUtilities }) {
      const utilities = {};
      for (const [name, value] of Object.entries(darkColors)) {
        utilities[`.dark-bg-${name}`] = { backgroundColor: value };
        utilities[`.dark-text-${name}`] = { color: value };
        utilities[`.dark-border-${name}`] = { borderColor: value };
      }
      addUtilities(utilities);
    },
  ],
};
