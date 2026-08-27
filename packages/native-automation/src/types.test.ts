import { describe, expect, it } from 'vitest';

import {
  MEDIA_COMMANDS,
  SWIPE_DIRECTIONS,
  VOLUME_DIRECTIONS,
  type ResolvedElement,
  isAmbiguousMatch,
  isFragileMatch,
} from './types';

const element = (overrides: Partial<ResolvedElement> = {}): ResolvedElement => ({
  text: 'Send',
  resourceId: 'com.whatsapp:id/send_button',
  className: 'android.widget.ImageButton',
  contentDescription: null,
  centerX: 975,
  centerY: 1875,
  bounds: { left: 900, top: 1800, right: 1050, bottom: 1950 },
  clickable: true,
  editable: false,
  enabled: true,
  strategy: 'resourceId',
  structuralPath: '0.2',
  alternativeCount: 0,
  ...overrides,
});

describe('resolved element', () => {
  it('treats a resourceId match as durable', () => {
    expect(isFragileMatch(element())).toBe(false);
  });

  it('treats semantic and text matches as durable', () => {
    expect(isFragileMatch(element({ strategy: 'accessibilitySemantics' }))).toBe(false);
    expect(isFragileMatch(element({ strategy: 'text' }))).toBe(false);
    expect(isFragileMatch(element({ strategy: 'structural' }))).toBe(false);
  });

  it('flags a coordinate match as fragile', () => {
    // Coordinates break on any layout change, so the UI must be able to warn.
    expect(isFragileMatch(element({ strategy: 'coordinates' }))).toBe(true);
  });

  it('flags a vision match as fragile', () => {
    expect(isFragileMatch(element({ strategy: 'vision' }))).toBe(true);
  });

  it('reports ambiguity when more than one node matched', () => {
    expect(isAmbiguousMatch(element())).toBe(false);
    expect(isAmbiguousMatch(element({ alternativeCount: 3 }))).toBe(true);
  });
});

describe('vocabularies', () => {
  it('lists the four swipe directions', () => {
    expect(SWIPE_DIRECTIONS).toEqual(['up', 'down', 'left', 'right']);
  });

  it('mirrors the Kotlin MediaCommand names', () => {
    // Lowercase snake_case, matching MediaCommand.names on the Kotlin side.
    expect(MEDIA_COMMANDS).toContain('play_pause');
    expect(MEDIA_COMMANDS).toContain('next');
    expect(MEDIA_COMMANDS).toContain('previous');
    expect(MEDIA_COMMANDS).toHaveLength(8);
  });

  it('lists both volume directions', () => {
    expect(VOLUME_DIRECTIONS).toEqual(['up', 'down']);
  });

  it('has no duplicates in any vocabulary', () => {
    expect(new Set(SWIPE_DIRECTIONS).size).toBe(SWIPE_DIRECTIONS.length);
    expect(new Set(MEDIA_COMMANDS).size).toBe(MEDIA_COMMANDS.length);
    expect(new Set(VOLUME_DIRECTIONS).size).toBe(VOLUME_DIRECTIONS.length);
  });
});
