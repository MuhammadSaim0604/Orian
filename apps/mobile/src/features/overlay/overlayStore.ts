import { type ToolName } from '@mobile-automation/tool-sdk';
import { create } from 'zustand';

import { type InspectedElement } from '../inspector/inspectScreen';

/**
 * The overlay's own state.
 *
 * A separate store from the canvas deliberately. The overlay runs in a **different React root**,
 * mounted into a `WindowManager` window, so it cannot share the app's component tree. What it
 * shares is the Zustand store module - imported by both roots, which is exactly how a store
 * outside React is supposed to work (ADR 0003).
 *
 * That means the config the overlay produces lands in the canvas store, and the node editor
 * updates itself with no navigation and no message passing.
 */

/** Which tool panel the overlay is showing. */
export const OVERLAY_TOOLS = [
  'node',
  'screen',
  'uiTree',
  'screenshot',
  'element',
  'coordinate',
  'test',
  'ask',
] as const;

export type OverlayTool = (typeof OVERLAY_TOOLS)[number];

/** The four tools worth showing before the eye toggle is pressed. */
export const COMPACT_TOOLS: readonly OverlayTool[] = ['ask', 'element', 'screen', 'node'];

export type ScreenReading = {
  readonly packageName: string | null;
  readonly activityName: string | null;
  readonly elements: readonly InspectedElement[];
  readonly capturedAtEpochMs: number;
  /** Set when the tree's schema version is one this build cannot read. */
  readonly schemaMismatch: number | null;
};

export type TestOutcome = {
  readonly tool: ToolName;
  readonly succeeded: boolean;
  readonly detail: string;
  readonly at: number;
};

export type OverlayState = {
  /** The node being configured. Set from the native initial prop, never guessed. */
  readonly nodeId: string | null;
  readonly expanded: boolean;
  readonly activeTool: OverlayTool;

  /** The last screen read. Held rather than re-read, since reading is a device round trip. */
  readonly reading: ScreenReading | null;
  readonly readingError: string | null;
  readonly busy: boolean;

  readonly screenshotPath: string | null;

  /** The element the user picked, which is what a selector-shaped config should use. */
  readonly selectedElement: InspectedElement | null;
  /** A coordinate the user tapped, for the coordinate inspector. */
  readonly probedPoint: { readonly x: number; readonly y: number } | null;

  /** The result of Test Action, shown before anything is committed. */
  readonly lastTest: TestOutcome | null;

  /** What the AI produced, awaiting the user's acceptance. */
  readonly proposal: {
    readonly config: unknown;
    readonly summary: string;
  } | null;
  readonly proposalError: string | null;
  readonly asking: boolean;
};

export type OverlayActions = {
  bind: (nodeId: string) => void;
  setExpanded: (expanded: boolean) => void;
  selectTool: (tool: OverlayTool) => void;

  setBusy: (busy: boolean) => void;
  setReading: (reading: ScreenReading) => void;
  setReadingError: (message: string | null) => void;
  setScreenshotPath: (path: string | null) => void;

  selectElement: (element: InspectedElement | null) => void;
  probePoint: (point: { x: number; y: number } | null) => void;

  setTestOutcome: (outcome: TestOutcome | null) => void;

  setAsking: (asking: boolean) => void;
  setProposal: (config: unknown, summary: string) => void;
  setProposalError: (message: string | null) => void;
  clearProposal: () => void;

  reset: () => void;
};

const initialState = (): OverlayState => ({
  nodeId: null,
  expanded: false,
  activeTool: 'ask',
  reading: null,
  readingError: null,
  busy: false,
  screenshotPath: null,
  selectedElement: null,
  probedPoint: null,
  lastTest: null,
  proposal: null,
  proposalError: null,
  asking: false,
});

export const useOverlayStore = create<OverlayState & OverlayActions>((set) => ({
  ...initialState(),

  bind: (nodeId) =>
    set((state) =>
      // Rebinding the same node is a no-op, so a re-render or a remount does not discard the
      // screen reading and proposal the user has been working with. Only a *different* node
      // resets, because carrying a proposal across would let it be accepted on the wrong step.
      state.nodeId === nodeId ? state : { ...initialState(), nodeId },
    ),

  setExpanded: (expanded) => set({ expanded }),

  selectTool: (tool) =>
    set((state) => ({
      activeTool: tool,
      // Expanding is implied by choosing a tool the compact layout does not show, rather than
      // making the user press the eye toggle first.
      expanded: state.expanded || !COMPACT_TOOLS.includes(tool),
    })),

  setBusy: (busy) => set({ busy }),

  setReading: (reading) => set({ reading, readingError: null, busy: false }),

  setReadingError: (message) => set({ readingError: message, busy: false }),

  setScreenshotPath: (path) => set({ screenshotPath: path }),

  selectElement: (element) =>
    // Choosing an element clears a probed coordinate: they are alternative answers to the same
    // question, and keeping both would leave the config ambiguous.
    set({ selectedElement: element, probedPoint: null }),

  probePoint: (point) => set({ probedPoint: point, selectedElement: null }),

  setTestOutcome: (outcome) => set({ lastTest: outcome }),

  setAsking: (asking) => set({ asking }),

  setProposal: (config, summary) =>
    set({ proposal: { config, summary }, proposalError: null, asking: false }),

  setProposalError: (message) => set({ proposalError: message, asking: false }),

  clearProposal: () => set({ proposal: null, proposalError: null }),

  reset: () => set(initialState()),
}));

/** Narrow selectors, so a tool panel does not re-render when an unrelated field changes. */
export const selectActiveTool = (state: OverlayState): OverlayTool => state.activeTool;

export const selectHasProposal = (state: OverlayState): boolean => state.proposal !== null;

/**
 * Tools visible in the current layout.
 *
 * The compact set is a fixed four rather than the first four of the full list, because the four
 * that matter are Ask, Element, Screen, and Node - not whichever happen to be declared first.
 */
export const visibleTools = (expanded: boolean): readonly OverlayTool[] =>
  expanded ? OVERLAY_TOOLS : COMPACT_TOOLS;
