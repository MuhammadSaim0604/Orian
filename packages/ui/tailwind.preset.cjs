/**
 * Tailwind/NativeWind preset generated from the design tokens.
 *
 * Semantic colours resolve through CSS variables rather than literal hex
 * values, which is how NativeWind v4 supports theming: `src/global.css`
 * declares the light values on `:root` and overrides them for dark mode, so a
 * single class such as `bg-surface` follows the active scheme without any
 * component change (ADR 0004).
 *
 * CommonJS because Tailwind loads its config synchronously.
 */

/** Semantic colour roles. Values come from the CSS variables in global.css. */
const SEMANTIC_COLOR_ROLES = [
  'background',
  'surface',
  'surface-raised',
  'surface-muted',
  'border',
  'border-strong',
  'text-primary',
  'text-secondary',
  'text-muted',
  'text-on-primary',
  'primary',
  'primary-hover',
  'primary-muted',
  'success',
  'warning',
  'danger',
  'info',
  'canvas-background',
  'canvas-grid',
  'node-surface',
  'node-border',
  'node-selected',
  'edge',
  'edge-active',
];

const colors = Object.fromEntries(
  SEMANTIC_COLOR_ROLES.map((role) => [role, `rgb(var(--color-${role}) / <alpha-value>)`]),
);

/** @type {import('tailwindcss').Config} */
module.exports = {
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
};
