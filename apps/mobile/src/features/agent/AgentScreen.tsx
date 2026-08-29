import { type ExecutionTrace } from '@mobile-automation/execution-recorder';
import { useTheme } from '@mobile-automation/ui';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useAutomationStatus } from '../automation/useAutomationStatus';

import { AgentEventRow } from './AgentEventRow';
import { useAgentRun } from './useAgentRun';

/**
 * The agent screen: type a goal, watch it happen, stop it.
 *
 * Three things this screen must get right, because it is the surface where a user hands
 * control of their phone to a model:
 *
 * - **Stop is always reachable.** It sits beside the goal field rather than at the bottom
 *   of a scrolling log, because a user who wants to stop an agent wants to stop it now.
 * - **Every step is narrated.** An agent acting silently is alarming; the log is the
 *   reassurance that it is doing what was asked.
 * - **It refuses to start when it cannot work.** Accessibility off or no provider key are
 *   different problems with different fixes, and both are stated plainly rather than
 *   surfacing later as a failed run.
 */
export interface AgentScreenProps {
  /**
   * Offers the finished run for compilation into a workflow.
   *
   * Passed in rather than navigated to from here, because the shell owns routing and this
   * screen should not know that a builder exists.
   */
  readonly onBuildWorkflow?: (trace: ExecutionTrace) => void;
}

export const AgentScreen = ({ onBuildWorkflow }: AgentScreenProps = {}) => {
  const { theme } = useTheme();
  const { status } = useAutomationStatus();
  const {
    runState,
    goal: activeGoal,
    currentTask,
    events,
    result,
    configError,
    trace,
    start,
    stop,
    reset,
  } = useAgentRun();

  const [goal, setGoal] = useState('');

  const running = runState === 'running';
  const canRun = status.isReady && goal.trim() !== '' && !running;

  // A run in progress with an empty field means this screen was mounted mid-run — the user left and came
  // back, or navigated away and returned. Showing the live goal rather than a blank box is the
  // reconnection requirement in Step 3.
  const displayedGoal = running && goal === '' ? activeGoal : goal;

  return (
    <View className="flex-1 gap-3">
      <View accessibilityRole="header">
        <Text className="text-2xl font-bold text-text-primary">AI Agent</Text>
        <Text className="mt-1 text-sm text-text-secondary">
          Describe what you want done. The agent reads your screen and acts, one step at a time.
        </Text>
      </View>

      {!status.isReady && (
        <View className="rounded-lg border border-warning bg-surface-muted p-3">
          <Text className="text-sm font-medium text-text-primary">
            Accessibility service is off
          </Text>
          <Text className="mt-1 text-xs text-text-secondary">
            The agent cannot read or touch the screen until you enable it in Android settings.
          </Text>
        </View>
      )}

      {configError != null && (
        <View className="rounded-lg border border-danger bg-surface-muted p-3">
          <Text className="text-sm font-medium text-danger">Cannot start</Text>
          <Text className="mt-1 text-xs text-text-secondary">{configError}</Text>
        </View>
      )}

      <View className="gap-2">
        <TextInput
          accessibilityLabel="What should the agent do?"
          className="rounded-lg border border-border bg-surface px-3 py-3 text-base text-text-primary"
          placeholder="Send Robert a WhatsApp message that I'll be late tomorrow"
          placeholderTextColor={theme.colors.textMuted}
          value={displayedGoal}
          onChangeText={setGoal}
          editable={!running}
          multiline
        />

        {/* The live task, so a user returning to the app sees what is happening now rather than
            having to read back through the log. */}
        {running && currentTask !== '' && (
          <Text className="px-1 text-xs text-text-secondary">{currentTask}</Text>
        )}

        <View className="flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Run the agent"
            accessibilityState={{ disabled: !canRun }}
            disabled={!canRun}
            onPress={() => start(goal)}
            className={`flex-1 items-center rounded-lg px-4 py-3 ${
              canRun ? 'bg-primary' : 'bg-surface-muted'
            }`}
          >
            <Text
              className={`text-sm font-semibold ${
                canRun ? 'text-text-on-primary' : 'text-text-muted'
              }`}
            >
              {running ? 'Running' : 'Run'}
            </Text>
          </Pressable>

          {running && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop the agent"
              onPress={stop}
              className="items-center rounded-lg border border-danger px-4 py-3"
            >
              <Text className="text-sm font-semibold text-danger">Stop</Text>
            </Pressable>
          )}

          {runState === 'finished' && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear the run"
              onPress={reset}
              className="items-center rounded-lg border border-border px-4 py-3"
            >
              <Text className="text-sm font-semibold text-text-secondary">Clear</Text>
            </Pressable>
          )}
        </View>
      </View>

      {result != null && (
        <View className="rounded-lg border border-border bg-surface p-3">
          <Text className="text-sm font-semibold text-text-primary">
            {result.outcome === 'succeeded' ? 'Done' : 'Stopped'} after {result.stepsTaken} step
            {result.stepsTaken === 1 ? '' : 's'}
          </Text>
          <Text className="mt-1 text-xs text-text-secondary">{result.summary}</Text>

          {/* Offered here, at the moment the user has just watched it work. Asking them to
              find the recording later would be asking them to remember it exists. */}
          {trace != null && trace.steps.length > 0 && onBuildWorkflow != null && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Build a reusable workflow from this run"
              onPress={() => onBuildWorkflow(trace)}
              className="mt-3 items-center rounded-md border border-primary px-3 py-2"
            >
              <Text className="text-xs font-semibold text-primary">
                Build a workflow from this run
              </Text>
            </Pressable>
          )}
        </View>
      )}

      <View className="flex-1 rounded-lg border border-border bg-surface px-3">
        {events.length === 0 ? (
          <View className="flex-1 items-center justify-center py-8">
            <Text className="text-sm text-text-muted">
              {running ? 'Starting...' : 'Nothing has run yet.'}
            </Text>
          </View>
        ) : (
          <ScrollView
            accessibilityLabel="Agent activity"
            contentContainerStyle={{ paddingVertical: theme.spacing[2] }}
          >
            {events.map((event, index) => (
              <AgentEventRow key={`${event.timestampEpochMs}-${index}`} event={event} />
            ))}

            {running && (
              <View className="flex-row items-center gap-2 py-3">
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text className="text-xs text-text-muted">Working...</Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
};
