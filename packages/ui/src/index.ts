/**
 * `@mobile-automation/ui`
 *
 * Shared React Native components and the theme system. Screens compose these primitives
 * rather than styling from scratch, and no component here hardcodes a colour or spacing
 * value (ADR 0004).
 *
 * Components are written with `createElement` rather than JSX so the package stays `.ts`
 * throughout; a couple of `.tsx` files would split its build configuration for no gain.
 */

export const PACKAGE_NAME = '@mobile-automation/ui' as const;

export * from './theme';
export * from './components';
