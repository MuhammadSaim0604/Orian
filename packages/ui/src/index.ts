/**
 * `@mobile-automation/ui`
 *
 * Shared React Native components and the theme system. Screens compose these
 * primitives rather than styling from scratch, and no component here hardcodes
 * a colour or spacing value (ADR 0004).
 *
 * Phase 1 scaffold - the component library grows in Phase 6.
 */

export const PACKAGE_NAME = '@mobile-automation/ui' as const;

export * from './theme';
