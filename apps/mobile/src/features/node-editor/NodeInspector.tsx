import { Badge, Button, Card, EmptyState } from '@mobile-automation/ui';
import { ScrollView, Text, View } from 'react-native';

import { useCanvasStore } from '../canvas/canvasStore';
import { useExecutionStore } from '../canvas/executionStore';
import { definitionFor } from '../canvas/registry';
import { useSelectionStore } from '../canvas/selectionStore';

import { SchemaForm } from './SchemaForm';

/**
 * The inspector: everything about the selected node.
 *
 * Subscribes to **one node** rather than the node map, so editing a config repaints this
 * panel and nothing else on the canvas (ADR 0003).
 *
 * Also where the Configure-with-AI entry point will live in Phase 8 - the button is present
 * and disabled, rather than absent, because a feature that appears from nowhere in a later
 * release is harder to find than one whose place is already visible.
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

      <Button
        label="Configure with AI"
        variant="secondary"
        disabled
        accessibilityLabel="Configure with AI, available in a later version"
      />
      <Text className="-mt-1 text-xs text-text-muted">
        Coming soon: describe what this step should do while looking at the app, and the AI fills in
        the configuration.
      </Text>

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
