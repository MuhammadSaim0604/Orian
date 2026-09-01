import { describe, expect, it } from 'vitest';

import {
  BoundsSchema,
  PACKAGE_NAME,
  SELECTOR_STRATEGIES,
  SelectorSchema,
  SelectorStrategySchema,
  availableStrategies,
  isFragileSelector,
  isFragileStrategy,
  strategyRank,
} from './index';

describe('workflow-schema', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@mobile-automation/workflow-schema');
  });
});

describe('selector strategies', () => {
  it('ranks resourceId above coordinates', () => {
    expect(strategyRank('resourceId')).toBeLessThan(strategyRank('coordinates'));
  });

  it('treats vision as the last resort', () => {
    expect(strategyRank('vision')).toBe(SELECTOR_STRATEGIES.length - 1);
  });

  it('matches the Kotlin resolution order exactly', () => {
    // The Kotlin SelectorResolver walks this order; a mismatch would mean the
    // builder UI ranks durability differently from how replay actually behaves.
    expect(SELECTOR_STRATEGIES).toEqual([
      'resourceId',
      'accessibilitySemantics',
      'text',
      'structural',
      'relativePosition',
      'ocrText',
      'coordinates',
      'vision',
    ]);
  });

  it('ranks OCR above coordinates and below relative position', () => {
    // The whole reason ocrText was inserted rather than appended (ADR 0013): a text match survives the layout
    // shifting and can be checked, while a coordinate cannot fail - it lands somewhere and reports success.
    expect(strategyRank('ocrText')).toBeGreaterThan(strategyRank('relativePosition'));
    expect(strategyRank('ocrText')).toBeLessThan(strategyRank('coordinates'));
  });

  it('accepts a known strategy', () => {
    expect(SelectorStrategySchema.parse('text')).toBe('text');
  });

  it('rejects an unknown strategy', () => {
    expect(SelectorStrategySchema.safeParse('telepathy').success).toBe(false);
  });

  it('treats only pixel-based strategies as fragile', () => {
    expect(isFragileStrategy('coordinates')).toBe(true);
    expect(isFragileStrategy('vision')).toBe(true);
    expect(isFragileStrategy('resourceId')).toBe(false);
    expect(isFragileStrategy('text')).toBe(false);
  });

  it('does not call an OCR match fragile', () => {
    // Weakness and fragility are different properties. An OCR match is weaker than a resourceId - the rank says
    // so - but it is anchored to a string a person can read, so it survives a control moving. Flagging it would
    // have the review UI warn about every step on a screen where OCR was the only option.
    expect(isFragileStrategy('ocrText')).toBe(false);
  });
});

describe('bounds', () => {
  it('validates element bounds', () => {
    const bounds = BoundsSchema.parse({ left: 100, top: 700, right: 900, bottom: 850 });
    expect(bounds.right - bounds.left).toBe(800);
  });

  it('rejects non-integer bounds', () => {
    expect(BoundsSchema.safeParse({ left: 0.5, top: 0, right: 1, bottom: 1 }).success).toBe(false);
  });

  it('rejects a zero-area rectangle', () => {
    // Storing one would guarantee a run-time failure: it cannot be tapped.
    expect(BoundsSchema.safeParse({ left: 10, top: 10, right: 10, bottom: 20 }).success).toBe(
      false,
    );
  });

  it('rejects an inverted rectangle', () => {
    expect(BoundsSchema.safeParse({ left: 100, top: 0, right: 10, bottom: 50 }).success).toBe(
      false,
    );
  });
});

describe('selector validation', () => {
  it('accepts a selector with a resourceId', () => {
    const selector = SelectorSchema.parse({ resourceId: 'com.whatsapp:id/send_button' });
    expect(selector.resourceId).toBe('com.whatsapp:id/send_button');
  });

  it('accepts a fully specified selector', () => {
    const selector = SelectorSchema.parse({
      resourceId: 'com.whatsapp:id/send',
      text: 'Send',
      contentDescription: 'Send message',
      className: 'android.widget.ImageButton',
      structuralPath: '0.2.1',
      bounds: { left: 900, top: 1800, right: 1050, bottom: 1950 },
      coordinates: { x: 975, y: 1875 },
      packageName: 'com.whatsapp',
      activityName: 'com.whatsapp.Conversation',
      requireActionable: true,
      exactText: true,
    });

    expect(selector.activityName).toBe('com.whatsapp.Conversation');
  });

  it('rejects a selector with nothing to locate by', () => {
    // className narrows a search but cannot find anything on its own. Left
    // unvalidated this reports "element not found" at run time, sending the user
    // to look at the screen instead of at their workflow.
    const result = SelectorSchema.safeParse({ className: 'android.widget.Button' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('locating field');
    }
  });

  it('rejects an empty selector', () => {
    expect(SelectorSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a blank text value rather than matching everything', () => {
    expect(SelectorSchema.safeParse({ text: '' }).success).toBe(false);
  });

  it('accepts coordinates alone as a last-resort selector', () => {
    const selector = SelectorSchema.parse({ coordinates: { x: 100, y: 200 } });
    expect(selector.coordinates).toEqual({ x: 100, y: 200 });
  });

  it('validates the structural path format', () => {
    expect(SelectorSchema.safeParse({ structuralPath: '0.2.1' }).success).toBe(true);
    expect(SelectorSchema.safeParse({ structuralPath: '0..1' }).success).toBe(false);
    expect(SelectorSchema.safeParse({ structuralPath: 'root/child' }).success).toBe(false);
  });

  it('rejects negative coordinates', () => {
    expect(SelectorSchema.safeParse({ coordinates: { x: -1, y: 10 } }).success).toBe(false);
  });
});

describe('availableStrategies', () => {
  it('lists strategies strongest first', () => {
    const selector = SelectorSchema.parse({
      resourceId: 'send',
      text: 'Send',
      coordinates: { x: 1, y: 2 },
    });

    expect(availableStrategies(selector)).toEqual(['resourceId', 'text', 'coordinates']);
  });

  it('maps contentDescription to the semantics strategy', () => {
    const selector = SelectorSchema.parse({ contentDescription: 'Send message' });
    expect(availableStrategies(selector)).toEqual(['accessibilitySemantics']);
  });

  it('maps bounds to relative position', () => {
    const selector = SelectorSchema.parse({
      bounds: { left: 0, top: 0, right: 100, bottom: 50 },
    });

    expect(availableStrategies(selector)).toEqual(['relativePosition']);
  });

  it('never claims vision from selector fields alone', () => {
    // Vision needs a screenshot and a model, so only the resolver knows whether
    // it is actually available.
    const selector = SelectorSchema.parse({
      resourceId: 'send',
      coordinates: { x: 1, y: 2 },
    });

    expect(availableStrategies(selector)).not.toContain('vision');
  });
});

describe('isFragileSelector', () => {
  it('flags a coordinates-only selector', () => {
    const selector = SelectorSchema.parse({ coordinates: { x: 1, y: 2 } });
    expect(isFragileSelector(selector)).toBe(true);
  });

  it('does not flag a selector with a semantic clue', () => {
    const selector = SelectorSchema.parse({
      resourceId: 'send',
      coordinates: { x: 1, y: 2 },
    });

    expect(isFragileSelector(selector)).toBe(false);
  });

  it('treats bounds-only as durable enough, since it resolves by position', () => {
    const selector = SelectorSchema.parse({
      bounds: { left: 0, top: 0, right: 100, bottom: 50 },
    });

    expect(isFragileSelector(selector)).toBe(false);
  });
});
