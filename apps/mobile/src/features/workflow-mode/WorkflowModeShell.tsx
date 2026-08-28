import { type ExecutionTrace } from '@mobile-automation/execution-recorder';
import { Button, Card, useTheme } from '@mobile-automation/ui';
import { type Workflow } from '@mobile-automation/workflow-schema';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AutomationStatusPanel } from '../automation/AutomationStatusPanel';
import { CanvasScreen } from '../canvas/CanvasScreen';
import { useCanvasStore } from '../canvas/canvasStore';
import { useExecutionStore } from '../canvas/executionStore';
import { useSelectionStore } from '../canvas/selectionStore';
import { RecordedRunsScreen } from '../recorder/RecordedRunsScreen';
import { TraceReviewScreen } from '../recorder/TraceReviewScreen';
import { loadTrace } from '../recorder/traceStorage';
import { ModeSettingsFooter } from '../shell/ModeSettingsFooter';
import { useShellStore } from '../shell/shellStore';
import { CreateWithAiScreen } from '../workflows/CreateWithAiScreen';
import { saveWorkflow } from '../workflows/storage';
import { WorkflowListScreen } from '../workflows/WorkflowListScreen';

/**
 * Workflow Mode.
 *
 * Its own navigation, separate from Agent Mode's (ADR 0011).
 *
 * Today it wires the existing screens into mode routes. **Step 6** builds the mode home properly
 * (row actions, a real loading screen, run history), **Step 7** rebuilds the canvas, and **Step 10**
 * replaces the create-with-AI screen with a real builder agent. The routes for all of that already
 * exist in `shellStore`, so those steps add screens rather than reshaping navigation.
 */
export const WorkflowModeShell = () => {
  const route = useShellStore((state) => state.workflowRoute);

  switch (route.kind) {
    case 'list':
      return <WorkflowHomeScreen />;

    case 'canvas':
      return <CanvasRoute />;

    case 'builderAgent':
      return <BuilderAgentRoute />;

    case 'runs':
      return <RunsRoute />;

    case 'reviewTrace':
      return <ReviewTraceRoute traceId={route.traceId} />;

    case 'loading':
      // Step 6 builds the real loading screen with named stages. Until then, opening a workflow
      // goes straight to the canvas, so this route is unreachable rather than half-built.
      return <CanvasRoute />;

    case 'settings':
      return <WorkflowSettingsScreen />;
  }
};

const WorkflowHomeScreen = () => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const navigate = useShellStore((state) => state.navigateWorkflow);

  return (
    <View className="flex-1 bg-background">
      <ModeHeader
        title="Workflows"
        subtitle="Build once, run whenever"
        onOpenSettings={() => navigate({ kind: 'settings' })}
      />

      <ScrollView
        contentContainerStyle={{
          paddingTop: theme.spacing[4],
          paddingBottom: insets.bottom + theme.spacing[6],
          paddingHorizontal: theme.spacing[5],
          gap: theme.spacing[4],
        }}
      >
        <WorkflowListScreen
          onOpen={() => navigate({ kind: 'canvas' })}
          onCreateWithAi={() => navigate({ kind: 'builderAgent' })}
        />

        <Button
          label="Recorded runs"
          variant="ghost"
          onPress={() => navigate({ kind: 'runs' })}
          accessibilityLabel="See recorded agent runs and turn one into a workflow"
        />
      </ScrollView>
    </View>
  );
};

/**
 * The canvas, with its save affordance.
 *
 * Full-bleed rather than inside a scroll view: the canvas owns its own gestures, and a parent
 * scroll view would compete with panning for every drag.
 */
const CanvasRoute = () => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const navigate = useShellStore((state) => state.navigateWorkflow);

  const dirty = useCanvasStore((state) => state.dirty);
  const markSaved = useCanvasStore((state) => state.markSaved);

  const [saveError, setSaveError] = useState<readonly string[]>([]);

  const save = useCallback(() => {
    const workflow = useCanvasStore.getState().toWorkflow();

    void saveWorkflow(workflow).then((result) => {
      if (result.ok) {
        markSaved();
        setSaveError([]);
        return;
      }

      // Reported rather than silently failing: a user who believes they saved and did not is
      // going to lose work.
      setSaveError(result.issues);
    });
  }, [markSaved]);

  return (
    <View className="flex-1 bg-background">
      <View
        className="flex-row items-center gap-2 border-b border-border px-4 pb-2"
        style={{ paddingTop: insets.top + theme.spacing[2] }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to workflows"
          onPress={() => navigate({ kind: 'list' })}
          className="px-2 py-1"
        >
          <Text className="text-sm text-primary">Back</Text>
        </Pressable>

        <View className="flex-1" />

        <Button
          label={dirty ? 'Save' : 'Saved'}
          variant={dirty ? 'primary' : 'secondary'}
          size="sm"
          disabled={!dirty}
          onPress={save}
        />
      </View>

      {saveError.length > 0 && (
        <View className="border-b border-danger bg-surface-muted px-4 py-2">
          <Text className="text-xs font-medium text-danger">Could not save:</Text>
          {saveError.slice(0, 3).map((issue) => (
            <Text key={issue} className="mt-0.5 text-xs text-text-secondary">
              • {issue}
            </Text>
          ))}
        </View>
      )}

      <View className="flex-1" style={{ paddingBottom: insets.bottom }}>
        <CanvasScreen />
      </View>
    </View>
  );
};

const BuilderAgentRoute = () => {
  const navigate = useShellStore((state) => state.navigateWorkflow);

  return (
    <ScrollRoute>
      <CreateWithAiScreen
        onCreated={() => navigate({ kind: 'canvas' })}
        onCancel={() => navigate({ kind: 'list' })}
      />
    </ScrollRoute>
  );
};

const RunsRoute = () => {
  const navigate = useShellStore((state) => state.navigateWorkflow);

  return (
    <ScrollRoute>
      <RecordedRunsScreen
        onReview={(trace) => navigate({ kind: 'reviewTrace', traceId: trace.id })}
      />
    </ScrollRoute>
  );
};

/**
 * Trace review, loaded by id.
 *
 * The route carries an **id rather than the trace**, so that arriving here from Agent Mode does not
 * mean passing a large object through shell state — and so a trace deleted between navigation and
 * render reports "no longer exists" instead of showing stale content.
 */
const ReviewTraceRoute = ({ traceId }: { readonly traceId: string }) => {
  const navigate = useShellStore((state) => state.navigateWorkflow);

  const clearExecution = useExecutionStore((state) => state.clear);
  const clearSelection = useSelectionStore((state) => state.clearSelection);
  const load = useCanvasStore((state) => state.load);

  const [trace, setTrace] = useState<ExecutionTrace | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadTrace(traceId).then((result) => {
      if (result.ok) {
        setTrace(result.trace);
        return;
      }

      setError(
        result.reason === 'not-found'
          ? 'That recording no longer exists.'
          : (result.detail ?? 'That recording could not be read.'),
      );
    });
  }, [traceId]);

  const openOnCanvas = useCallback(
    (workflow: Workflow) => {
      // Execution state is cleared as well as the graph loaded: a generated workflow showing the
      // previous run's green and red marks would be claiming things about steps that never ran.
      clearExecution();
      clearSelection();
      load(workflow);
      navigate({ kind: 'canvas' });
    },
    [clearExecution, clearSelection, load, navigate],
  );

  if (error != null) {
    return (
      <ScrollRoute>
        <Card title="Recording unavailable" muted>
          <View style={{ gap: 10 }}>
            <Text className="text-xs text-danger">{error}</Text>
            <Button label="Back" variant="ghost" onPress={() => navigate({ kind: 'runs' })} />
          </View>
        </Card>
      </ScrollRoute>
    );
  }

  if (trace === null) {
    return (
      <ScrollRoute>
        <Text className="px-1 text-xs text-text-muted">Loading the recording…</Text>
      </ScrollRoute>
    );
  }

  return (
    <ScrollRoute>
      <TraceReviewScreen
        trace={trace}
        onOpenInBuilder={openOnCanvas}
        onCancel={() => navigate({ kind: 'runs' })}
      />
    </ScrollRoute>
  );
};

const WorkflowSettingsScreen = () => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const navigate = useShellStore((state) => state.navigateWorkflow);

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing[4],
          paddingBottom: insets.bottom + theme.spacing[6],
          paddingHorizontal: theme.spacing[5],
          gap: theme.spacing[4],
        }}
      >
        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to workflows"
            onPress={() => navigate({ kind: 'list' })}
            className="px-1 py-1"
          >
            <Text className="text-sm text-primary">Back</Text>
          </Pressable>

          <View accessibilityRole="header" className="flex-1">
            <Text className="text-2xl font-bold text-text-primary">Workflow settings</Text>
            <Text className="text-xs text-text-secondary">Applies to Workflow Mode only</Text>
          </View>
        </View>

        {/* Capability state belongs in each mode's settings rather than on a tab of its own
            (issue A3). A workflow that will not run usually means a missing grant. */}
        <AutomationStatusPanel />

        <Card title="Coming in Step 6" muted>
          <Text className="text-xs leading-4 text-text-secondary">
            Default execution bounds, whether runs are recorded, and canvas preferences such as grid
            and snapping.
          </Text>
        </Card>

        <Card title="AI provider" muted>
          <Text className="text-xs leading-4 text-text-secondary">
            The provider is configured once in the app&apos;s main settings and shared with Agent
            Mode, so both use the same credentials.
          </Text>
        </Card>

        <ModeSettingsFooter mode="workflow" />
      </ScrollView>
    </View>
  );
};

/** The padded, scrolling container the mode's non-canvas routes share. */
const ScrollRoute = ({ children }: { readonly children: React.ReactNode }) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing[4],
          paddingBottom: insets.bottom + theme.spacing[6],
          paddingHorizontal: theme.spacing[5],
          gap: theme.spacing[4],
        }}
      >
        {children}
      </ScrollView>
    </View>
  );
};

/**
 * The header this mode's home uses.
 *
 * Deliberately not shared with Agent Mode. A shared header component is the first thing that
 * quietly re-couples two interfaces that are supposed to be able to diverge.
 */
const ModeHeader = ({
  title,
  subtitle,
  onOpenSettings,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly onOpenSettings: () => void;
}) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-row items-center gap-3 border-b border-border px-5 pb-3"
      style={{ paddingTop: insets.top + theme.spacing[3] }}
    >
      <View accessibilityRole="header" className="flex-1">
        <Text className="text-xl font-bold text-text-primary">{title}</Text>
        <Text className="text-xs text-text-secondary">{subtitle}</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Workflow settings"
        onPress={onOpenSettings}
        className="rounded-md border border-border px-3 py-2"
      >
        <Text className="text-xs font-medium text-text-secondary">Settings</Text>
      </Pressable>
    </View>
  );
};
