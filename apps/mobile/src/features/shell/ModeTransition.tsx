import { type ReactNode, useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/**
 * The animation that plays when a mode is entered.
 *
 * Its purpose is informational, not decorative. Choosing a mode replaces the entire interface
 * (ADR 0011), and without a transition that is indistinguishable from a tab switch — the user has
 * no way to tell that settings, navigation, and sessions all just changed underneath them.
 *
 * So it is deliberately a *whole-screen* movement rather than a subtle fade: content slides in and
 * settles, which reads as "somewhere new" instead of "same place, different contents".
 *
 * Values live in Reanimated shared values and run on the UI thread, so the animation does not
 * compete with the mode's first render — which for Workflow Mode includes building the node
 * registry.
 */

export interface ModeTransitionProps {
  /** Changing this key restarts the animation, which is how switching modes replays it. */
  readonly transitionKey: string;
  readonly children: ReactNode;
  /** Called when the animation finishes, so the shell can clear its transitioning flag. */
  readonly onSettled?: () => void;
}

const DURATION_MS = 260;

/** How far the incoming interface travels. Enough to read as movement, not far enough to lag. */
const TRAVEL_PX = 24;

export const ModeTransition = ({ transitionKey, children, onSettled }: ModeTransitionProps) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: DURATION_MS,
      // Decelerating: fast at the start so the app feels responsive, slow at the end so it
      // settles rather than stopping dead.
      easing: Easing.out(Easing.cubic),
    });

    const timer = setTimeout(() => onSettled?.(), DURATION_MS);
    return () => clearTimeout(timer);
    // `transitionKey` is the dependency that matters; the shared value is stable.
  }, [onSettled, progress, transitionKey]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * TRAVEL_PX }],
  }));

  return (
    <View className="flex-1 bg-background">
      <Animated.View style={[{ flex: 1 }, style]}>{children}</Animated.View>
    </View>
  );
};
