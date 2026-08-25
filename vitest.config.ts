import { defineConfig } from 'vitest/config';

/**
 * Shared Vitest defaults. Packages inherit these; the RN app uses Jest instead
 * because it needs the React Native preset.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    reporters: ['default'],
  },
});
