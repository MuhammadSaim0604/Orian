---
name: theme-and-styling-nativewind
description: Set up NativeWind, global styles, design tokens, and light/dark theme management for the React Native app. Use when configuring styling or building any themed UI.
---

# Skill: Theme & Styling Master (NativeWind + Global Theme)

## When to use

You are setting up styling, global styles, or theme management, or building any themed UI. Establish this in Phase 1; apply it in every UI phase (6, 8).

## Principles

- **Single source of truth for design tokens.** Colors, spacing, radii, typography, shadows live in one theme definition consumed everywhere.
- **NativeWind for styling**, driven by the token set — no ad-hoc `StyleSheet` colors, no magic numbers.
- **Semantic tokens, not raw values.** Components use `bg-surface`, `text-primary`, `border-muted` — not `bg-[#111]`. Semantic names let light/dark and re-theming work without touching components.
- **Theme lives in `packages/ui`** so the app and any shared components use the same system.

## Structure

```
packages/ui/
├── theme/
│   ├── tokens.ts        # raw scales: palette, spacing, radii, fontSizes
│   ├── semantic.ts      # semantic mapping per scheme (light/dark)
│   ├── theme.ts         # assembled Theme type + default themes
│   └── ThemeProvider.tsx
├── components/          # themed primitives (Button, Card, Text, Input…)
└── tailwind.preset.js   # NativeWind/Tailwind preset built from tokens
```

## Procedure

### 1. Define raw tokens
Palette, spacing scale, radii, font sizes/weights, shadows — plain objects in `tokens.ts`.

### 2. Map semantic tokens
In `semantic.ts`, map meaning → value per scheme:
```
light: { surface: palette.white, primary: palette.indigo600, textPrimary: palette.slate900, ... }
dark:  { surface: palette.slate900, primary: palette.indigo400, textPrimary: palette.slate50,  ... }
```

### 3. Build the Tailwind/NativeWind preset
Generate `tailwind.preset.js` from the semantic tokens so classes like `bg-surface` and `text-primary` exist. The app's `tailwind.config.js` extends this preset. Wire NativeWind's Babel/Metro config.

### 4. ThemeProvider
- Provide the active scheme (light/dark/system) via context.
- Expose a `useTheme()` hook for cases needing raw values (e.g., Skia canvas colors, which aren't className-driven).
- Persist the user's scheme choice.

### 5. Themed primitives
Build `Button`, `Card`, `Text`, `Input`, `Icon`, etc. in `packages/ui/components`, styled only with semantic classes. Screens compose these instead of styling from scratch.

### 6. Canvas/Skia theming
Skia draws with raw color values, not classNames. Pull those from `useTheme()` so the canvas follows the active scheme too.

## Checklist

- [ ] All tokens defined once in `packages/ui/theme`.
- [ ] Components use semantic classes, never raw hex or magic numbers.
- [ ] NativeWind preset generated from tokens; app extends it.
- [ ] Light/dark (and system) switch works without editing components.
- [ ] `useTheme()` supplies raw values to Skia/canvas.
- [ ] Themed primitives exist and are reused across screens.
