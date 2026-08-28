import { Badge, Button, Card, EmptyState } from '@mobile-automation/ui';
import { ScrollView, Text, View } from 'react-native';

import { useCanvasStore } from '../canvas/canvasStore';
import { useExecutionStore } from '../canvas/executionStore';
import { definitionFor } from '../canvas/registry';
import { useSelectionStore } from '../canvas/selectionStore';
import { useOverlayLauncher } from '../overlay/useOverlayLauncher';

import { SchemaForm } from './SchemaForm';

/**
 * The inspector: everything about the selected node.
 *
 * Subscribes to **one node** rather than the node map, so editing a config repaints this
 * panel and nothing else on the canvas (ADR 0003).
 *
 * Also where Configure-with-AI starts. That button opens a real floating window rather than a
 * modal, because the whole point is to keep the toolset visible while the user switches to the app
 * they are configuring against.
 */
export const NodeInspector = () => {
  const selectedNodeId = useSelectionStore((state) => state.selectedNodeId);

  const node = useCanvasStore((state) =>
    selectedNodeId === null ? undefined : state.nodes[selectedNodeId],
  );

  const updateNodeConfig = useCanvasStore((state) => state.updateNodeConfig);
  const removeNode = useCanvasStore((state) => state.removeNode);
  const clearSelection = useSelectionStore((state) => state.clearSelection);

  const nodeState = useExecutionStore((state) =>
    selectedNodeId === null ? undefined : state.nodeStates[selectedNodeId],
  );

  const overlay = useOverlayLauncher();

  if (selectedNodeId === null || node === undefined) {
    return (
      <EmptyState title="No step selected" detail="Tap a step on the canvas to configure it." />
    );
  }

  const definition = definitionFor(node.type);

  if (definition === undefined) {
    // A workflow can name a node type from a package that has since been removed. Saying so
    // is far better than an empty panel, and the node is still deletable.
    return (
      <View className="gap-3">
        <Card title={node.metadata.label} subtitle={node.type}>
          <Text className="text-sm text-danger">
            This step&apos;s type is not installed, so it cannot be configured or run.
          </Text>
        </Card>
        <Button
          label="Delete step"
          variant="danger"
          onPress={() => {
            removeNode(selectedNodeId);
            clearSelection();
          }}
        />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
      <Card
        title={definition.display.label}
        subtitle={definition.display.description}
        trailing={
          nodeState === undefined ? null : (
            <Badge
              label={nodeState}
              tone={
                nodeState === 'succeeded'
                  ? 'good'
                  : nodeState === 'failed'
                    ? 'bad'
                    : nodeState === 'running'
                      ? 'warn'
                      : 'neutral'
              }
            />
          )
        }
      >
        <SchemaForm
          schema={definition.configSchema}
          value={node.config}
          onChange={(config) => updateNodeConfig(selectedNodeId, config)}
        />
      </Card>

      {overlay.available && (
        <View className="gap-2">
          {overlay.showing ? (
            <Button
              label="Close the floating toolset"
              variant="secondary"
              onPress={overlay.close}
            />
          ) : (
            <Button
              label="Configure with AI"
              variant="secondary"
              onPress={() => overlay.open(selectedNodeId)}
              accessibilityLabel="Open the floating toolset to configure this step with AI"
            />
          )}

          <Text className="text-xs text-text-muted">
            {overlay.showing
              ? 'Switch to the app you want to automate — the toolset stays on top.'
              : 'Opens a small floating panel that stays visible while you switch to another app, so the AI can see the screen you are configuring against.'}
          </Text>

          {overlay.error != null && <Text className="text-xs text-danger">{overlay.error}</Text>}

          {overlay.needsPermission && (
            // There is no runtime prompt for this permission; Settings is the only route.
            <Button label="Open Android settings" size="sm" onPress={overlay.openSettings} />
          )}
        </View>
      )}

      <Button
        label="Delete step"
        variant="danger"
        onPress={() => {
          removeNode(selectedNodeId);
          clearSelection();
        }}
      />
    </ScrollView>
  );
};
