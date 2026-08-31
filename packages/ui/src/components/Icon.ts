import { createElement, type ReactElement } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg';

/**
 * The shared icon set.
 *
 * **Real vector paths via `react-native-svg`**, not shapes assembled from `View`s. The previous version drew
 * icons from rotated bars, and device testing was blunt about the result: a send "icon" that read as three
 * lines, a filled circle with an arrow in it where a settings gear belonged. Bars can make an arrow; they
 * cannot make a paper plane or a gear, and pretending otherwise produced glyphs nobody recognised.
 *
 * The paths are drawn on a 24×24 grid — the convention every icon set uses, so a path lifted from one reads at
 * the same weight as the others — and scaled by the `size` prop.
 *
 * Built with `createElement` rather than JSX, like the rest of this package, so it stays `.ts` throughout.
 *
 * Every icon takes its colour rather than choosing one. The theme decides appearance (ADR 0004), and an icon
 * that hardcoded a colour would be wrong in one of the two schemes.
 */

export type IconProps = {
  /** Rendered box in dp. The 24-unit viewBox scales to it. */
  readonly size?: number;
  readonly color: string;
  /** Stroke width in viewBox units. Raise it for an icon that must read at a very small size. */
  readonly thickness?: number;
};

const DEFAULT_SIZE = 22;
const DEFAULT_THICKNESS = 2;

/**
 * A stroked 24×24 canvas.
 *
 * Round caps and joins throughout, because mitred corners at 2px on a phone produce visible spikes.
 * `fill="none"` by default: these are line icons, and a stray fill on an open path renders as a filled blob.
 */
const stroked = (
  { size, color, thickness }: IconProps,
  ...children: ReactElement[]
): ReactElement =>
  createElement(
    Svg,
    {
      width: size ?? DEFAULT_SIZE,
      height: size ?? DEFAULT_SIZE,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: color,
      strokeWidth: thickness ?? DEFAULT_THICKNESS,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    ...children,
  );

/** A chevron pointing left. The back affordance on every screen header. */
export const BackIcon = (props: IconProps): ReactElement =>
  stroked(props, createElement(Polyline, { key: 'p', points: '15 18 9 12 15 6' }));

/** A chevron pointing right. On a row, it means the row leads somewhere. */
export const ForwardIcon = (props: IconProps): ReactElement =>
  stroked(props, createElement(Polyline, { key: 'p', points: '9 18 15 12 9 6' }));

/** Pointing down: a collapsed section that will expand. */
export const ChevronDownIcon = (props: IconProps): ReactElement =>
  stroked(props, createElement(Polyline, { key: 'p', points: '6 9 12 15 18 9' }));

/** Pointing up: an expanded section that will collapse. */
export const ChevronUpIcon = (props: IconProps): ReactElement =>
  stroked(props, createElement(Polyline, { key: 'p', points: '18 15 12 9 6 15' }));

/**
 * A paper plane, flying level.
 *
 * Device testing was precise about what was wrong with the first attempt: too narrow, and tilted 45°. A send mark
 * should read as horizontal motion, so this one is drawn across the full width of the viewBox on a shallow rake,
 * with an open tail notch — the notch is what distinguishes a paper plane from an arrowhead.
 *
 * Filled rather than stroked, because at 17dp inside a round button a 2px outline is most of the glyph and reads
 * as a wireframe. `fill` is the colour and there is no stroke, which is also why it keeps its weight when the
 * button behind it is filled.
 */
export const SendIcon = ({ size, color }: IconProps): ReactElement =>
  createElement(
    Svg,
    {
      width: size ?? DEFAULT_SIZE,
      height: size ?? DEFAULT_SIZE,
      viewBox: '0 0 24 24',
      fill: 'none',
    },
    createElement(Path, {
      key: 'plane',
      // Nose at the right edge, tail at the left with a notch cut into it, and the body slightly deeper below the
      // centre line than above — which is what makes it look like it is travelling rather than pointing.
      d: 'M2.2 4.6 21.4 12 2.2 19.4l2.6-6.2 9.4-1.2-9.4-1.2-2.6-6.2Z',
      fill: color,
    }),
  );

/**
 * A pencil.
 *
 * Edit. Paired with `DeleteIcon` on the provider card, so it is a line icon of the same weight rather than a
 * filled glyph — two buttons side by side with different icon weights look like a mistake.
 */
export const EditIcon = (props: IconProps): ReactElement =>
  stroked(
    props,
    createElement(Path, { key: 'body', d: 'M4 20h4L20 8a2.83 2.83 0 0 0-4-4L4 16v4Z' }),
    createElement(Path, { key: 'nib', d: 'm14.5 5.5 4 4' }),
  );

/** A wastebasket: lid, body, and two ribs. */
export const DeleteIcon = (props: IconProps): ReactElement =>
  stroked(
    props,
    createElement(Polyline, { key: 'lid', points: '3 6 5 6 21 6' }),
    createElement(Path, {
      key: 'body',
      d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2',
    }),
    createElement(Path, { key: 'ribs', d: 'M10 11v6M14 11v6' }),
  );

/** An X. Dismiss, close, clear. */
export const CloseIcon = (props: IconProps): ReactElement =>
  stroked(props, createElement(Path, { key: 'p', d: 'M18 6 6 18M6 6l12 12' }));

/** A magnifier. */
export const SearchIcon = (props: IconProps): ReactElement =>
  stroked(
    props,
    createElement(Circle, { key: 'ring', cx: 11, cy: 11, r: 7 }),
    createElement(Path, { key: 'handle', d: 'm21 21-4.3-4.3' }),
  );

/** Three bars. "Show the list of conversations." */
export const MenuIcon = (props: IconProps): ReactElement =>
  stroked(props, createElement(Path, { key: 'p', d: 'M3 6h18M3 12h18M3 18h18' }));

/** A filled rounded square. Stop, in the universal transport sense. */
export const StopIcon = ({ size, color }: IconProps): ReactElement =>
  createElement(
    Svg,
    { width: size ?? DEFAULT_SIZE, height: size ?? DEFAULT_SIZE, viewBox: '0 0 24 24' },
    createElement(Rect, { x: 6, y: 6, width: 12, height: 12, rx: 2.5, fill: color }),
  );

/** A plus. For "new": a plus reads as *add* where a document glyph reads as *open*. */
export const PlusIcon = (props: IconProps): ReactElement =>
  stroked(props, createElement(Path, { key: 'p', d: 'M12 5v14M5 12h14' }));

/**
 * A gear.
 *
 * The settings mark everywhere, and specifically what device testing asked for. Drawn as a ring plus the
 * eight-spoke tooth path rather than as a circle with something inside it.
 */
export const SettingsIcon = (props: IconProps): ReactElement =>
  stroked(
    props,
    createElement(Circle, { key: 'hub', cx: 12, cy: 12, r: 3 }),
    createElement(Path, {
      key: 'teeth',
      d:
        'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 ' +
        '1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 ' +
        '0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 ' +
        '0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 ' +
        '1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 ' +
        '2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 ' +
        '0-1.51 1Z',
    }),
  );

/**
 * A shield with a tick.
 *
 * Onboarding, which is a permission flow — so the mark is about protection and consent rather than about being
 * a first step. A numbered-step or flag icon would suggest a tutorial.
 */
export const ShieldCheckIcon = (props: IconProps): ReactElement =>
  stroked(
    props,
    createElement(Path, { key: 'shield', d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z' }),
    createElement(Polyline, { key: 'tick', points: '9 12 11.5 14.5 15.5 10' }),
  );

/**
 * A spark.
 *
 * Reasoning, thinking, "the model is working". A four-point star rather than a lightbulb, because a bulb reads
 * as *idea* and this is about effort in progress.
 */
export const SparkIcon = (props: IconProps): ReactElement =>
  stroked(
    props,
    createElement(Path, { key: 'big', d: 'M12 3v4M12 17v4M5 12H1M23 12h-4' }),
    createElement(Path, {
      key: 'star',
      d: 'M12 8.5 13.3 11l2.7 1-2.7 1L12 15.5 10.7 13 8 12l2.7-1L12 8.5Z',
    }),
  );

/** An empty ring: a task not started. */
export const CircleIcon = (props: IconProps): ReactElement =>
  stroked(props, createElement(Circle, { key: 'r', cx: 12, cy: 12, r: 8 }));

/** A ring with a tick: a task done. */
export const CheckCircleIcon = (props: IconProps): ReactElement =>
  stroked(
    props,
    createElement(Circle, { key: 'r', cx: 12, cy: 12, r: 8 }),
    createElement(Polyline, { key: 'tick', points: '8.5 12.2 11 14.7 15.5 9.5' }),
  );

/** A bare tick, for a compact confirmation. */
export const CheckIcon = (props: IconProps): ReactElement =>
  stroked(props, createElement(Polyline, { key: 'p', points: '20 6 9 17 4 12' }));

/** A ring with an exclamation: a task that failed. */
export const AlertCircleIcon = (props: IconProps): ReactElement =>
  stroked(
    props,
    createElement(Circle, { key: 'r', cx: 12, cy: 12, r: 8 }),
    createElement(Path, { key: 'bang', d: 'M12 8v4.5' }),
    createElement(Circle, { key: 'dot', cx: 12, cy: 16, r: 0.6, fill: props.color }),
  );

/** Two arrows curving into a loop: the agent changed its approach. */
export const RefreshIcon = (props: IconProps): ReactElement =>
  stroked(
    props,
    createElement(Path, { key: 'a', d: 'M21 12a9 9 0 0 1-9 9 9 9 0 0 1-8.5-6' }),
    createElement(Path, { key: 'b', d: 'M3 12a9 9 0 0 1 9-9 9 9 0 0 1 8.5 6' }),
    createElement(Polyline, { key: 'c', points: '3 7 3.5 12 8 11.5' }),
    createElement(Polyline, { key: 'd', points: '21 17 20.5 12 16 12.5' }),
  );

/**
 * A filled circle holding another icon.
 *
 * The leading mark on an action row. The background and foreground are passed in rather than derived, so a
 * caller can invert it against the scheme by naming `textPrimary` on `background` — one expression that is
 * correct in both themes because the palette itself inverts.
 */
export const IconBadge = ({
  size,
  background,
  children,
}: {
  readonly size?: number;
  readonly background: string;
  readonly children: ReactElement;
}): ReactElement => {
  const box = size ?? 32;

  return createElement(
    View,
    {
      style: {
        width: box,
        height: box,
        borderRadius: box / 2,
        backgroundColor: background,
        alignItems: 'center',
        justifyContent: 'center',
      },
    },
    children,
  );
};
