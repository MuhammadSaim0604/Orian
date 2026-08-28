import { EmptyState } from '@mobile-automation/ui';
import { useEffect, useRef } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useExecutionStore } from './executionStore';

/**
 * The execution log.
 *
 * Auto-scrolls to the newest entry while a run is in progress, because a log that has to be
 * dragged to see the current step is not a live view. It deliberately stops following once
 * the run ends, so the user can read back through what happened without the list moving.
 */
export const ExecutionLog = () => {
  const log = useExecutionStore((state) => state.log);
  const running = useExecutionStore((state) => state.running);

  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (running && log.length > 0) {
      scrollRef.current?.scrollToEnd({ animated: true });
    }
  }, [log.length, running]);

  if (log.length === 0) {
    return (
      <EmptyState
        title="Nothing has run yet"
        detail="Run the workflow to see each step here as it happens."
      />
    );
  }

  return (
    <ScrollView ref={scrollRef} accessibilityLabel="Execution log">
      {log.map((entry) => (
        <View key={entry.id} className="border-b border-border py-2">
          <View className="flex-row items-baseline justify-between">
            <Text className={`flex-1 pr-2 text-sm ${TONE_CLASS[entry.tone]}`}>{entry.label}</Text>
            <Text className="text-xs text-text-muted">{formatTime(entry.timestampEpochMs)}</Text>
          </View>
          {entry.detail != null && (
            <Text className="mt-0.5 text-xs text-text-secondary">{entry.detail}</Text>
          )}
        </View>
      ))}
    </ScrollView>
  );
};

const TONE_CLASS: Record<string, string> = {
  normal: 'text-text-primary',
  good: 'text-success',
  bad: 'text-danger',
  muted: 'text-text-muted',
};

/** Wall-clock time, since a run is something the user watched happen. */
const formatTime = (epochMs: number): string => {
  const date = new Date(epochMs);
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
};

/** Variables as they stand, for the debugger. */
export const VariablePanel = () => {
  const variables = useExecutionStore((state) => state.variables);

  const entries = Object.entries(variables);

  if (entries.length === 0) {
    return (
      <EmptyState
        title="No variables yet"
        detail="Values set while the workflow runs appear here."
      />
    );
  }

  return (
    <ScrollView accessibilityLabel="Workflow variables">
      {entries.map(([name, value]) => (
        <View key={name} className="border-b border-border py-2">
          <Text className="text-sm font-medium text-text-primary">{name}</Text>
          <Text className="mt-0.5 text-xs text-text-secondary">{JSON.stringify(value)}</Text>
        </View>
      ))}
    </ScrollView>
  );
};
