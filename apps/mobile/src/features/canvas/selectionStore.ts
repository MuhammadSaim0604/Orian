import { create } from 'zustand';

/**
 * Selection, kept in its own store.
 *
 * Separate from the canvas store because selection changes far more often than the graph -
 * every tap - and a component that only cares whether it is selected should not re-render
 * when a node's config changes. One store per domain (ADR 0003).
 */

export type SelectionState = {
  readonly selectedNodeId: string | null;
  readonly selectedEdgeId: string | null;
  /** Which panel the bottom sheet is showing, if any. */
  readonly panel: 'none' | 'palette' | 'inspector' | 'logs' | 'variables';
};

export type SelectionActions = {
  selectNode: (nodeId: string) => void;
  selectEdge: (edgeId: string) => void;
  clearSelection: () => void;
  openPanel: (panel: SelectionState['panel']) => void;
  closePanel: () => void;
};

export const useSelectionStore = create<SelectionState & SelectionActions>((set) => ({
  selectedNodeId: null,
  selectedEdgeId: null,
  panel: 'none',

  selectNode: (nodeId) =>
    // Selecting a node opens the inspector, because on a phone the two are the same
    // intention: there is no room for a persistent side panel, so a tap that selected
    // without revealing anything would look like nothing happened.
    set({ selectedNodeId: nodeId, selectedEdgeId: null, panel: 'inspector' }),

  selectEdge: (edgeId) => set({ selectedEdgeId: edgeId, selectedNodeId: null, panel: 'none' }),

  clearSelection: () =>
    set((state) => ({
      selectedNodeId: null,
      selectedEdgeId: null,
      // The inspector has nothing to show without a selection, but the palette and logs
      // are not about a node and should survive a tap on empty canvas.
      panel: state.panel === 'inspector' ? 'none' : state.panel,
    })),

  openPanel: (panel) => set({ panel }),

  closePanel: () => set({ panel: 'none' }),
}));

/** True when this specific node is selected. The narrow selector a node component wants. */
export const selectIsNodeSelected =
  (nodeId: string) =>
  (state: SelectionState): boolean =>
    state.selectedNodeId === nodeId;
