import { Button, useTheme } from '@mobile-automation/ui';
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
 * Everything is deliberately terse. This floats over whatever the user is actually looking at, and
 * every pixel it uses is one they cannot see through.
 */

export interface AgentStatusOverlayProps {
  /**
   * Passed as an initial prop by Kotlin, so the overlay can never render unbound.
   *
   * Not used to *fetch* anything - the run comes from the controller module, which both roots import.
   * It is used to notice a mismatch: if the window is somehow showing a run other than the current one,
   * the strip says so rather than showing a stop button that belongs to different work.
   */
  readonly runId: string;
}

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
    // window it is drawn into.
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
      <View className="flex-1 justify-center rounded-l-xl border border-border bg-surface px-3">
        <Text className="text-xs text-text-muted">
          This panel belongs to a run that has ended. Open the app to see the current one.
        </Text>
      </View>
    );
  }

  return (
    <View
      className="flex-1 overflow-hidden rounded-l-xl border border-border bg-surface"
      accessibilityLabel={`Agent status. ${running ? currentTask : 'Not running'}`}
    >
      {/* The whole header is the toggle: a small target on a floating strip is a frustrating one. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse the agent panel' : 'Expand the agent panel'}
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

        <Text className="text-xs text-text-muted">{expanded ? '›' : '‹'}</Text>
      </Pressable>

      {expanded && (
        <View className="flex-1 border-t border-border" style={{ gap: theme.spacing[2] }}>
          <Text className="px-3 pt-2 text-xs text-text-secondary" numberOfLines={2}>
            {goal}
          </Text>

          <ScrollView
            className="flex-1 px-3"
            accessibilityLabel="Agent activity"
            contentContainerStyle={{ paddingBottom: theme.spacing[2] }}
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
                className="rounded-md border border-border bg-surface-muted px-2 py-2 text-xs text-text-primary"
                placeholder="Add an instruction…"
                placeholderTextColor={theme.colors.textMuted}
                value={followUp}
                onChangeText={setFollowUp}
                onSubmitEditing={() => {
                  queue(followUp);
                  setFollowUp('');
                }}
                multiline
              />

              {/* Stated plainly rather than implied. The loop has no mid-run input point, so an
                  instruction typed now runs as the next task - and an input box that quietly did
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
          <Button
            label="Stop"
            variant="danger"
            size="sm"
            full
            onPress={stop}
            accessibilityLabel="Stop the agent"
          />
        ) : (
          <Button
            label="Run again"
            variant="secondary"
            size="sm"
            full
            disabled={goal === ''}
            onPress={() => start(goal)}
            accessibilityLabel="Run the same task again"
          />
        )}
      </View>
    </View>
  );
};

/** The panel is short; more than this is scrolling nobody does from a floating window. */
const MAX_VISIBLE_EVENTS = 20;
