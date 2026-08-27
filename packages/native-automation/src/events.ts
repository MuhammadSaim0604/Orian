import { type Screenshot, type UiTree } from './types';

/**
 * Events the native layer streams to JS.
 *
 * Streaming exists for the two cases where polling is wrong: watching the screen
 * change while the user demonstrates something (Phase 9's recorder), and
 * reporting progress during a long agent run so the UI is not frozen until it
 * finishes.
 */
export const AUTOMATION_EVENTS = [
  'automationUiTreeChanged',
  'automationExecutionProgress',
  'automationStatusChanged',
] as const;

export type AutomationEventName = (typeof AUTOMATION_EVENTS)[number];

/**
 * The screen changed.
 *
 * Carries the tree because the consumer almost always wants it, and a second
 * round trip to fetch it would race the next change.
 */
export type UiTreeChangedEvent = {
  tree: UiTree;
  /** What triggered the emission, for the recorder's benefit. */
  reason: 'window_changed' | 'content_changed';
};

/** Stage of a running step. Mirrors the workflow engine's node lifecycle. */
export const EXECUTION_PHASES = ['started', 'progress', 'succeeded', 'failed'] as const;

export type ExecutionPhase = (typeof EXECUTION_PHASES)[number];

/**
 * Progress of a single automation step.
 *
 * `nodeId` is optional because the same channel serves both engines: a workflow
 * step has a node id, an agent step does not.
 */
export type ExecutionProgressEvent = {
  phase: ExecutionPhase;
  /** Tool being run, e.g. `click`. */
  tool: string;
  nodeId?: string;
  /** Human-readable line for the execution log. */
  message?: string;
  /** Present on `failed`: the Kotlin error code. */
  errorCode?: string;
  /** Screenshot captured for this step, when the recorder is active. */
  screenshot?: Screenshot;
  timestampEpochMs: number;
};

/**
 * Automation availability changed - typically the user revoking the accessibility
 * grant or stopping screen capture from the notification.
 *
 * Pushed rather than polled so a running workflow can abort promptly instead of
 * failing on its next step.
 */
export type AutomationStatusChangedEvent = {
  isReady: boolean;
  canCaptureScreen: boolean;
  canDrawOverlay: boolean;
};

/** Maps each event name to its payload, so subscribing is type-safe. */
export type AutomationEventMap = {
  automationUiTreeChanged: UiTreeChangedEvent;
  automationExecutionProgress: ExecutionProgressEvent;
  automationStatusChanged: AutomationStatusChangedEvent;
};

export const isAutomationEventName = (value: string): value is AutomationEventName =>
  (AUTOMATION_EVENTS as readonly string[]).includes(value);
