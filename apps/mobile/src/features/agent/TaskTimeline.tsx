import {
  AlertCircleIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleIcon,
  RefreshIcon,
  useTheme,
} from '@mobile-automation/ui';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';

import { animateNextLayout } from './animateLayout';
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
 * question a user asks continuously while watching their phone be driven. Collapsed by default so it costs one
 * line; expanded on a tap, animated, because a card that jumps to full height moves the conversation under the
 * user's eyes.
 */
export const PinnedTaskCard = ({ list }: PinnedTaskCardProps) => {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const active = currentTask(list);

  /**
   * Expanded by mounting, with the platform animating the surrounding layout.
   *
   * Not an animated `maxHeight`, which is what this used to be and what made the conversation jitter: the content
   * lays out at full height immediately while the clamp grows, so the scroll view's content size jumps in one frame
   * and everything below shifts. `maxHeight` also cannot use the native driver, so every frame was a JS-thread
   * layout pass — during a run, on the thread driving the phone.
   */
  const toggle = () => {
    animateNextLayout(EXPAND_MS);
    setExpanded((current) => !current);
  };

  return (
    // `overflow-hidden` sits on the card, whose height changes only when the platform animates it — it is here to
    // keep the progress rail inside the rounded corners.
    <View className="mx-3 mt-2 overflow-hidden rounded-xl border border-border bg-surface">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          active === null
            ? `Plan, ${taskPositionLabel(list)}, ${expanded ? 'collapse' : 'expand'}`
            : `Current task: ${active.text}. ${expanded ? 'Collapse' : 'Expand'} the plan`
        }
        accessibilityState={{ expanded }}
        onPress={toggle}
        style={{ minHeight: MIN_TOUCH_TARGET }}
        className="flex-row items-center gap-2 px-3"
      >
        {/* The chevron leads, because it is the affordance — putting it on the far right of a card whose text
            length varies makes it look like part of the text. */}
        {expanded ? (
          <ChevronUpIcon size={16} color={theme.colors.textSecondary} />
        ) : (
          <ChevronDownIcon size={16} color={theme.colors.textSecondary} />
        )}

        <View className="flex-1 py-2">
          <Text className="text-xs font-medium uppercase tracking-wide text-text-muted">
            {list.isReplan ? 'New plan' : 'Plan'} · {taskPositionLabel(list)}
          </Text>

          <Text numberOfLines={expanded ? undefined : 1} className="text-sm text-text-primary">
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

      {expanded && (
        <View style={{ padding: theme.spacing[3] }}>
          <TaskTimeline list={list} compact />
        </View>
      )}
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

const MIN_TOUCH_TARGET = 48;
