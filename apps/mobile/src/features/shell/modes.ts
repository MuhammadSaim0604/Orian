import { type AppMode } from '../shell/preferences';

/**
 * What each mode is, for the switcher and for anywhere else that needs to name one.
 *
 * Here rather than inline in the switcher because Step 4's and Step 6's settings screens both need
 * "the other mode" by name for their switch action, and two copies of that string would drift.
 */

export type ModeDescriptor = {
  readonly id: AppMode;
  readonly title: string;
  readonly tagline: string;
  readonly detail: string;
  /** A glyph rather than an icon asset, so the switcher needs no image loading. */
  readonly glyph: string;
};

export const MODES: readonly ModeDescriptor[] = [
  {
    id: 'agent',
    title: 'Agent Mode',
    tagline: 'Tell it what you want done',
    detail:
      'Describe a task in your own words. The agent reads the screen, works out the steps, and carries them out — carrying on while you use another app.',
    glyph: '◆',
  },
  {
    id: 'workflow',
    title: 'Workflow Mode',
    tagline: 'Build it once, run it whenever',
    detail:
      'Compose steps on a canvas, wire in conditions and loops, and configure each step against a real screen. Save it and run it on demand.',
    glyph: '⬡',
  },
];

export const modeById = (id: AppMode): ModeDescriptor =>
  // Non-null is safe: `AppMode` has exactly these two members, and the array covers both.
  MODES.find((mode) => mode.id === id)!;

export const otherMode = (id: AppMode): ModeDescriptor =>
  modeById(id === 'agent' ? 'workflow' : 'agent');
