/**
 * `@mobile-automation/execution-recorder`
 *
 * Recording is a first-class subsystem, not an afterthought. Every tool the agent executes
 * is captured richly enough that the trace can be compiled into a durable, replayable
 * workflow.
 *
 * Three things here carry the weight:
 *
 * - **The recorder owns no capture logic.** The agent's `toolExecuted` event was built in
 *   Phase 7 carrying everything an `ExecutionStep` needs, so this package shapes and trims
 *   rather than collecting. Two places deciding what a step is would be one too many.
 * - **The generator is deterministic.** The trace already says exactly what happened;
 *   asking a model to restate it would introduce a chance of it saying something else.
 *   Model-assisted generation from a *goal* is a separate path.
 * - **Replay checking is pre-flight, not simulation.** Only a device can confirm a replay
 *   reproduces an outcome. Claiming otherwise would be worse than not checking, because the
 *   user would trust it.
 */

export const PACKAGE_NAME = '@mobile-automation/execution-recorder' as const;

/**
 * Fields captured for every recorded step. Storing the element and selector - not just
 * coordinates - is what makes replay survive layout changes (ADR 0009).
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
 * A step is only good enough to generate a workflow node from when it carries a selector
 * and the screen it belongs to. Coordinates alone are not enough.
 */
export const REQUIRED_FOR_GENERATION: readonly StepField[] = [
  'action',
  'selector',
  'package',
  'activity',
];

export const canGenerateWorkflowNode = (present: readonly StepField[]): boolean =>
  REQUIRED_FOR_GENERATION.every((field) => present.includes(field));

export {
  ExecutionStepSchema,
  ExecutionTraceSchema,
  OBSERVATION_TOOLS,
  RecordedSelectorSchema,
  ResolvedElementSchema,
  STEP_OUTCOMES,
  ScreenIdentitySchema,
  StepOutcomeSchema,
  TRACE_OUTCOMES,
  TraceOutcomeSchema,
  type ExecutionStep,
  type ExecutionTrace,
  type ResolvedElement,
  type ScreenIdentity,
  type StepOutcome,
  type TraceOutcome,
  isGeneratableStep,
  isObservationTool,
} from './schema';

export {
  ExecutionRecorder,
  MAX_RESULT_CHARS,
  MAX_TRACE_STEPS,
  type RunFinishedLike,
  type RunStartedLike,
  type ToolExecutedLike,
  describeScreenIdentity,
} from './recorder';

export {
  TOOL_TO_NODE,
  type GeneratedNodeOrigin,
  type GenerateOptions,
  type GenerationResult,
  durabilityOf,
  generateWorkflow,
} from './generator';

export {
  REPLAY_ISSUE_KINDS,
  type ReplayCheck,
  type ReplayIssue,
  type ReplayIssueKind,
  checkReplay,
  describeReplayCheck,
} from './replay';
