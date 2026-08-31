import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, type ViewStyle } from 'react-native';

/**
 * Screen transitions.
 *
 * Two motions, meaning two different things, which is the whole reason this is not one animation with a
 * parameter:
 *
 * - **Entering a mode** rises from the bottom. It replaces the entire interface, and the vertical motion says
 *   so — this is the transition ADR 0011's mode switch already had, and it is deliberately unchanged.
 * - **Moving inside a mode** slides horizontally. It is navigation within one product: forward pushes in from
 *   the right, back returns to the left, which is the convention every phone user already knows.
 *
 * Hand-written because navigation is a typed route store rather than react-navigation (ADR 0015). Owning the
 * transitions is the cost of that choice, and this is where it is paid.
 */

export type TransitionDirection = 'forward' | 'backward';

/**
 * A horizontal slide, keyed on a value that changes per screen.
 *
 * The key rather than a boolean, so the animation restarts on every navigation: a boolean would only fire on
 * the first change and every later screen would appear without motion.
 */
export const useHorizontalTransition = (
  key: string,
  direction: TransitionDirection = 'forward',
): ViewStyle => {
  const progress = useRef(new Animated.Value(1)).current;
  const previous = useRef(key);

  useEffect(() => {
    if (previous.current === key) return;
    previous.current = key;

    progress.setValue(0);

    Animated.timing(progress, {
      toValue: 1,
      duration: SLIDE_DURATION_MS,
      // Decelerating: fast at the start so the screen feels responsive to the tap, settling rather than
      // stopping dead.
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [key, progress]);

  const width = Dimensions.get('window').width;
  const from = direction === 'forward' ? width * SLIDE_FRACTION : -width * SLIDE_FRACTION;

  return {
    transform: [
      { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) },
    ],
    // Faded in as well as slid, because a slide alone from a partial offset reads as a jump on a fast device.
    opacity: progress,
  } as unknown as ViewStyle;
};

/**
 * A partial slide rather than the full screen width.
 *
 * A full-width slide on a phone takes long enough to feel slow, and the content is not visible for most of it
 * anyway. A third of the width plus a fade reads as the same motion in less time.
 */
const SLIDE_FRACTION = 0.35;

const SLIDE_DURATION_MS = 220;
