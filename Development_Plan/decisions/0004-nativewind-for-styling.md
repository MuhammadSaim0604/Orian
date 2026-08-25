# ADR 0004 - NativeWind + centralized design tokens

**Status:** Accepted

## Context

The app needs a professional, consistent look across many surfaces (canvas, node editor, inspectors, agent UI, floating overlay) plus light/dark support. Hardcoded `StyleSheet` colors scattered across screens make re-theming impossible.

## Decision

Use **NativeWind** for styling, driven by a **single source of truth for design tokens** in `packages/ui/theme`.

- Raw scales (palette, spacing, radii, typography) in `tokens.ts`.
- **Semantic** tokens per scheme in `semantic.ts` (`surface`, `primary`, `textPrimary`, ...).
- A generated Tailwind/NativeWind preset so components use semantic classes (`bg-surface`, `text-primary`) - never raw hex or magic numbers.
- A `ThemeProvider` + `useTheme()` hook supplies raw values where classNames do not apply (Skia canvas drawing).

## Consequences

- **Positive:** light/dark and future re-theming require no component edits; consistent spacing and color by construction.
- **Positive:** the theme lives in a shared package, so app and shared components cannot drift.
- **Negative:** NativeWind adds Babel/Metro configuration and a build-time step.
- **Rule that follows:** no hardcoded style values anywhere; Skia colors come from `useTheme()`.
