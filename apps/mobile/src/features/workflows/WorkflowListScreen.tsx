import { Button, Card, EmptyState } from '@mobile-automation/ui';
import { WORKFLOW_SCHEMA_VERSION } from '@mobile-automation/workflow-schema';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useCanvasStore } from '../canvas/canvasStore';
import { useExecutionStore } from '../canvas/executionStore';
import { useSelectionStore } from '../canvas/selectionStore';

import {
  type WorkflowSummary,
  deleteWorkflow,
  isStorageAvailable,
  listWorkflows,
  loadWorkflow,
} from './storage';

/**
 * The workflow list: the app's front door.
 *
 * Opening a workflow clears the execution state as well as loading the graph. Leaving the
 * previous run's node colours on a newly opened workflow would show green and red marks
 * against steps that never ran.
 */

export interface WorkflowListScreenProps {
  readonly onOpen: () => void;
  /** Opens the Create-by-AI sheet. */
  readonly onCreateWithAi: () => void;
}

export const WorkflowListScreen = ({ onOpen, onCreateWithAi }: WorkflowListScreenProps) => {
  const [summaries, setSummaries] = useState<readonly WorkflowSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCanvasStore((state) => state.load);
  const reset = useCanvasStore((state) => state.reset);
  const clearExecution = useExecutionStore((state) => state.clear);
  const clearSelection = useSelectionStore((state) => state.clearSelection);

  const refresh = useCallback(() => {
    setLoading(true);

    void listWorkflows()
      .then((rows) => {
        setSummaries(rows);
        setError(null);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Saved workflows could not be read.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);

  const open = (id: string) => {
    void loadWorkflow(id).then((result) => {
      if (!result.ok) {
        setError(
          result.reason === 'not-found'
            ? 'That workflow no longer exists.'
            : (result.detail ?? 'That workflow could not be opened.'),
        );
        refresh();
        return;
      }

      clearExecution();
      clearSelection();
      load(result.workflow);
      onOpen();
    });
  };

  const createBlank = () => {
    clearExecution();
    clearSelection();
    reset();
    onOpen();
  };

  return (
    <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 32 }}>
      <View accessibilityRole="header">
        <Text className="text-2xl font-bold text-text-primary">Workflows</Text>
        <Text className="mt-1 text-sm text-text-secondary">
          Build a sequence of steps once, then run it whenever you need it.
        </Text>
      </View>

      <View className="flex-row gap-2">
        <Button label="New workflow" full onPress={createBlank} />
        <Button label="Create with AI" variant="secondary" full onPress={onCreateWithAi} />
      </View>

      {!isStorageAvailable() && (
        <Card muted>
          <Text className="text-xs text-text-secondary">
            Saved workflows need the native storage module, which is not present in this build.
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
          title="No saved workflows"
          detail="Create one by hand, or describe what you want and let the AI build it."
        />
      ) : (
        summaries.map((summary) => (
          <Pressable
            key={summary.id}
            accessibilityRole="button"
            accessibilityLabel={`Open ${summary.name}, ${summary.nodeCount} steps`}
            onPress={() => open(summary.id)}
            className="rounded-lg border border-border bg-surface p-4"
          >
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-base font-semibold text-text-primary">{summary.name}</Text>
                {summary.description != null && summary.description !== '' && (
                  <Text className="mt-0.5 text-xs text-text-secondary">{summary.description}</Text>
                )}
                <Text className="mt-1 text-xs text-text-muted">
                  {summary.nodeCount} step{summary.nodeCount === 1 ? '' : 's'} ·{' '}
                  {formatWhen(summary.updatedAtEpochMs)}
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${summary.name}`}
                onPress={() => {
                  void deleteWorkflow(summary.id).then(refresh);
                }}
                className="px-2 py-1"
              >
                <Text className="text-xs text-danger">Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        ))
      )}

      <Text className="px-1 text-xs text-text-muted">
        Workflow format v{WORKFLOW_SCHEMA_VERSION}
      </Text>
    </ScrollView>
  );
};

/**
 * When a workflow was last saved, in relative terms.
 *
 * Relative rather than a timestamp, because "2 hours ago" is what someone wants to know about
 * their own work, and a date is only useful once it is old.
 */
const formatWhen = (epochMs: number): string => {
  const elapsed = Date.now() - epochMs;

  const minutes = Math.round(elapsed / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;

  return new Date(epochMs).toLocaleDateString();
};
