import { invokeTool } from '@mobile-automation/native-automation';
import {
  UI_TREE_SCHEMA_VERSION,
  centreOf,
  isSupportedSchemaVersion,
  isTappable,
} from '@mobile-automation/screen-inspector';
import { type Selector } from '@mobile-automation/workflow-schema';

/**
 * Reading the live screen for the inspector.
 *
 * `screen-inspector` owns the attribute contract; this turns a captured tree into a flat list
 * the UI can render and, crucially, into a **selector** for each element.
 *
 * The selector is the point of the whole screen inspector. A user picking an element should get
 * something durable - a resourceId where one exists - rather than the coordinates they happened
 * to tap. Coordinates are included only as a last resort, and the UI says so (ADR 0009).
 */

export type InspectedElement = {
  readonly id: string;
  readonly depth: number;
  readonly text: string | null;
  readonly resourceId: string | null;
  readonly contentDescription: string | null;
  readonly className: string | null;
  readonly bounds: { left: number; top: number; right: number; bottom: number } | null;
  readonly clickable: boolean;
  readonly editable: boolean;
  readonly scrollable: boolean;
  /** The best selector for this element, and how durable it is. */
  readonly selector: Selector;
  readonly strategy: 'resourceId' | 'accessibility' | 'text' | 'structural' | 'coordinates';
};

export type InspectedScreen = {
  readonly packageName: string | null;
  readonly activityName: string | null;
  readonly capturedAtEpochMs: number;
  readonly elements: readonly InspectedElement[];
  /** Set when the tree is a version this build cannot read. */
  readonly schemaMismatch: number | null;
};

type RawNode = {
  text?: string;
  resourceId?: string;
  className?: string;
  contentDescription?: string;
  bounds?: { left: number; top: number; right: number; bottom: number };
  clickable?: boolean;
  editable?: boolean;
  scrollable?: boolean;
  children?: RawNode[];
};

/** Captures and flattens the current screen. */
export const inspectScreen = async (): Promise<InspectedScreen> => {
  const tree = (await invokeTool('getUiTree', { compact: false })) as {
    schemaVersion?: number;
    packageName?: string;
    activityName?: string;
    capturedAtEpochMs?: number;
    root?: RawNode;
  };

  const schemaVersion = tree.schemaVersion ?? UI_TREE_SCHEMA_VERSION;

  // Refused rather than partially read. Misreading a tree would show the user elements that are
  // not there and produce selectors that match nothing (the same rule `screen-inspector`
  // states).
  if (!isSupportedSchemaVersion(schemaVersion)) {
    return {
      packageName: tree.packageName ?? null,
      activityName: tree.activityName ?? null,
      capturedAtEpochMs: tree.capturedAtEpochMs ?? Date.now(),
      elements: [],
      schemaMismatch: schemaVersion,
    };
  }

  const elements: InspectedElement[] = [];

  const visit = (node: RawNode, depth: number, path: string): void => {
    // Only elements a person could plausibly target. A full tree is mostly layout containers,
    // and listing them buries the twelve things that matter under two hundred that do not.
    if (isInteresting(node)) {
      const { selector, strategy } = bestSelector(node, path);

      elements.push({
        id: path,
        depth,
        text: node.text ?? null,
        resourceId: node.resourceId ?? null,
        contentDescription: node.contentDescription ?? null,
        className: node.className ?? null,
        bounds: node.bounds ?? null,
        clickable: node.clickable === true,
        editable: node.editable === true,
        scrollable: node.scrollable === true,
        selector,
        strategy,
      });
    }

    for (const [index, child] of (node.children ?? []).entries()) {
      visit(child, depth + 1, `${path}.${index}`);
    }
  };

  if (tree.root !== undefined) visit(tree.root, 0, '0');

  return {
    packageName: tree.packageName ?? null,
    activityName: tree.activityName ?? null,
    capturedAtEpochMs: tree.capturedAtEpochMs ?? Date.now(),
    elements,
    schemaMismatch: null,
  };
};

/**
 * Whether an element is worth showing.
 *
 * Anything actionable, or anything with text or a label - which covers what a user would point
 * at. A zero-area element is excluded even when it claims to be clickable, because it cannot be
 * tapped.
 */
const isInteresting = (node: RawNode): boolean => {
  if (node.bounds !== undefined && !isTappable(node.bounds)) return false;

  return (
    node.clickable === true ||
    node.editable === true ||
    node.scrollable === true ||
    (node.text !== undefined && node.text !== '') ||
    (node.contentDescription !== undefined && node.contentDescription !== '')
  );
};

/**
 * The most durable selector for an element.
 *
 * The order mirrors the Kotlin resolver's priority chain, so what the inspector offers is what
 * the resolver will actually try first. Any other order would hand the user a selector the
 * device resolves by a different route than they expect.
 */
const bestSelector = (
  node: RawNode,
  path: string,
): { selector: Selector; strategy: InspectedElement['strategy'] } => {
  if (node.resourceId !== undefined && node.resourceId !== '') {
    return { selector: { resourceId: node.resourceId }, strategy: 'resourceId' };
  }

  if (node.contentDescription !== undefined && node.contentDescription !== '') {
    return {
      selector: { contentDescription: node.contentDescription },
      strategy: 'accessibility',
    };
  }

  if (node.text !== undefined && node.text !== '') {
    return { selector: { text: node.text }, strategy: 'text' };
  }

  // A structural path is fragile but still better than coordinates: it survives the app being
  // moved on screen, which coordinates do not.
  if (node.className !== undefined) {
    return {
      selector: { structuralPath: path, className: node.className },
      strategy: 'structural',
    };
  }

  const centre = node.bounds === undefined ? { x: 0, y: 0 } : centreOf(node.bounds);

  return { selector: { coordinates: centre }, strategy: 'coordinates' };
};

/** Plain-language durability, so the user can see what they are choosing. */
export const strategyDescription = (strategy: InspectedElement['strategy']): string => {
  switch (strategy) {
    case 'resourceId':
      return 'Reliable — matched by the app’s own id';
    case 'accessibility':
      return 'Reliable — matched by accessibility label';
    case 'text':
      return 'May break if the app is translated';
    case 'structural':
      return 'May break if the app’s layout changes';
    case 'coordinates':
      return 'Fragile — matched by screen position';
  }
};
