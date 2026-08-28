import {
  DEFAULT_EXECUTION_POLICY,
  type Edge,
  type Workflow,
  type WorkflowNode,
} from '@mobile-automation/workflow-schema';
import { create } from 'zustand';

import { type Camera, IDENTITY_CAMERA, freePosition, snapToGrid } from './geometry';

/**
 * The canvas store: the working copy of the workflow being edited.
 *
 * Normalized as keyed maps rather than arrays (ADR 0003). An array means every node move
 * rewrites the whole list and every subscriber repaints; a map means one entry changes and
 * only the node bound to it re-renders. On a graph of thirty nodes that is the difference
 * between a smooth drag and a stuttering one.
 *
 * The store holds the **working copy only**. The persisted copy lives in SQLite, so an
 * unsaved edit is never silently durable and a reload always shows what was actually saved.
 */

export type NodesById = Readonly<Record<string, WorkflowNode>>;
export type EdgesById = Readonly<Record<string, Edge>>;

/**
 * A node about to be added.
 *
 * The id and position are assigned by the store - the id so it is unique, the position so it
 * lands somewhere the user is looking. Everything else the caller supplies.
 */
export type NewNode = {
  readonly type: string;
  readonly version?: string;
  readonly config?: unknown;
  readonly executionPolicy?: WorkflowNode['executionPolicy'];
  readonly metadata: Omit<WorkflowNode['metadata'], 'position'>;
};

export type CanvasState = {
  readonly workflowId: string;
  readonly metadata: Workflow['metadata'];
  readonly variables: Workflow['variables'];
  readonly nodes: NodesById;
  readonly edges: EdgesById;

  /**
   * Committed camera position.
   *
   * The live camera during a gesture lives in Reanimated shared values on the UI thread;
   * this is only what it settled on. Writing every frame here would put a store update and
   * a React render between the finger and the pixels (ADR 0003).
   */
  readonly camera: Camera;

  /** Whether the working copy differs from what was saved. */
  readonly dirty: boolean;

  readonly snapEnabled: boolean;
};

export type CanvasActions = {
  /** Replaces everything, for opening a saved or generated workflow. */
  load: (workflow: Workflow) => void;
  reset: () => void;

  addNode: (node: WorkflowNode) => void;
  /** Adds a node at a free spot in the current view. */
  addNodeAt: (node: NewNode, viewport: { width: number; height: number }) => string;
  moveNode: (nodeId: string, x: number, y: number) => void;
  updateNodeConfig: (nodeId: string, config: unknown) => void;
  renameNode: (nodeId: string, label: string) => void;
  removeNode: (nodeId: string) => void;

  connect: (edge: Omit<Edge, 'id'>) => string | null;
  removeEdge: (edgeId: string) => void;

  setCamera: (camera: Camera) => void;
  setSnapEnabled: (enabled: boolean) => void;

  /** The workflow document, for validation, execution, or saving. */
  toWorkflow: () => Workflow;
  markSaved: () => void;
};

export type CanvasStore = CanvasState & CanvasActions;

const now = () => new Date().toISOString();

const emptyMetadata = (): Workflow['metadata'] => ({
  name: 'Untitled workflow',
  createdAt: now(),
  updatedAt: now(),
  version: 1,
  source: 'manual',
});

const initialState = (): CanvasState => ({
  workflowId: `wf_${Date.now().toString(36)}`,
  metadata: emptyMetadata(),
  variables: [],
  nodes: {},
  edges: {},
  camera: IDENTITY_CAMERA,
  dirty: false,
  snapEnabled: true,
});

let idCounter = 0;

/**
 * Ids for nodes and edges.
 *
 * Prefixed with the node type so a workflow's JSON is readable and a failing step names
 * something recognisable. The counter guards against two ids in the same millisecond, which
 * dropping three nodes quickly will otherwise produce.
 */
const nextId = (prefix: string): string => {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}`;
};

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  ...initialState(),

  load: (workflow) =>
    set({
      workflowId: workflow.id,
      metadata: workflow.metadata,
      variables: workflow.variables,
      nodes: Object.fromEntries(workflow.nodes.map((node) => [node.id, node])),
      edges: Object.fromEntries(workflow.edges.map((edge) => [edge.id, edge])),
      // Camera is deliberately not restored from the document: position is a view concern,
      // and the canvas fits the graph on open instead.
      camera: IDENTITY_CAMERA,
      dirty: false,
    }),

  reset: () => set(initialState()),

  addNode: (node) => set((state) => ({ nodes: { ...state.nodes, [node.id]: node }, dirty: true })),

  addNodeAt: (node, viewport) => {
    const state = get();
    const id = nextId(node.type);

    const position = freePosition(
      Object.values(state.nodes),
      state.camera,
      viewport.width,
      viewport.height,
    );

    set({
      nodes: {
        ...state.nodes,
        [id]: {
          id,
          type: node.type,
          version: node.version ?? '1.0.0',
          config: node.config ?? {},
          metadata: { ...node.metadata, position },
          executionPolicy: node.executionPolicy ?? DEFAULT_EXECUTION_POLICY,
        },
      },
      dirty: true,
    });

    return id;
  },

  moveNode: (nodeId, x, y) =>
    set((state) => {
      const node = state.nodes[nodeId];
      if (node === undefined) return state;

      const position = snapToGrid({ x, y }, state.snapEnabled);

      return {
        nodes: {
          ...state.nodes,
          [nodeId]: { ...node, metadata: { ...node.metadata, position } },
        },
        dirty: true,
      };
    }),

  updateNodeConfig: (nodeId, config) =>
    set((state) => {
      const node = state.nodes[nodeId];
      if (node === undefined) return state;

      return { nodes: { ...state.nodes, [nodeId]: { ...node, config } }, dirty: true };
    }),

  renameNode: (nodeId, label) =>
    set((state) => {
      const node = state.nodes[nodeId];
      if (node === undefined) return state;

      return {
        nodes: { ...state.nodes, [nodeId]: { ...node, metadata: { ...node.metadata, label } } },
        dirty: true,
      };
    }),

  removeNode: (nodeId) =>
    set((state) => {
      const nodes = { ...state.nodes };
      delete nodes[nodeId];

      // Edges touching the node go with it. Leaving them would produce a workflow that
      // fails to load with a dangling-edge error the user cannot see on the canvas.
      const edges = Object.fromEntries(
        Object.entries(state.edges).filter(
          ([, edge]) => edge.source !== nodeId && edge.target !== nodeId,
        ),
      );

      return { nodes, edges, dirty: true };
    }),

  connect: (edge) => {
    const state = get();

    if (state.nodes[edge.source] === undefined || state.nodes[edge.target] === undefined) {
      return null;
    }

    // A self-loop would be a cycle the loader rejects, so it is refused at the point of
    // drawing rather than at the point of running.
    if (edge.source === edge.target) return null;

    const duplicate = Object.values(state.edges).some(
      (existing) =>
        existing.source === edge.source &&
        existing.sourceHandle === edge.sourceHandle &&
        existing.target === edge.target &&
        existing.targetHandle === edge.targetHandle,
    );

    if (duplicate) return null;

    // One edge per output handle. The executor follows the first edge from a handle, so a
    // second would be drawn but never taken - a silently dead connection is worse than a
    // refused one.
    const replaced = Object.entries(state.edges).filter(
      ([, existing]) =>
        !(existing.source === edge.source && existing.sourceHandle === edge.sourceHandle),
    );

    const id = nextId('e');

    set({
      edges: { ...Object.fromEntries(replaced), [id]: { ...edge, id } },
      dirty: true,
    });

    return id;
  },

  removeEdge: (edgeId) =>
    set((state) => {
      const edges = { ...state.edges };
      delete edges[edgeId];
      return { edges, dirty: true };
    }),

  setCamera: (camera) => set({ camera }),

  setSnapEnabled: (enabled) => set({ snapEnabled: enabled }),

  toWorkflow: () => {
    const state = get();

    return {
      id: state.workflowId,
      metadata: { ...state.metadata, updatedAt: now() },
      variables: state.variables,
      nodes: Object.values(state.nodes),
      edges: Object.values(state.edges),
    } as Workflow;
  },

  markSaved: () => set({ dirty: false }),
}));

/**
 * Narrow selectors.
 *
 * Exported as named functions so a component subscribes to one node rather than to the
 * whole map. `useCanvasStore((s) => s.nodes)` would re-render every node on any change,
 * which is exactly what the normalized shape exists to avoid (ADR 0003).
 */
export const selectNode = (nodeId: string) => (state: CanvasStore) => state.nodes[nodeId];

export const selectNodeIds = (state: CanvasStore): readonly string[] => Object.keys(state.nodes);

export const selectEdgeIds = (state: CanvasStore): readonly string[] => Object.keys(state.edges);

export const selectNodeCount = (state: CanvasStore): number => Object.keys(state.nodes).length;

export const selectIsDirty = (state: CanvasStore): boolean => state.dirty;
