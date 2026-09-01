import {
  AlertCircleIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  RefreshIcon,
  useTheme,
} from '@mobile-automation/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, type LayoutChangeEvent, Pressable, Text, View } from 'react-native';

import { type Task, type TaskList, currentTask, taskPositionLabel } from './taskList';

/**
 * The agent's plan, as a timeline.
 *
 * Device testing was specific: a plan shown as a paragraph of arrows is unreadable, and what a person wants is a
 * list where each step's state is visible at a glance. So each task gets a row with a status glyph and a
 * connecting rail, which is the shape every task UI converges on because it answers "where is it now" without
 * being read word by word.
 *
 * Two presentations of one component, because they are the same information at two levels of attention:
 *
 * - {@link TaskTimeline} in the transcript, where a plan is part of the conversation's history.
 * - {@link PinnedTaskCard} beneath the header, collapsed to the current task and expanding into the timeline.
 *
 * The status colours come from the theme's semantic roles rather than being chosen here, so both presentations
 * agree and both are right in either scheme (ADR 0004).
 */

export interface TaskTimelineProps {
  readonly list: TaskList;
  /** Suppresses the heading when the caller already has one, as the pinned card does. */
  readonly compact?: boolean;
}

export const TaskTimeline = ({ list, compact = false }: TaskTimelineProps) => {
  const { theme } = useTheme();

  return (
    <View style={{ gap: theme.spacing[1] }}>
      {!compact && (
        <View className="mb-1 flex-row items-center gap-2">
          {list.isReplan && <RefreshIcon size={14} color={theme.colors.textMuted} />}

          <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {list.isReplan ? 'New plan' : 'Plan'}
          </Text>

          <Text className="text-xs text-text-muted">{taskPositionLabel(list)}</Text>
        </View>
      )}

      {list.tasks.map((task, index) => (
        <TaskRow key={`${index}-${task.text}`} task={task} last={index === list.tasks.length - 1} />
      ))}
    </View>
  );
};

/**
 * One task: a glyph, a rail down to the next one, and the text.
 *
 * The rail is what makes this read as a sequence rather than a list of unrelated lines — and it stops at the
 * last row, because a line trailing off the bottom suggests steps that are not there.
 */
const TaskRow = ({ task, last }: { readonly task: Task; readonly last: boolean }) => {
  const { theme } = useTheme();
  const tone = toneFor(task.status, theme.colors);

  return (
    <View className="flex-row">
      <View className="items-center" style={{ width: 22 }}>
        <StatusGlyph status={task.status} color={tone.glyph} />

        {!last && (
          <View
            className="flex-1"
            style={{
              width: 2,
              minHeight: 12,
              marginTop: 2,
              borderRadius: 1,
              // Solid behind a completed step, faint ahead of the agent: the rail itself shows how far the work
              // has reached, without needing to be read.
              backgroundColor: task.status === 'done' ? tone.glyph : theme.colors.border,
            }}
          />
        )}
      </View>

      <Text
        className="flex-1 pb-2 pl-2 text-xs leading-4"
        style={{
          color: tone.text,
          // Only the active task is emphasised. Bolding everything would defeat the point of emphasising
          // anything.
          fontWeight: task.status === 'active' ? '600' : '400',
        }}
      >
        {task.text}
      </Text>
    </View>
  );
};

const StatusGlyph = ({
  status,
  color,
}: {
  readonly status: Task['status'];
  readonly color: string;
}) => {
  switch (status) {
    case 'done':
      return <CheckCircleIcon size={16} color={color} />;

    case 'abandoned':
      return <AlertCircleIcon size={16} color={color} />;

    case 'active':
      return <ActiveGlyph color={color} />;

    // pending and skipped are both "not done", and drawing them alike is honest: the difference is whether the
    // run is still going, which the card's own state already says.
    default:
      return <CircleIcon size={16} color={color} />;
  }
};

/**
 * The active task's glyph: a ring that pulses.
 *
 * Motion rather than a distinct shape, because "this is happening now" is a live fact and a static icon reads
 * the same whether the agent is working or stalled.
 */
const ActiveGlyph = ({ color }: { readonly color: string }) => {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: PULSE_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: PULSE_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    // Stopped on unmount. A loop left running holds the JS thread awake for a component nobody can see.
    return () => animation.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={{
        width: 14,
        height: 14,
        borderRadius: 7,
        borderWidth: 2,
        borderColor: color,
        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] }),
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.1] }) }],
      }}
    />
  );
};

export interface PinnedTaskCardProps {
  readonly list: TaskList;
}

/**
 * The current task, pinned beneath the header, expanding into the full timeline.
 *
 * Pinned because the plan scrolls away the moment the agent starts working, and "what is it doing now" is the
 * question a user asks continuously while watching their phone be driven.
 *
 * ## Why the expanded panel floats rather than growing the card
 *
 * Device testing reported two things about expanding it, and they have one cause. It snapped open with no
 * motion, and it pushed the whole conversation down.
 *
 * Both came from the expanded timeline being an ordinary child: mounting it changed the card's height, which
 * changed the layout of everything below it. `LayoutAnimation` was meant to smooth that, but it animates the
 * *surrounding* layout — so even at its best the fix was animating the chat rather than the card, which is the
 * behaviour that was reported as wrong. A panel that displaces the content behind it is also just the wrong
 * model for this: it is a disclosure over the conversation, not a section of it.
 *
 * So the panel is **absolutely positioned** and out of flow. Nothing below it moves, at all, ever. It reveals
 * itself by sliding down from behind the card with a `translateY` on the **native driver**, which matters
 * during a run: the JS thread is the one driving the phone, and a per-frame layout pass there is stealing time
 * from the automation.
 *
 * The panel is laid out at its natural height from the first render and only measured once, which is what lets
 * the slide be a transform rather than an animated height. An animated height cannot use the native driver and
 * would make the timeline re-measure every frame.
 */
export const PinnedTaskCard = ({ list }: PinnedTaskCardProps) => {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);

  /** Natural height of the timeline, measured once so the slide can be a transform. */
  const [panelHeight, setPanelHeight] = useState(0);

  const reveal = useRef(new Animated.Value(0)).current;

  const active = currentTask(list);

  useEffect(() => {
    Animated.timing(reveal, {
      toValue: expanded ? 1 : 0,
      duration: EXPAND_MS,
      // Decelerating out, accelerating in: opening should feel like it settles, closing like it is dismissed.
      easing: expanded ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [expanded, reveal]);

  const onMeasure = useCallback(
    (event: LayoutChangeEvent) => {
      const measured = Math.round(event.nativeEvent.layout.height);

      // Only ever grows, and only from zero to a real measurement. A remeasure mid-animation would move the
      // clip while the panel slides through it, which reads as a stutter.
      if (measured > 0 && measured !== panelHeight) setPanelHeight(measured);
    },
    [panelHeight],
  );

  return (
    // `zIndex` and `elevation` together: iOS orders by the first, Android draws by the second, and the floating
    // panel has to be above the conversation on both.
    <View className="mx-3 mt-2" style={{ zIndex: 20, elevation: 20 }}>
      <View className="overflow-hidden rounded-xl border border-border bg-surface">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            active === null
              ? `Plan, ${taskPositionLabel(list)}, ${expanded ? 'collapse' : 'expand'}`
              : `Current task: ${active.text}. ${expanded ? 'Collapse' : 'Expand'} the plan`
          }
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((current) => !current)}
          style={{ minHeight: MIN_TOUCH_TARGET }}
          className="flex-row items-center gap-2 px-3"
        >
          {/* The chevron leads, because it is the affordance — putting it on the far right of a card whose text
              length varies makes it look like part of the text. Rotated rather than swapped, so the state change
              is a movement the eye follows rather than two icons that happen to differ. */}
          <Animated.View
            style={{
              transform: [
                {
                  rotate: reveal.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '180deg'],
                  }),
                },
              ],
            }}
          >
            <ChevronDownIcon size={16} color={theme.colors.textSecondary} />
          </Animated.View>

          <View className="flex-1 py-2">
            <Text className="text-xs font-medium uppercase tracking-wide text-text-muted">
              {list.isReplan ? 'New plan' : 'Plan'} · {taskPositionLabel(list)}
            </Text>

            <Text numberOfLines={1} className="text-sm text-text-primary">
              {active?.text ?? 'Finished'}
            </Text>
          </View>
        </Pressable>

        {/* A progress rail rather than a percentage: the fraction of a plan completed is a feeling, not a number
            anyone acts on. */}
        <View className="h-0.5 bg-surface-muted">
          <View
            className="h-0.5 bg-primary"
            style={{ width: `${Math.round(fractionDone(list) * 100)}%` }}
          />
        </View>
      </View>

      {/* Out of flow, clipped to the measured height, sliding out from behind the card above it.
          `pointerEvents` follows the state so a collapsed panel cannot swallow taps meant for the conversation
          it is invisibly covering. */}
      <View
        pointerEvents={expanded ? 'auto' : 'none'}
        style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          height: panelHeight === 0 ? undefined : panelHeight,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          onLayout={onMeasure}
          className="rounded-b-xl border-x border-b border-border bg-surface"
          style={{
            padding: theme.spacing[3],
            // Shadowed, because it is floating over the conversation and a flat panel would look like part of
            // a scrolled list.
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
            elevation: 8,
            opacity: reveal,
            transform: [
              {
                translateY: reveal.interpolate({
                  inputRange: [0, 1],
                  // From fully behind the card to its resting place. Before measurement the offset is a guess
                  // that is never seen, since opacity is zero until the first reveal.
                  outputRange: [-(panelHeight || ESTIMATED_PANEL_HEIGHT), 0],
                }),
              },
            ],
          }}
        >
          <TaskTimeline list={list} compact />
        </Animated.View>
      </View>
    </View>
  );
};

const fractionDone = (list: TaskList): number => {
  if (list.tasks.length === 0) return 0;
  return list.tasks.filter((task) => task.status === 'done').length / list.tasks.length;
};

const toneFor = (
  status: Task['status'],
  colors: ReturnType<typeof useTheme>['theme']['colors'],
): { readonly glyph: string; readonly text: string } => {
  switch (status) {
    case 'done':
      return { glyph: colors.success, text: colors.textSecondary };
    case 'active':
      return { glyph: colors.primary, text: colors.textPrimary };
    case 'abandoned':
      return { glyph: colors.warning, text: colors.textMuted };
    default:
      return { glyph: colors.border, text: colors.textMuted };
  }
};

/** Slow enough to read as breathing rather than flashing. */
const PULSE_MS = 700;

const EXPAND_MS = 220;

/**
 * Assumed panel height for the very first reveal.
 *
 * Only used before `onLayout` has measured anything, and never visible: opacity is zero at that point, so the
 * offset only has to be large enough that the panel starts out of sight.
 */
const ESTIMATED_PANEL_HEIGHT = 240;

const MIN_TOUCH_TARGET = 48;
