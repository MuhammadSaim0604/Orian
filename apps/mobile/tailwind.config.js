const uiPreset = require('@mobile-automation/ui/tailwind-preset');

/**
 * The app extends the shared preset generated from the design tokens, so every
 * semantic class (`bg-surface`, `text-primary`) resolves identically here and
 * in any shared component (ADR 0004).
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  presets: [uiPreset],
  content: ['./src/**/*.{js,jsx,ts,tsx}', '../../packages/ui/src/**/*.{js,jsx,ts,tsx}'],
};
