import { ChevronDownIcon, ChevronUpIcon, SparkIcon, useTheme } from '@mobile-automation/ui';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';

/**
 * The agent's reasoning, out of the way until asked for.
 *
 * Device testing was clear about what was wrong: the model's thinking was being stored as an assistant message,
 * so raw reasoning arrived in the conversation as chat bubbles — indistinguishable from the agent's actual reply
 * and several times longer.
 *
 * So reasoning is now a strip: an icon, the word *Thinking* pulsing while a run is live, and a chevron **next to
 * that word** rather than pushed to the far right, because the chevron belongs to the label it expands and a
 * right-aligned one reads as a row action. Expanded, the reasoning appears in a bordered section rather than a
 * bubble — a left rule says "this is quoted material, not speech".
 */

export interface ThinkingStripProps {
  readonly content: string;
  /**
   * Whether the run is still going.
   *
   * Drives the pulse. A finished run's stored reasoning is history and must sit still; blinking at someone
   * reading yesterday's conversation would imply work in progress.
   */
  readonly live?: boolean;
}

export const ThinkingStrip = ({ content, live = false }: ThinkingStripProps) => {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const reveal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(reveal, {
      toValue: expanded ? 1 : 0,
      duration: EXPAND_MS,
      easing: Easing.out(Easing.cubic),
      // Height is not a native-driver property, and fading alone would leave a full-height gap.
      useNativeDriver: false,
    }).start();
  }, [expanded, reveal]);

  return (
    <View className="py-1">
      <View className="flex-row items-center">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Hide the reasoning' : 'Show the reasoning'}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((current) => !current)}
          // Padded to the touch minimum without stretching: a full-width target here would swallow taps meant
          // for the messages around it.
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          className="flex-row items-center gap-1.5 py-1"
        >
          <SparkIcon size={14} color={theme.colors.textMuted} />

          {live ? <BlinkingLabel /> : <Text className="text-xs text-text-muted">Thought</Text>}

          {expanded ? (
            <ChevronUpIcon size={13} color={theme.colors.textMuted} />
          ) : (
            <ChevronDownIcon size={13} color={theme.colors.textMuted} />
          )}
        </Pressable>
      </View>

      <Animated.View
        style={{
          maxHeight: reveal.interpolate({ inputRange: [0, 1], outputRange: [0, MAX_REVEALED] }),
          opacity: reveal,
          overflow: 'hidden',
        }}
      >
        {/* A left rule and no background: quoted material rather than a message. The border colour is the muted
            one deliberately - reasoning should be legible when looked for and invisible when not. */}
        <View
          className="ml-1 mt-1 border-l-2 border-border pl-3"
          style={{ paddingVertical: theme.spacing[1] }}
        >
          <Text className="text-xs leading-4 text-text-secondary">{content}</Text>
        </View>
      </Animated.View>
    </View>
  );
};

/**
 * "Thinking" at a slow pulse.
 *
 * Opacity rather than a spinner or animated ellipsis. A spinner beside text competes with the send button's own
 * activity indicator, and cycling dots changes the string's width, which nudges the chevron sideways while
 * someone is trying to tap it.
 */
const BlinkingLabel = () => {
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, {
          toValue: DIM_OPACITY,
          duration: BLINK_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(blink, {
          toValue: 1,
          duration: BLINK_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    // A loop left running keeps the JS thread busy for a component nobody is looking at — and during an agent
    // run the JS thread is the thing driving the phone.
    return () => animation.stop();
  }, [blink]);

  return (
    <Animated.Text style={{ opacity: blink }} className="text-xs text-text-muted">
      Thinking
    </Animated.Text>
  );
};

/** Slow enough to read as breathing. Faster looks like a fault. */
const BLINK_MS = 800;

/** Dimmed, not invisible: text that disappears entirely reads as a rendering glitch. */
const DIM_OPACITY = 0.35;

const EXPAND_MS = 200;

/** A ceiling. Model reasoning can run to hundreds of words, and it must not bury the conversation. */
const MAX_REVEALED = 220;
