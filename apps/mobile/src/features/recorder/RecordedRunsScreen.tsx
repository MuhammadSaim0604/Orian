import { type ExecutionTrace } from '@mobile-automation/execution-recorder';
import { Badge, Button, Card, EmptyState } from '@mobile-automation/ui';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import {
  type TraceSummary,
  deleteTrace,
  isTraceStorageAvailable,
  listTraces,
  loadTrace,
  traceStorageUsedBytes,
} from './traceStorage';

/**
 * Recorded runs.
 *
 * Every agent run is recorded, so this list is the answer to "that worked - can I keep it?".
 * That question is asked *after* watching a run succeed, which is why recording is automatic
 * rather than opt-in: an opt-in would mean the interesting runs are the ones nobody recorded.
 *
 * The storage figure is shown because recordings carry screenshots and accumulate invisibly.
 * A user who never sees the cost has no reason to prune, and a feature that quietly consumes
 * storage is one they will resent later.
 */

export interface RecordedRunsScreenProps {
  /** Opens the review screen for a loaded trace. */
  readonly onReview: (trace: ExecutionTrace) => void;
}

export const RecordedRunsScreen = ({ onReview }: RecordedRunsScreenProps) => {
  const [summaries, setSummaries] = useState<readonly TraceSummary[]>([]);
  const [bytesUsed, setBytesUsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);

    void Promise.all([listTraces(), traceStorageUsedBytes()])
      .then(([rows, bytes]) => {
        setSummaries(rows);
        setBytesUsed(bytes);
        setError(null);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Recorded runs could not be read.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);

  const open = (id: string) => {
    void loadTrace(id).then((result) => {
      if (!result.ok) {
        setError(
          result.reason === 'not-found'
            ? 'That recording no longer exists.'
            : (result.detail ?? 'That recording could not be read.'),
        );
        refresh();
        return;
      }

      onReview(result.trace);
    });
  };

  return (
    <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 32 }}>
      <View accessibilityRole="header">
        <Text className="text-2xl font-bold text-text-primary">Recorded runs</Text>
        <Text className="mt-1 text-sm text-text-secondary">
          Every agent run is recorded. Turn one into a workflow to repeat it whenever you like.
        </Text>
      </View>

      {!isTraceStorageAvailable() && (
        <Card muted>
          <Text className="text-xs text-text-secondary">
            Recordings need the native storage module, which is not present in this build.
          </Text>
        </Card>
      )}

      {error != null && (
        <Card muted>
          <Text className="text-xs text-danger">{error}</Text>
        </Card>
      )}

      {loading ? (
        <Text className="px-1 text-xs text-text-muted">Loading…</Text>
      ) : summaries.length === 0 ? (
        <EmptyState
          title="No runs recorded yet"
          detail="Give the agent a goal on the Agent tab. Whatever it does will appear here."
        />
      ) : (
        summaries.map((summary) => (
          <Pressable
            key={summary.id}
            accessibilityRole="button"
            accessibilityLabel={`Review ${summary.goal}, ${summary.stepCount} steps, ${summary.outcome}`}
            onPress={() => open(summary.id)}
            className="rounded-lg border border-border bg-surface p-4"
          >
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-sm font-semibold text-text-primary" numberOfLines={2}>
                  {summary.goal}
                </Text>
                <Text className="mt-1 text-xs text-text-muted">
                  {summary.stepCount} step{summary.stepCount === 1 ? '' : 's'} ·{' '}
                  {formatWhen(summary.recordedAtEpochMs)}
                </Text>
              </View>

              <View className="items-end gap-2">
                <Badge
                  label={summary.outcome}
                  tone={summary.outcome === 'succeeded' ? 'good' : 'warn'}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete the recording of ${summary.goal}`}
                  onPress={() => {
                    void deleteTrace(summary.id).then(refresh);
                  }}
                  className="px-1"
                >
                  <Text className="text-xs text-danger">Delete</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        ))
      )}

      {summaries.length > 0 && (
        <Card muted>
          <Text className="text-xs text-text-secondary">
            Recordings keep a screenshot and screen layout per step, currently using{' '}
            {formatBytes(bytesUsed)}. Only the twenty most recent runs are kept.
          </Text>
        </Card>
      )}

      <Button label="Refresh" variant="ghost" onPress={refresh} />
    </ScrollView>
  );
};

/** Relative, because "20 minutes ago" is what someone wants to know about their own run. */
const formatWhen = (epochMs: number): string => {
  const minutes = Math.round((Date.now() - epochMs) / 60_000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return new Date(epochMs).toLocaleDateString();
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_024 * 1_024) return `${Math.round(bytes / 1_024)} KB`;
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
};
