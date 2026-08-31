import { createElement, type ReactElement } from 'react';
import { View, type ViewStyle } from 'react-native';

/**
 * The shared icon set.
 *
 * **Drawn from views, not a font or an SVG library.** Three reasons, in order of how much they cost when
 * ignored:
 *
 * - A missing glyph is invisible until a user reports a blank square, and device testing already produced
 *   exactly that complaint about a hand-drawn stop button.
 * - An icon font is another asset to bundle and another thing that can fail to load in a release build while
 *   working in debug.
 * - `react-native-svg` is a native dependency, and adding one for arrows is not a trade worth making.
 *
 * Built with `createElement` rather than JSX, like `Button`, so this package needs no JSX transform of its own.
 *
 * Every icon takes a colour rather than choosing one. The theme decides appearance (ADR 0004), and an icon that
 * hardcoded a colour would be wrong in one of the two themes.
 */

export type IconProps = {
  /** Nominal box size in dp. The drawing is inset within it so icons of one size look the same weight. */
  readonly size?: number;
  readonly color: string;
  /** Stroke thickness. Left alone unless an icon needs to read at a very small size. */
  readonly thickness?: number;
};

const DEFAULT_SIZE = 20;
const DEFAULT_THICKNESS = 2;

/**
 * A chevron, built from two rotated bars.
 *
 * The primitive behind back, forward, expand and collapse — all four are one shape at four rotations, so they
 * cannot drift apart visually.
 */
const chevron = (rotation: number, { size, color, thickness }: IconProps): ReactElement => {
  const box = size ?? DEFAULT_SIZE;
  const bar = thickness ?? DEFAULT_THICKNESS;
  const arm = box * 0.42;

  const barStyle = (angle: number, offset: number): ViewStyle => ({
    position: 'absolute',
    width: bar,
    height: arm,
    borderRadius: bar / 2,
    backgroundColor: color,
    transform: [{ rotate: `${angle}deg` }, { translateY: offset }],
  });

  return createElement(
    View,
    {
      style: {
        width: box,
        height: box,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ rotate: `${rotation}deg` }],
      },
    },
    createElement(View, { style: barStyle(45, -arm / 2 + bar / 2), key: 'upper' }),
    createElement(View, { style: barStyle(-45, arm / 2 - bar / 2), key: 'lower' }),
  );
};

/** Points left. The back affordance on every screen header. */
export const BackIcon = (props: IconProps): ReactElement => chevron(0, props);

/** Points right. Used on rows that lead somewhere. */
export const ForwardIcon = (props: IconProps): ReactElement => chevron(180, props);

/** Points down: a collapsed section that will expand. */
export const ChevronDownIcon = (props: IconProps): ReactElement => chevron(-90, props);

/** Points up: an expanded section that will collapse. */
export const ChevronUpIcon = (props: IconProps): ReactElement => chevron(90, props);

/**
 * A paper-plane send arrow.
 *
 * Two strokes meeting at a point, which is enough to read as "send" at composer size. A filled triangle would
 * need a border trick that renders differently across Android versions.
 */
export const SendIcon = ({ size, color, thickness }: IconProps): ReactElement => {
  const box = size ?? DEFAULT_SIZE;
  const bar = thickness ?? DEFAULT_THICKNESS;
  const arm = box * 0.5;

  return createElement(
    View,
    { style: { width: box, height: box, alignItems: 'center', justifyContent: 'center' } },
    createElement(View, {
      key: 'upper',
      style: {
        position: 'absolute',
        width: bar,
        height: arm,
        borderRadius: bar / 2,
        backgroundColor: color,
        transform: [{ rotate: '35deg' }, { translateY: -arm / 2 + bar }],
      },
    }),
    createElement(View, {
      key: 'lower',
      style: {
        position: 'absolute',
        width: bar,
        height: arm,
        borderRadius: bar / 2,
        backgroundColor: color,
        transform: [{ rotate: '-35deg' }, { translateY: arm / 2 - bar }],
      },
    }),
    createElement(View, {
      key: 'tail',
      style: {
        position: 'absolute',
        width: box * 0.46,
        height: bar,
        borderRadius: bar / 2,
        backgroundColor: color,
        transform: [{ translateX: -box * 0.1 }],
      },
    }),
  );
};

/**
 * A wastebasket.
 *
 * A lid, a body, and two ribs. Recognisable at 20dp, which a more literal drawing would not be.
 */
export const DeleteIcon = ({ size, color, thickness }: IconProps): ReactElement => {
  const box = size ?? DEFAULT_SIZE;
  const bar = thickness ?? DEFAULT_THICKNESS;
  const bodyWidth = box * 0.62;
  const bodyHeight = box * 0.6;

  return createElement(
    View,
    { style: { width: box, height: box, alignItems: 'center', justifyContent: 'flex-start' } },
    createElement(View, {
      key: 'lid',
      style: {
        width: bodyWidth + bar * 2,
        height: bar,
        borderRadius: bar / 2,
        backgroundColor: color,
        marginTop: box * 0.14,
      },
    }),
    createElement(
      View,
      {
        key: 'body',
        style: {
          width: bodyWidth,
          height: bodyHeight,
          marginTop: bar,
          borderWidth: bar,
          borderColor: color,
          borderTopWidth: 0,
          borderBottomLeftRadius: bar,
          borderBottomRightRadius: bar,
          flexDirection: 'row',
          justifyContent: 'space-evenly',
          paddingVertical: bar,
        },
      },
      createElement(View, {
        key: 'rib-left',
        style: { width: bar / 1.5, height: '100%', backgroundColor: color, borderRadius: bar },
      }),
      createElement(View, {
        key: 'rib-right',
        style: { width: bar / 1.5, height: '100%', backgroundColor: color, borderRadius: bar },
      }),
    ),
  );
};

/** An X. Dismiss, close, clear. */
export const CloseIcon = ({ size, color, thickness }: IconProps): ReactElement => {
  const box = size ?? DEFAULT_SIZE;
  const bar = thickness ?? DEFAULT_THICKNESS;

  const barStyle = (angle: number): ViewStyle => ({
    position: 'absolute',
    width: box * 0.74,
    height: bar,
    borderRadius: bar / 2,
    backgroundColor: color,
    transform: [{ rotate: `${angle}deg` }],
  });

  return createElement(
    View,
    { style: { width: box, height: box, alignItems: 'center', justifyContent: 'center' } },
    createElement(View, { key: 'a', style: barStyle(45) }),
    createElement(View, { key: 'b', style: barStyle(-45) }),
  );
};

/** A magnifier: a ring and a handle. */
export const SearchIcon = ({ size, color, thickness }: IconProps): ReactElement => {
  const box = size ?? DEFAULT_SIZE;
  const bar = thickness ?? DEFAULT_THICKNESS;
  const ring = box * 0.6;

  return createElement(
    View,
    { style: { width: box, height: box, alignItems: 'center', justifyContent: 'center' } },
    createElement(View, {
      key: 'ring',
      style: {
        width: ring,
        height: ring,
        borderRadius: ring / 2,
        borderWidth: bar,
        borderColor: color,
        transform: [{ translateX: -box * 0.06 }, { translateY: -box * 0.06 }],
      },
    }),
    createElement(View, {
      key: 'handle',
      style: {
        position: 'absolute',
        width: box * 0.3,
        height: bar,
        borderRadius: bar / 2,
        backgroundColor: color,
        transform: [{ translateX: box * 0.24 }, { translateY: box * 0.24 }, { rotate: '45deg' }],
      },
    }),
  );
};

/** Three bars. The affordance for "show the list of conversations". */
export const MenuIcon = ({ size, color, thickness }: IconProps): ReactElement => {
  const box = size ?? DEFAULT_SIZE;
  const bar = thickness ?? DEFAULT_THICKNESS;

  const barStyle: ViewStyle = {
    width: box * 0.78,
    height: bar,
    borderRadius: bar / 2,
    backgroundColor: color,
  };

  return createElement(
    View,
    {
      style: {
        width: box,
        height: box,
        alignItems: 'center',
        justifyContent: 'center',
        gap: bar + 1,
      },
    },
    createElement(View, { key: 'a', style: barStyle }),
    createElement(View, { key: 'b', style: barStyle }),
    createElement(View, { key: 'c', style: barStyle }),
  );
};

/** A square. Stop, in the universal transport sense. */
export const StopIcon = ({ size, color }: IconProps): ReactElement => {
  const box = size ?? DEFAULT_SIZE;

  return createElement(
    View,
    { style: { width: box, height: box, alignItems: 'center', justifyContent: 'center' } },
    createElement(View, {
      style: {
        width: box * 0.58,
        height: box * 0.58,
        borderRadius: 2,
        backgroundColor: color,
      },
    }),
  );
};

/**
 * A plus.
 *
 * For "new conversation". A plus reads as *add* where an icon of a document reads as *open*.
 */
export const PlusIcon = ({ size, color, thickness }: IconProps): ReactElement => {
  const box = size ?? DEFAULT_SIZE;
  const bar = thickness ?? DEFAULT_THICKNESS;

  return createElement(
    View,
    { style: { width: box, height: box, alignItems: 'center', justifyContent: 'center' } },
    createElement(View, {
      key: 'h',
      style: {
        position: 'absolute',
        width: box * 0.72,
        height: bar,
        borderRadius: bar / 2,
        backgroundColor: color,
      },
    }),
    createElement(View, {
      key: 'v',
      style: {
        position: 'absolute',
        width: bar,
        height: box * 0.72,
        borderRadius: bar / 2,
        backgroundColor: color,
      },
    }),
  );
};

/**
 * A filled circle holding another icon.
 *
 * The leading mark on an action row — white in dark mode, black in light, which is why the colours are given
 * rather than chosen here.
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
