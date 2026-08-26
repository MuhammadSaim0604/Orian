const uiPreset = require('@mobile-automation/ui/tailwind-preset');

/**
 * NativeWind's own preset must be present, so it is listed alongside the shared
 * design-token preset. Semantic classes such as `bg-surface` come from the UI
 * package; the CSS variables they reference are declared in src/global.css
 * (ADR 0004).
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  presets: [require('nativewind/preset'), uiPreset],
  content: ['./src/**/*.{js,jsx,ts,tsx}', '../../packages/ui/src/**/*.{js,jsx,ts,tsx}'],
};
