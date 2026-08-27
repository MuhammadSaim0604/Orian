import { z } from 'zod';

/**
 * Selector schemas: how a workflow describes the element it wants to act on.
 *
 * The most important model in the product. A workflow that stores only
 * coordinates breaks the moment an app updates its layout, so a selector carries
 * every clue the recorder managed to capture and the resolver walks them
 * strongest-first (ADR 0009).
 *
 * Mirrors the Kotlin `Selector` in `android/accessibility` and the TypeScript
 * `Selector` in `packages/native-automation`. This is the validated,
 * serializable form - the one that ends up inside workflow JSON.
 */

/**
 * Resolution order, strongest first. Coordinates are a last resort and vision is
 * the final fallback.
 */
export const SELECTOR_STRATEGIES = [
  'resourceId',
  'accessibilitySemantics',
  'text',
  'structural',
  'relativePosition',
  'coordinates',
  'vision',
] as const;

export const SelectorStrategySchema = z.enum(SELECTOR_STRATEGIES);

export type SelectorStrategy = z.infer<typeof SelectorStrategySchema>;

/** How strongly a strategy identifies an element. Lower is better. */
export const strategyRank = (strategy: SelectorStrategy): number =>
  SELECTOR_STRATEGIES.indexOf(strategy);

/** True when a match relied on pixels rather than meaning. */
export const isFragileStrategy = (strategy: SelectorStrategy): boolean =>
  strategy === 'coordinates' || strategy === 'vision';

/** Screen rectangle in device pixels. */
export const BoundsSchema = z
  .object({
    left: z.number().int(),
    top: z.number().int(),
    right: z.number().int(),
    bottom: z.number().int(),
  })
  .refine((bounds) => bounds.right > bounds.left && bounds.bottom > bounds.top, {
    // A zero-area rectangle cannot be tapped, so accepting one would store a
    // selector that is guaranteed to fail at run time.
    message: 'bounds must have positive width and height',
  });

export type Bounds = z.infer<typeof BoundsSchema>;

/** Screen point in device pixels. */
export const PointSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
});

export type Point = z.infer<typeof PointSchema>;

/**
 * The screen a selector was recorded on.
 *
 * Both fields together, because one package renders many screens: a "Send"
 * selector from a WhatsApp conversation must not resolve against the chat list,
 * where it could find a plausible but wrong element.
 */
export const ScreenScopeSchema = z.object({
  packageName: z.string().min(1),
  activityName: z.string().min(1).optional(),
});

export type ScreenScope = z.infer<typeof ScreenScopeSchema>;

/** Fields that can actually locate an element, as opposed to narrowing a search. */
const LOCATING_FIELDS = [
  'resourceId',
  'contentDescription',
  'text',
  'structuralPath',
  'bounds',
  'coordinates',
] as const;

const SelectorShape = z.object({
  /** Fully-qualified (`com.app:id/send`) or short (`send`) resource id. */
  resourceId: z.string().min(1).optional(),
  contentDescription: z.string().min(1).optional(),
  text: z.string().min(1).optional(),
  /** Narrows a search; cannot locate on its own. */
  className: z.string().min(1).optional(),
  /** Child-index path from the root, e.g. `0.2.1`. */
  structuralPath: z
    .string()
    .regex(/^\d+(\.\d+)*$/, 'structuralPath must be dot-separated child indices, e.g. "0.2.1"')
    .optional(),
  /** Bounds recorded at capture time, for relative and coordinate matching. */
  bounds: BoundsSchema.optional(),
  /** Explicit tap point. Used only when nothing else identifies the element. */
  coordinates: PointSchema.optional(),
  packageName: z.string().min(1).optional(),
  activityName: z.string().min(1).optional(),
  /** Require the match to be actionable: clickable or editable, and enabled. */
  requireActionable: z.boolean().optional(),
  /** Match text exactly rather than trimmed and case-insensitively. */
  exactText: z.boolean().optional(),
});

/**
 * A validated selector.
 *
 * Rejects a selector with nothing to locate by. Such a selector is not merely
 * useless - it resolves to nothing at run time and reports "element not found",
 * which sends the user looking at the screen rather than at their workflow.
 */
export const SelectorSchema = SelectorShape.refine(
  (selector) => LOCATING_FIELDS.some((field) => selector[field] != null),
  {
    message:
      'selector needs at least one locating field: ' +
      'resourceId, contentDescription, text, structuralPath, bounds, or coordinates',
  },
);

export type Selector = z.infer<typeof SelectorSchema>;

/**
 * Which strategies a selector could be resolved by, strongest first.
 *
 * Used by the builder UI to show how durable a step is, and by the generator to
 * decide whether a recorded step needs strengthening before being saved.
 */
export const availableStrategies = (selector: Selector): SelectorStrategy[] => {
  const strategies: SelectorStrategy[] = [];

  if (selector.resourceId != null) strategies.push('resourceId');
  if (selector.contentDescription != null) strategies.push('accessibilitySemantics');
  if (selector.text != null) strategies.push('text');
  if (selector.structuralPath != null) strategies.push('structural');
  if (selector.bounds != null) strategies.push('relativePosition');
  if (selector.coordinates != null) strategies.push('coordinates');

  // Vision is never listed from selector fields alone: it needs a screenshot and
  // a model, so only the resolver knows whether it is actually available.
  return strategies;
};

/**
 * True when a selector can only be resolved by pixels.
 *
 * Worth surfacing in the UI: such a step will break on the next layout change,
 * and the user is the only one who can strengthen it.
 */
export const isFragileSelector = (selector: Selector): boolean => {
  const strategies = availableStrategies(selector);
  return strategies.length > 0 && strategies.every(isFragileStrategy);
};
