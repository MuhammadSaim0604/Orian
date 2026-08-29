import { useTheme } from '@mobile-automation/ui';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { AgentEventRow } from '../agent/AgentEventRow';
import { setAgentOverlayExpanded } from '../agent/agentOverlay';
import { useAgentRun } from '../agent/useAgentRun';

/**
 * What the agent status overlay shows.
 *
 * Rendered into a `WindowManager` window on the right edge of the screen — a **second React root**, so
 * it shares no ancestor with the app. It reads the run from `runController`, the module both roots
 * import (ADR 0016), which is why there is no message passing here: the run is not in either tree.
 *
 * Collapsed it answers two questions and nothing else: *what is it doing* and *how do I stop it*.
 * Expanded it adds the event log and an input box, for the case where the agent has gone wrong and the
 * user wants to redirect it without going back to the app.
 *
 * ## The controls are built here rather than reused
 *
 * The shared `Button` was wrong for this. Its `danger` variant is an **outline** —
 * `bg-transparent border border-danger` — which on a small floating strip reads as an empty rounded
 * rectangle rather than a button, and that is exactly how it was reported from a device. A stop button
 * that the user cannot identify is worse than no overlay, because it is the one control that matters
 * when an agent is doing something unwanted.
 *
 * So the stop control below is deliberately solid, filled, and at least 48dp tall — Android's minimum
 * touch target. Everything else is terse: this floats over what the user is actually looking at, and
 * every pixel it uses is one they cannot see through.
 */

export interface AgentStatusOverlayProps {
  /**
   * Passed as an initial prop by Kotlin, so the overlay can never render unbound.
   *
   * Not used to *fetch* anything — the run comes from the controller module, which both roots import.
   * It is used to notice a mismatch: if the window is somehow showing a run other than the current one,
   * the strip says so rather than showing a stop button that belongs to different work.
   */
  readonly runId: string;
}

/** Android's minimum touch target. Below this a control is a coin toss to hit. */
const MIN_TOUCH_TARGET = 48;

/** The panel is short; more than this is scrolling nobody does from a floating window. */
const MAX_VISIBLE_EVENTS = 20;

export const AgentStatusOverlay = ({ runId }: AgentStatusOverlayProps) => {
  const { theme } = useTheme();
  const {
    runState,
    runId: activeRunId,
    goal,
    currentTask,
    events,
    result,
    queuedFollowUp,
    timersHeld,
    stop,
    start,
    queue,
  } = useAgentRun();

  const [expanded, setExpanded] = useState(false);
  const [followUp, setFollowUp] = useState('');

  const toggle = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    // The window itself has to resize, which only Kotlin can do — React cannot change the size of the
    // window it is drawn into. Expanding also makes the window focusable, which is what lets the text
    // box below accept input at all.
    void setAgentOverlayExpanded(next);
  }, [expanded]);

  useEffect(() => {
    // A run that finishes while the panel is open collapses it, so the last thing the user sees is the
    // outcome rather than a chat box for a run that has ended.
    if (runState !== 'running' && expanded) {
      setExpanded(false);
      void setAgentOverlayExpanded(false);
    }
  }, [expanded, runState]);

  const running = runState === 'running';

  // The window outliving its run is the awkward case: Kotlin bound this surface to one run id, and if
  // the controller has since moved on, a stop button here would abort work the user never saw start.
  const isStale = running && activeRunId !== null && activeRunId !== runId;

  if (isStale) {
    return (
      <View className="flex-1 justify-center rounded-l-2xl border border-border bg-surface px-3">
        <Text className="text-xs text-text-muted">
          This panel belongs to a run that has ended. Open the app to see the current one.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 overflow-hidden rounded-l-2xl border border-border bg-surface">
      {/* The whole header is the toggle: a small target on a floating strip is a frustrating one. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse the agent panel' : 'Expand the agent panel'}
        accessibilityHint={
          expanded ? undefined : 'Shows what the agent has done and lets you add an instruction'
        }
        onPress={toggle}
        className="flex-row items-center gap-2 px-3 py-2"
      >
        <View
          className={`h-2 w-2 rounded-full ${running ? 'bg-success' : 'bg-text-muted'}`}
          accessibilityLabel={running ? 'Running' : 'Stopped'}
        />

        <Text className="flex-1 text-xs font-medium text-text-primary" numberOfLines={2}>
          {running ? currentTask : (result?.summary ?? 'Not running')}
        </Text>

        <Text className="text-base leading-none text-text-muted">{expanded ? '›' : '‹'}</Text>
      </Pressable>

      {/* Only shown when it is bad news, and only while running: a run that will freeze the moment the
          user leaves is something they need to know *before* they walk away, not afterwards. */}
      {running && !timersHeld && (
        <Text className="bg-warning/15 px-3 py-1 text-xs text-warning">
          May pause if you leave the app.
        </Text>
      )}

      {expanded && (
        <View className="flex-1 border-t border-border">
          <Text className="px-3 pt-2 text-xs text-text-secondary" numberOfLines={2}>
            {goal}
          </Text>

          <ScrollView
            className="flex-1 px-3"
            accessibilityLabel="Agent activity"
            contentContainerStyle={{ paddingVertical: theme.spacing[2] }}
          >
            {events.length === 0 ? (
              <Text className="py-3 text-xs text-text-muted">Nothing has happened yet.</Text>
            ) : (
              // Newest first: the panel is short, and the current step is what matters. The in-app
              // chat shows them oldest-first because there the history is the point.
              [...events]
                .reverse()
                .slice(0, MAX_VISIBLE_EVENTS)
                .map((event, index) => (
                  <AgentEventRow key={`${event.timestampEpochMs}-${index}`} event={event} />
                ))
            )}
          </ScrollView>

          {/* Only offered while running: a follow-up for a finished run would silently start a new
              one, which is not what "send" looks like it does. */}
          {running && (
            <View className="px-3 pb-2" style={{ gap: theme.spacing[1] }}>
              <TextInput
                accessibilityLabel="Tell the agent something"
                className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-xs text-text-primary"
                style={{ minHeight: MIN_TOUCH_TARGET }}
                placeholder="Add an instruction…"
                placeholderTextColor={theme.colors.textMuted}
                value={followUp}
                onChangeText={setFollowUp}
                onSubmitEditing={() => {
                  queue(followUp);
                  setFollowUp('');
                }}
                returnKeyType="done"
                multiline
              />

              {/* Stated plainly rather than implied. The loop has no mid-run input point, so an
                  instruction typed now runs as the next task — and an input box that quietly did
                  something other than what it looked like would be worse than none. */}
              <Text className="text-xs text-text-muted">
                {queuedFollowUp === null
                  ? 'Runs as the next task when this one finishes.'
                  : `Queued: ${queuedFollowUp}`}
              </Text>
            </View>
          )}
        </View>
      )}

      <View className="border-t border-border p-2">
        {running ? (
          <StopButton onPress={stop} />
        ) : (
          <SecondaryButton
            label="Run again"
            accessibilityLabel="Run the same task again"
            disabled={goal === ''}
            onPress={() => start(goal)}
          />
        )}
      </View>
    </View>
  );
};

/**
 * The stop control.
 *
 * Filled rather than outlined, and sized to a full touch target. This is the one control on the overlay
 * that has to be unmistakable: it is what a user reaches for when the agent is doing something they did
 * not intend, and they will be reaching for it in a hurry on top of another app.
 */
const StopButton = ({ onPress }: { readonly onPress: () => void }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel="Stop the agent"
    accessibilityHint="Ends the current task within a step"
    onPress={onPress}
    style={{ minHeight: MIN_TOUCH_TARGET }}
    className="flex-row items-center justify-center gap-2 rounded-lg bg-danger px-3 active:opacity-80"
  >
    {/* A square, which is the universal stop glyph, drawn as a view so the overlay needs no icon
        font or asset - a missing glyph inside a floating window is invisible until someone reports
        exactly what was reported here. */}
    <View className="h-3 w-3 rounded-sm bg-text-on-primary" />
    <Text className="text-sm font-semibold text-text-on-primary">Stop</Text>
  </Pressable>
);

const SecondaryButton = ({
  label,
  accessibilityLabel,
  disabled = false,
  onPress,
}: {
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={{ minHeight: MIN_TOUCH_TARGET }}
    className={`items-center justify-center rounded-lg border border-border px-3 ${
      disabled ? 'bg-surface-muted' : 'bg-surface-raised active:opacity-80'
    }`}
  >
    <Text className={`text-sm font-semibold ${disabled ? 'text-text-muted' : 'text-text-primary'}`}>
      {label}
    </Text>
  </Pressable>
);
