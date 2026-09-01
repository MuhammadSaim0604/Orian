/**
 * `@mobile-automation/ai-agent`
 *
 * The autonomous agent: takes a natural-language goal and drives the device by calling
 * tools on the shared Android Tool Runtime. Separate from the workflow engine, speaking
 * the identical tool vocabulary (ADR 0008) - the agent's non-determinism must never
 * leak into deterministic workflow execution.
 *
 * Three things here are load-bearing:
 *
 * - **The loop is always bounded.** Four independent stops - step ceiling, wall-clock
 *   deadline, stuck detection, cancellation - because a confused model driving someone's
 *   phone is the worst failure this product can have.
 * - **Every tool call is validated before execution.** A call that fails validation is
 *   never run; it is fed back as a correction.
 * - **`toolExecuted` is the recorder seam.** It carries everything Phase 9 needs to
 *   compile a run into a replayable workflow, so that phase never has to reopen the loop.
 */

export const PACKAGE_NAME = '@mobile-automation/ai-agent' as const;

/** The agent loop, in order. */
export const AGENT_PHASES = ['plan', 'observe', 'chooseTool', 'execute', 'replan', 'done'] as const;

export type AgentPhase = (typeof AGENT_PHASES)[number];

export const AGENT_STATUSES = ['planning', 'acting', 'replanning', 'done', 'failed'] as const;

export type AgentStatus = (typeof AGENT_STATUSES)[number];

export {
  AGENT_EVENT_TYPES,
  AgentEventBus,
  RUN_OUTCOMES,
  type AgentEvent,
  type AgentEventListener,
  type AgentEventType,
  type ObservedEvent,
  type PlannedEvent,
  type ReplanningEvent,
  type RunFinishedEvent,
  type RunOutcome,
  type RunStartedEvent,
  type ThinkingEvent,
  type ToolCallProposedEvent,
  type ToolCallRejectedEvent,
  type ToolExecutedEvent,
  toolExecutedEvent,
} from './events';

export {
  DEFAULT_DEADLINE_MS,
  MAX_AGENT_STEPS,
  MAX_CONSECUTIVE_REJECTIONS,
  type AgentDependencies,
  type AgentRunOptions,
  type AgentRunResult,
  type DeviceTools,
  runAgent,
} from './loop';

export {
  AgentMemory,
  FAILURES_BEFORE_REPLAN,
  MAX_REPLANS,
  REPEATS_BEFORE_STUCK,
  STEPS_ON_SCREEN_BEFORE_STUCK,
  type MemorySnapshot,
  type MemoryStep,
  describeScreen,
} from './memory';

export {
  PLAN_ACTION_THRESHOLD,
  PLAN_SENTENCE_THRESHOLD,
  PLAN_WORD_THRESHOLD,
  type PlanningDecision,
  decidePlanning,
  isQuestionOnly,
  needsPlan,
} from './planning';

export {
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_TEMPERATURE,
  PROVIDER_ERROR_KINDS,
  ProviderError,
  type CompletionRequest,
  type CompletionResponse,
  type ModelProvider,
  type ProviderConfig,
  type ProviderDependencies,
  type ProviderErrorKind,
  type ProviderToolCall,
  type RequestTool,
  createChatCompletionsProvider,
  isProviderError,
} from './provider';

/** True when the loop must stop, either because it finished or ran out of budget. */
export const shouldStop = (status: AgentStatus, stepsTaken: number, maxSteps = 40): boolean =>
  status === 'done' || status === 'failed' || stepsTaken >= maxSteps;
