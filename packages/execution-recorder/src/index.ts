/**
 * `@mobile-automation/execution-recorder`
 *
 * Recording is a first-class subsystem, not an afterthought. Every tool the
 * agent executes is captured richly enough that the trace can be compiled into
 * a durable, replayable workflow.
 *
 * Phase 1 scaffold - capture and the workflow generator are built in Phase 9.
 */

export const PACKAGE_NAME = '@mobile-automation/execution-recorder' as const;

/**
 * Fields captured for every recorded step. Storing the element and selector -
 * not just coordinates - is what makes replay survive layout changes
 * (ADR 0009).
 */
export const STEP_FIELDS = [
  'screenshot',
  'uiHierarchy',
  'package',
  'activity',
  'action',
  'coordinates',
  'nodeId',
  'selectedElement',
  'selector',
  'timestamp',
  'result',
] as const;

export type StepField = (typeof STEP_FIELDS)[number];

/**
 * A step is only good enough to generate a workflow node from when it carries
 * a selector and the screen it belongs to. Coordinates alone are not enough.
 */
export const REQUIRED_FOR_GENERATION: readonly StepField[] = [
  'action',
  'selector',
  'package',
  'activity',
];

export const canGenerateWorkflowNode = (present: readonly StepField[]): boolean =>
  REQUIRED_FOR_GENERATION.every((field) => present.includes(field));
