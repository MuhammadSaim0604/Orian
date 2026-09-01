import { type Bounds, type Selector } from '@mobile-automation/native-automation';
import { parseStructured } from '@mobile-automation/prompt-engine';
import { z } from 'zod';

/**
 * The last rung of the perception chain: ask a model where something is.
 *
 * Reached only when the accessibility tree found nothing **and** OCR found nothing (ADR 0013). It is last for
 * three reasons, in order of how much they matter:
 *
 * 1. **It costs the user money**, every single look, unlike the two rungs above it.
 * 2. **It cannot be verified.** OCR either matched a string or it did not; a model naming coordinates is
 *    guessing, and nothing in the answer says how good the guess was. The `confidence` it reports is its own
 *    opinion of itself.
 * 3. It is the slowest, since the screenshot has to be uploaded.
 *
 * ## What this actually validates
 *
 * A model asked for pixel coordinates will confidently return numbers that are not on the screen — off the
 * right edge, negative, or a box with zero area. Tapping those either does nothing or hits the wrong thing, so
 * **every returned box is checked against the screen dimensions before it is used.** That check is the reason
 * this file is worth testing: the model call is the easy part.
 */

/** How the matcher reaches a model. Injected so this is testable without a provider or a network. */
export type VisionProvider = {
  /**
   * Asks the model to locate something in an image.
   *
   * Takes a file path rather than bytes, matching the rest of the product: a full-resolution screen is several
   * megabytes and the provider layer already knows how to attach one.
   */
  readonly locate: (input: {
    readonly screenshotPath: string;
    readonly description: string;
  }) => Promise<string>;
};

export type VisionMatcherOptions = {
  readonly provider: VisionProvider;
  /** Takes a screenshot and returns its path and dimensions, or null when capture is unavailable. */
  readonly capture: () => Promise<{
    readonly path: string;
    readonly widthPx: number;
    readonly heightPx: number;
  } | null>;
};

/** A region the model claims contains the target. */
export type VisionMatch = {
  readonly bounds: Bounds;
  readonly confidence: number;
  readonly description?: string;
};

/**
 * What the model is asked to return.
 *
 * A box rather than a point, deliberately. A point cannot be sanity-checked beyond "is it on screen", while a
 * box with a plausible size can: a button claiming to be the full height of the display is a wrong answer that
 * a point would have hidden.
 */
const VisionResponseSchema = z.object({
  found: z.boolean(),
  left: z.number().optional(),
  top: z.number().optional(),
  right: z.number().optional(),
  bottom: z.number().optional(),
  confidence: z.number().min(0).max(1).optional(),
  description: z.string().optional(),
});

/**
 * Largest fraction of the screen a match may cover.
 *
 * A model that cannot find the target sometimes returns the whole screen rather than saying so — technically a
 * box containing the element, and useless. Tapping its centre presses whatever is in the middle of the display,
 * which is how a failed vision lookup becomes a random tap.
 */
export const MAX_MATCH_SCREEN_FRACTION = 0.5;

/** Smallest box worth acting on, in pixels. Below this it is not a target, it is noise. */
export const MIN_MATCH_EDGE_PX = 8;

/**
 * Builds a vision matcher over the active provider.
 *
 * Returns null when either half is missing, so a caller can pass the result straight to the resolver and get
 * the honest "vision was not attempted" report rather than a matcher that always fails.
 */
export const createVisionMatcher = (options: VisionMatcherOptions) => ({
  isAvailable: true,

  locate: async (selector: Selector): Promise<VisionMatch | null> => {
    const description = describeTarget(selector);
    if (description === null) return null;

    const screenshot = await options.capture();
    if (screenshot === null) return null;

    const raw = await options.provider.locate({
      screenshotPath: screenshot.path,
      description,
    });

    const parsed = parseStructured(VisionResponseSchema, raw);

    // A malformed answer is treated as "not found" rather than an error. The chain has already exhausted every
    // other strategy, so there is nothing to fall back to and failing loudly would only replace a useful "not
    // found" with a stack trace.
    if (!parsed.ok || !parsed.value.found) return null;

    const bounds = toBounds(parsed.value);
    if (bounds === null) return null;

    if (!isOnScreen(bounds, screenshot.widthPx, screenshot.heightPx)) return null;
    if (!isPlausibleSize(bounds, screenshot.widthPx, screenshot.heightPx)) return null;

    return {
      bounds,
      // Defaulted low rather than high when the model omits it. An unstated confidence is not a confident
      // answer, and the resolver flags anything below its threshold.
      confidence: parsed.value.confidence ?? DEFAULT_CONFIDENCE,
      description: parsed.value.description,
    };
  },
});

/**
 * Describes the target in words a model can look for.
 *
 * Text and contentDescription only. A resourceId is an internal identifier that does not appear on screen, and
 * asking a model to find "com.whatsapp:id/send" in a picture invites it to invent a location — which is exactly
 * the failure this whole chain exists to avoid.
 */
export const describeTarget = (selector: Selector): string | null => {
  const parts: string[] = [];

  if (selector.text != null && selector.text !== '') parts.push(`labelled "${selector.text}"`);

  if (selector.contentDescription != null && selector.contentDescription !== '') {
    parts.push(`described as "${selector.contentDescription}"`);
  }

  if (parts.length === 0) return null;

  return `the element ${parts.join(', ')}`;
};

const toBounds = (response: z.infer<typeof VisionResponseSchema>): Bounds | null => {
  const { left, top, right, bottom } = response;

  if (left === undefined || top === undefined || right === undefined || bottom === undefined) {
    return null;
  }

  const rounded = {
    left: Math.round(left),
    top: Math.round(top),
    right: Math.round(right),
    bottom: Math.round(bottom),
  };

  // Inverted or degenerate boxes happen: a model asked for four numbers will sometimes give them in the wrong
  // order. Rejecting rather than normalising, because a box we had to repair is not a box we should trust.
  if (rounded.right <= rounded.left || rounded.bottom <= rounded.top) return null;

  return rounded;
};

/**
 * Whether the box is actually on the screen.
 *
 * The check the whole file exists for. A model naming coordinates outside the display is common, and a tap at a
 * negative coordinate is silently swallowed by the platform — so the run reports success and nothing happened.
 */
export const isOnScreen = (bounds: Bounds, widthPx: number, heightPx: number): boolean =>
  bounds.left >= 0 &&
  bounds.top >= 0 &&
  bounds.right <= widthPx &&
  bounds.bottom <= heightPx &&
  bounds.right > bounds.left &&
  bounds.bottom > bounds.top;

/**
 * Whether the box is a plausible size for a control.
 *
 * Rejects both ends. Too large is the "I could not find it so here is the whole screen" answer, whose centre is
 * a random tap; too small is noise that would miss whatever it was aiming at.
 */
export const isPlausibleSize = (bounds: Bounds, widthPx: number, heightPx: number): boolean => {
  const boxWidth = bounds.right - bounds.left;
  const boxHeight = bounds.bottom - bounds.top;

  if (boxWidth < MIN_MATCH_EDGE_PX || boxHeight < MIN_MATCH_EDGE_PX) return false;

  const screenArea = widthPx * heightPx;
  if (screenArea <= 0) return false;

  return (boxWidth * boxHeight) / screenArea <= MAX_MATCH_SCREEN_FRACTION;
};

/** Used when the model does not state a confidence. Below the resolver's threshold, so it is flagged. */
export const DEFAULT_CONFIDENCE = 0.5;

/**
 * The prompt for a vision lookup.
 *
 * Tagged like every other prompt in the product, and JSON-only because the answer is applied directly: prose
 * describing where the button is cannot be tapped.
 *
 * The instruction to say `found: false` is the load-bearing one. A model asked "where is X" will always answer
 * with coordinates, because that is the shape of the question — being told that not finding it is an acceptable
 * answer is what makes the negative case possible at all.
 */
export const VISION_SYSTEM_PROMPT = `<role>
You locate a described element in a screenshot of an Android phone.
</role>

<output>
Return only a JSON object. No explanation, no markdown fences.
{ "found": true, "left": 0, "top": 0, "right": 0, "bottom": 0, "confidence": 0.0, "description": "what you saw" }
Coordinates are pixels in the image you were given, with 0,0 at the top left.
</output>

<rules>
- If the element is not in the image, return { "found": false }. This is a correct and useful answer. Do not guess a location.
- Return the box around the element itself, not the region containing it. A box covering most of the screen is never right.
- confidence is how sure you are, 0 to 1. Be honest: a low number is more useful than a wrong high one.
</rules>`;
