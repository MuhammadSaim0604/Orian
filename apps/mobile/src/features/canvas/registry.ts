import { androidNodes } from '@mobile-automation/android-nodes';
import { coreNodes } from '@mobile-automation/core-nodes';
import { type AnyNodeDefinition, NodeRegistry } from '@mobile-automation/node-sdk';
import { registerBuiltInNodes } from '@mobile-automation/workflow-engine';

/**
 * The app's node registry.
 *
 * Built once at module load. A registry per screen would mean the palette and the executor
 * could disagree about which node types exist, and a workflow that built fine would then
 * fail to run.
 *
 * Third-party discovery (`discoverNodePackages`) plugs in here when the app grows a package
 * manager screen; the registry is already the right shape for it.
 */

const registry = new NodeRegistry();

registerBuiltInNodes(registry, [
  { name: '@mobile-automation/core-nodes', nodes: coreNodes },
  { name: '@mobile-automation/android-nodes', nodes: androidNodes },
]);

export const nodeRegistry = registry;

/**
 * Port handles per node type.
 *
 * Precomputed because the canvas needs it on every frame to resolve edge endpoints, and
 * walking the registry per edge per frame would show up as jank on a large graph.
 */
export const portsByType = new Map(
  registry.all().map((definition) => [
    definition.type,
    {
      outputs: definition.outputs.map((port) => port.handle),
      inputs: definition.inputs.map((port) => port.handle),
    },
  ]),
);

/** Definitions grouped for the palette. A flat list of 28 nodes is unusable on a phone. */
export const paletteCategories = (): readonly {
  readonly category: string;
  readonly nodes: readonly AnyNodeDefinition[];
}[] => {
  const grouped = registry.byCategory();

  return (
    [...grouped.entries()]
      .map(([category, nodes]) => ({ category, nodes }))
      // Flow and Logic first: a workflow starts with a trigger, and burying it under an
      // alphabetical list of device actions hides the thing every workflow needs.
      .sort((a, b) => categoryRank(a.category) - categoryRank(b.category))
  );
};

const CATEGORY_ORDER = ['Flow', 'Logic', 'Data', 'Device', 'Device data', 'Advanced'];

const categoryRank = (category: string): number => {
  const index = CATEGORY_ORDER.indexOf(category);
  // An unknown category - from a third-party package - sorts after the known ones rather
  // than being dropped or jumbled among them.
  return index === -1 ? CATEGORY_ORDER.length : index;
};

export const definitionFor = (type: string): AnyNodeDefinition | undefined => registry.find(type);
