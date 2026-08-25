/**
 * `@mobile-automation/workflow-schema`
 *
 * Zod schemas for the workflow JSON format. A workflow is plain data and must
 * stay independent of React Native so the same definition can execute
 * anywhere (see `architecture/Data_Models.md`).
 *
 * Phase 1 scaffold - only the selector priority order is fixed here, because
 * every later phase depends on that ordering. The full `Workflow`, `Node`, and
 * `Edge` schemas are built in Phase 4.
 */

import { z } from 'zod';

export const PACKAGE_NAME = '@mobile-automation/workflow-schema' as const;

/**
 * Selector resolution order, strongest first (ADR 0009). Coordinates are a
 * last resort and vision is the final fallback.
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

/** Screen bounds of a UI element, in device pixels. */
export const BoundsSchema = z.object({
  left: z.number().int(),
  top: z.number().int(),
  right: z.number().int(),
  bottom: z.number().int(),
});

export type Bounds = z.infer<typeof BoundsSchema>;

/** How strongly a selector strategy identifies an element. Lower is better. */
export const strategyRank = (strategy: SelectorStrategy): number =>
  SELECTOR_STRATEGIES.indexOf(strategy);
