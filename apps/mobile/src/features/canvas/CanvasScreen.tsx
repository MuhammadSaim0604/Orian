import { Badge, Button, useTheme } from '@mobile-automation/ui';
import { useCallback, useEffect, useState } from 'react';
import { type LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { NodeInspector } from '../node-editor/NodeInspector';
import { NodePalette } from '../node-editor/NodePalette';

import { CanvasScene } from './CanvasScene';
import { useCanvasStore } from './canvasStore';
import { ExecutionLog, VariablePanel } from './ExecutionLog';
import { useExecutionStore } from './executionStore';
import { portsByType } from './registry';
import { useSelectionStore } from './selectionStore';
import { useCamera } from './useCamera';
import { useCanvasInteraction, useTapToSelect } from './useCanvasInteraction';
import { useWorkflowRun } from './useWorkflowRun';

/**
 * The workflow builder.
 *
 * The composition matters as much as the parts. Gestures are ordered so the most specific
 * wins: a drag starting on a node moves the node, a drag on empty canvas moves the camera,
 * and a pinch always zooms. Getting that precedence wrong makes the canvas feel like it is
 * guessing.
 *
 * The bottom sheet is a single surface showing one panel at a time, because a phone has no
 * room for a persistent inspector beside the canvas - and a canvas squeezed into half the
 * screen is worse than one that is occasionally covered.
 */
export const CanvasScreen = () => {
  const { theme } = useTheme();

  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const dirty = useCanvasStore((state) => state.dirty);
  const setCamera = useCanvasStore((state) => state.setCamera);
  const storedCamera = useCanvasStore((state) => state.camera);

  const selectedNodeId = useSelectionStore((state) => state.selectedNodeId);
  const panel = useSelectionStore((state) => state.panel);
  const selectNode = useSelectionStore((state) => state.selectNode);
  const clearSelection = useSelectionStore((state) => state.clearSelection);
  const openPanel = useSelectionStore((state) => state.openPanel);
  const closePanel = useSelectionStore((state) => state.closePanel);

  const nodeStates = useExecutionStore((state) => state.nodeStates);

  const { running, loadIssues, run, stop } = useWorkflowRun();

  const camera = useCamera({ initial: storedCamera, onSettle: setCamera });

  const interaction = useCanvasInteraction({
    camera,
    portsByType,
    onSelectNode: selectNode,
  });

  const tap = useTapToSelect(camera, portsByType, selectNode, clearSelection);

  const nodeList = Object.values(nodes);
  const edgeList = Object.values(edges);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setViewport({ width, height });
  }, []);

  // Fit once, when a workflow first has both nodes and a measured viewport. A saved graph can
  // sit anywhere in world space, and opening to an empty viewport with the nodes off-screen
  // reads as a lost workflow.
  const [hasFitted, setHasFitted] = useState(false);

  useEffect(() => {
    if (hasFitted || nodeList.length === 0 || viewport.width === 0) return;

    camera.fitTo(nodeList, viewport.width, viewport.height);
    setHasFitted(true);
  }, [camera, hasFitted, nodeList, viewport.height, viewport.width]);

  /**
   * Node interaction is given priority over the camera pan, and the pinch runs alongside
   * both. Without the explicit ordering, Gesture Handler resolves the race by activation
   * order, which varies with where the finger lands.
   */
  const composed = Gesture.Simultaneous(
    Gesture.Exclusive(interaction.gesture, camera.gesture),
    tap,
  );

  // The dragged node is drawn at its live position rather than its committed one, so the node
  // follows the finger even though the store is only written on release.
  const displayNodes =
    interaction.draggingNodeId === null || interaction.dragPosition === null
      ? nodeList
      : nodeList.map((node) =>
          node.id === interaction.draggingNodeId
            ? { ...node, metadata: { ...node.metadata, position: interaction.dragPosition! } }
            : node,
        );

  return (
    <View className="flex-1">
      <View className="flex-row items-center gap-2 border-b border-border px-4 py-2">
        <Text className="flex-1 text-sm font-semibold text-text-primary" numberOfLines={1}>
          {useCanvasStore.getState().metadata.name}
        </Text>

        {dirty && <Badge label="unsaved" tone="warn" />}

        {running ? (
          <Button label="Stop" variant="danger" size="sm" onPress={stop} />
        ) : (
          <Button
            label="Run"
            size="sm"
            onPress={run}
            disabled={nodeList.length === 0}
            accessibilityLabel="Run this workflow"
          />
        )}
      </View>

      {loadIssues.length > 0 && (
        <View className="border-b border-danger bg-surface-muted px-4 py-2">
          <Text className="text-xs font-medium text-danger">This workflow cannot run yet:</Text>
          {loadIssues.slice(0, 4).map((issue) => (
            <Text key={issue} className="mt-0.5 text-xs text-text-secondary">
              • {issue}
            </Text>
          ))}
        </View>
      )}

      <View className="flex-1" onLayout={onLayout}>
        {viewport.width > 0 && (
          <GestureDetector gesture={composed}>
            <View className="flex-1" accessibilityLabel="Workflow canvas">
              <CanvasScene
                width={viewport.width}
                height={viewport.height}
                camera={camera.read()}
                nodes={displayNodes}
                edges={edgeList}
                portsByType={portsByType}
                selectedNodeId={selectedNodeId}
                nodeStates={nodeStates}
                theme={theme}
                pendingEdge={interaction.pendingEdge}
              />
            </View>
          </GestureDetector>
        )}

        {nodeList.length === 0 && (
          <View className="absolute inset-0 items-center justify-center px-8">
            <Text className="text-center text-sm text-text-secondary">
              An empty canvas. Add a step to begin, or describe what you want and let the AI build
              it.
            </Text>
          </View>
        )}

        <View className="absolute bottom-4 right-4 gap-2">
          <CanvasAction
            label="+"
            accessibilityLabel="Add a step"
            onPress={() => openPanel('palette')}
          />
          <CanvasAction
            label="⤢"
            accessibilityLabel="Fit the workflow on screen"
            onPress={() => camera.fitTo(nodeList, viewport.width, viewport.height)}
          />
          <CanvasAction
            label="≡"
            accessibilityLabel="Show the execution log"
            onPress={() => openPanel('logs')}
          />
        </View>
      </View>

      {panel !== 'none' && (
        <View
          className="border-t border-border bg-surface px-4 pb-4 pt-3"
          style={{ maxHeight: '55%' }}
        >
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-text-primary">{PANEL_TITLE[panel]}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close panel"
              onPress={closePanel}
              className="px-2 py-1"
            >
              <Text className="text-sm text-text-secondary">Close</Text>
            </Pressable>
          </View>

          {panel === 'palette' && <NodePalette viewport={viewport} />}
          {panel === 'inspector' && <NodeInspector />}
          {panel === 'logs' && <ExecutionLog />}
          {panel === 'variables' && <VariablePanel />}
        </View>
      )}
    </View>
  );
};

const PANEL_TITLE: Record<string, string> = {
  palette: 'Add a step',
  inspector: 'Step settings',
  logs: 'Execution log',
  variables: 'Variables',
};

/** A round canvas control. Large enough to hit without aiming. */
const CanvasAction = ({
  label,
  accessibilityLabel,
  onPress,
}: {
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    onPress={onPress}
    className="h-12 w-12 items-center justify-center rounded-full border border-border bg-surface"
  >
    <Text className="text-lg text-text-primary">{label}</Text>
  </Pressable>
);
