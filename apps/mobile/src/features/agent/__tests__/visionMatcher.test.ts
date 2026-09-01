import {
  DEFAULT_CONFIDENCE,
  MAX_MATCH_SCREEN_FRACTION,
  MIN_MATCH_EDGE_PX,
  VISION_SYSTEM_PROMPT,
  createVisionMatcher,
  describeTarget,
  isOnScreen,
  isPlausibleSize,
} from '../visionMatcher';

/**
 * The vision fallback.
 *
 * The model call is the easy part. What is worth testing is everything this **refuses**, because a bad box does
 * not fail loudly — a tap at a negative coordinate is silently swallowed by the platform, so the run reports
 * success and nothing happened. That is the failure these tests exist to prevent.
 */

const screen = { path: '/data/captures/1.png', widthPx: 1080, heightPx: 2400 };

const matcher = (answer: string, capture: typeof screen | null = screen) =>
  createVisionMatcher({
    provider: { locate: jest.fn(async () => answer) },
    capture: jest.fn(async () => capture),
  });

const found = (box: Record<string, number>) =>
  JSON.stringify({ found: true, confidence: 0.9, ...box });

describe('describing the target', () => {
  it('uses the text a person can see', () => {
    expect(describeTarget({ text: 'Continue' })).toContain('Continue');
  });

  it('uses the content description when there is no text', () => {
    expect(describeTarget({ contentDescription: 'Send message' })).toContain('Send message');
  });

  it('refuses to pass a resourceId', () => {
    // An internal identifier does not appear on screen. Asking a model to find "com.whatsapp:id/send" in a
    // picture invites it to invent a location, which is exactly what the rest of this file guards against.
    expect(describeTarget({ resourceId: 'com.whatsapp:id/send' })).toBeNull();
  });

  it('returns null when there is nothing describable', () => {
    expect(describeTarget({})).toBeNull();
    expect(describeTarget({ text: '' })).toBeNull();
  });
});

describe('locating a target', () => {
  it('returns the box the model named', async () => {
    const result = await matcher(found({ left: 400, top: 1200, right: 700, bottom: 1300 })).locate({
      text: 'Continue',
    });

    expect(result?.bounds).toEqual({ left: 400, top: 1200, right: 700, bottom: 1300 });
    expect(result?.confidence).toBe(0.9);
  });

  it('does not call the model for an undescribable target', async () => {
    const provider = {
      locate: jest.fn(async () => found({ left: 0, top: 0, right: 10, bottom: 10 })),
    };

    const result = await createVisionMatcher({
      provider,
      capture: jest.fn(async () => screen),
    }).locate({ resourceId: 'com.whatsapp:id/send' });

    expect(result).toBeNull();
    expect(provider.locate).not.toHaveBeenCalled();
  });

  it('returns null when the screen cannot be captured', async () => {
    const result = await matcher(found({ left: 0, top: 0, right: 10, bottom: 10 }), null).locate({
      text: 'Continue',
    });

    expect(result).toBeNull();
  });

  it('honours found: false without treating it as an error', async () => {
    // The prompt explicitly tells the model this is a correct answer, so the code has to accept it as one.
    const result = await matcher(JSON.stringify({ found: false })).locate({ text: 'Continue' });

    expect(result).toBeNull();
  });

  it('treats a malformed answer as not found', async () => {
    // The chain has already exhausted every other strategy, so there is nothing to fall back to and failing
    // loudly would replace a useful "not found" with a stack trace.
    expect(await matcher('I think it is near the bottom').locate({ text: 'Continue' })).toBeNull();
  });

  it('defaults an unstated confidence low rather than high', async () => {
    // An unstated confidence is not a confident answer.
    const result = await matcher(
      JSON.stringify({ found: true, left: 400, top: 1200, right: 700, bottom: 1300 }),
    ).locate({ text: 'Continue' });

    expect(result?.confidence).toBe(DEFAULT_CONFIDENCE);
  });
});

describe('rejecting a box that is not on screen', () => {
  it('rejects a negative coordinate', async () => {
    // The decisive case. A tap at a negative coordinate is silently swallowed, so without this check the run
    // reports success and nothing happened.
    const result = await matcher(found({ left: -50, top: 100, right: 200, bottom: 200 })).locate({
      text: 'Continue',
    });

    expect(result).toBeNull();
  });

  it('rejects a box past the right edge', async () => {
    const result = await matcher(found({ left: 900, top: 100, right: 1400, bottom: 200 })).locate({
      text: 'Continue',
    });

    expect(result).toBeNull();
  });

  it('rejects a box past the bottom', async () => {
    const result = await matcher(found({ left: 100, top: 2300, right: 300, bottom: 2600 })).locate({
      text: 'Continue',
    });

    expect(result).toBeNull();
  });

  it('rejects an inverted box rather than repairing it', async () => {
    // A box we had to repair is not a box we should trust: whatever produced it does not understand the question.
    const result = await matcher(found({ left: 700, top: 100, right: 400, bottom: 200 })).locate({
      text: 'Continue',
    });

    expect(result).toBeNull();
  });

  it('accepts a box exactly at the edges', async () => {
    const result = await matcher(found({ left: 0, top: 0, right: 1080, bottom: 1000 })).locate({
      text: 'Continue',
    });

    expect(result).not.toBeNull();
  });

  it('checks the predicate directly', () => {
    expect(isOnScreen({ left: 0, top: 0, right: 100, bottom: 100 }, 1080, 2400)).toBe(true);
    expect(isOnScreen({ left: -1, top: 0, right: 100, bottom: 100 }, 1080, 2400)).toBe(false);
    expect(isOnScreen({ left: 0, top: 0, right: 100, bottom: 100 }, 50, 2400)).toBe(false);
  });
});

describe('rejecting an implausible size', () => {
  it('rejects a box covering most of the screen', async () => {
    // A model that cannot find the target sometimes returns the whole screen rather than saying so. It is
    // technically a box containing the element and completely useless: tapping its centre presses whatever is in
    // the middle of the display.
    const result = await matcher(found({ left: 0, top: 0, right: 1080, bottom: 2400 })).locate({
      text: 'Continue',
    });

    expect(result).toBeNull();
  });

  it('rejects a box too small to be a control', async () => {
    const result = await matcher(found({ left: 100, top: 100, right: 103, bottom: 103 })).locate({
      text: 'Continue',
    });

    expect(result).toBeNull();
  });

  it('accepts a button-sized box', () => {
    expect(isPlausibleSize({ left: 400, top: 1200, right: 700, bottom: 1300 }, 1080, 2400)).toBe(
      true,
    );
  });

  it('has thresholds that are actually restrictive', () => {
    // Recorded as a test because both numbers are judgements. Anyone loosening them should have to change this
    // line and think about why a half-screen box is an acceptable tap target.
    expect(MAX_MATCH_SCREEN_FRACTION).toBeLessThanOrEqual(0.5);
    expect(MIN_MATCH_EDGE_PX).toBeGreaterThanOrEqual(4);
  });

  it('rejects everything when the screen has no area', () => {
    expect(isPlausibleSize({ left: 0, top: 0, right: 10, bottom: 10 }, 0, 0)).toBe(false);
  });
});

describe('the prompt', () => {
  it('asks for JSON only, since the answer is applied directly', () => {
    expect(VISION_SYSTEM_PROMPT).toMatch(/Return only a JSON object/i);
    expect(VISION_SYSTEM_PROMPT).toMatch(/No explanation/i);
  });

  it('tells the model that not finding it is a correct answer', () => {
    // The load-bearing instruction. A model asked "where is X" always answers with coordinates, because that is
    // the shape of the question - being told the negative is acceptable is what makes it possible at all.
    expect(VISION_SYSTEM_PROMPT).toMatch(/"found": false/);
    expect(VISION_SYSTEM_PROMPT).toMatch(/correct and useful answer/i);
    expect(VISION_SYSTEM_PROMPT).toMatch(/Do not guess a location/i);
  });

  it('warns against returning the whole screen', () => {
    expect(VISION_SYSTEM_PROMPT).toMatch(/covering most of the screen is never right/i);
  });

  it('is structured with tags like every other prompt', () => {
    for (const tag of ['role', 'output', 'rules']) {
      expect(VISION_SYSTEM_PROMPT).toContain(`<${tag}>`);
      expect(VISION_SYSTEM_PROMPT).toContain(`</${tag}>`);
    }
  });
});
