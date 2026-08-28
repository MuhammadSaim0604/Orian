import { type AnyNodeDefinition } from '@mobile-automation/node-sdk';
import { DEFAULT_EXECUTION_POLICY } from '@mobile-automation/workflow-schema';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useCanvasStore } from '../canvas/canvasStore';
import { paletteCategories } from '../canvas/registry';
import { useSelectionStore } from '../canvas/selectionStore';

/**
 * The node palette.
 *
 * Grouped by category rather than listed flat: there are twenty-eight node types, and a
 * single scrolling list of them is a wall the user has to read rather than a menu they can
 * scan.
 *
 * A new node is placed at a free spot in the current view rather than at a fixed point, so
 * adding three nodes in a row does not produce a stack the user must untangle before they
 * can see what they added.
 */

export interface NodePaletteProps {
  /** Needed to place the node where the user is actually looking. */
  readonly viewport: { readonly width: number; readonly height: number };
}

export const NodePalette = ({ viewport }: NodePaletteProps) => {
  const addNodeAt = useCanvasStore((state) => state.addNodeAt);
  const selectNode = useSelectionStore((state) => state.selectNode);

  const categories = paletteCategories();

  const add = (definition: AnyNodeDefinition) => {
    const id = addNodeAt(
      {
        type: definition.type,
        version: definition.version,
        // Seeded from the schema's defaults so the node is valid the moment it exists; an
        // empty config would make a brand-new node fail validation and show an error before
        // the user has done anything wrong.
        config: defaultConfigFor(definition),
        executionPolicy: definition.defaultExecutionPolicy
          ? { ...DEFAULT_EXECUTION_POLICY, ...definition.defaultExecutionPolicy }
          : DEFAULT_EXECUTION_POLICY,
        metadata: { label: definition.display.label },
      },
      viewport,
    );

    // Selecting it opens the inspector, which is almost always the next thing the user wants
    // after adding a step.
    selectNode(id);
  };

  return (
    <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 24 }}>
      {categories.map(({ category, nodes }) => (
        <View key={category} className="gap-2">
          <Text className="text-xs font-semibold uppercase text-text-muted">{category}</Text>

          <View className="gap-2">
            {nodes.map((definition) => (
              <Pressable
                key={definition.type}
                accessibilityRole="button"
                accessibilityLabel={`Add ${definition.display.label}. ${definition.display.description}`}
                onPress={() => add(definition)}
                className="rounded-lg border border-border bg-surface p-3"
              >
                <View className="flex-row items-center justify-between">
                  <Text className="flex-1 pr-2 text-sm font-medium text-text-primary">
                    {definition.display.label}
                  </Text>
                  {definition.requiresDevice === true && (
                    // Flagged because these are the steps that need the accessibility service,
                    // and knowing that before building a workflow beats finding out when it
                    // refuses to run.
                    <Text className="text-xs text-text-muted">device</Text>
                  )}
                </View>
                <Text className="mt-0.5 text-xs text-text-secondary">
                  {definition.display.description}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
};

/**
 * A config satisfying the schema's defaults, where it has any.
 *
 * Parsing an empty object yields defaults for every optional field with one, which is the
 * closest thing to "a sensible new node" the schema can provide. If required fields remain,
 * the empty object is kept and the inspector shows what still needs filling in.
 */
const defaultConfigFor = (definition: AnyNodeDefinition): unknown => {
  const parsed = definition.configSchema.safeParse({});
  return parsed.success ? parsed.data : {};
};
