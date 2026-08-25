/**
 * `@mobile-automation/ai-agent`
 *
 * The autonomous agent: takes a natural-language goal and drives the device by
 * calling tools on the shared Android Tool Runtime. Separate from the workflow
 * engine, but speaking the identical tool vocabulary (ADR 0008).
 *
 * Phase 1 scaffold - the loop, planner, and memory are built in Phase 7.
 */

export const PACKAGE_NAME = '@mobile-automation/ai-agent' as const;

/** The agent loop, in order. */
export const AGENT_PHASES = ['plan', 'observe', 'chooseTool', 'execute', 'replan', 'done'] as const;

export type AgentPhase = (typeof AGENT_PHASES)[number];

export const AGENT_STATUSES = ['planning', 'acting', 'replanning', 'done', 'failed'] as const;

export type AgentStatus = (typeof AGENT_STATUSES)[number];

/**
 * Hard ceiling on loop iterations. The loop must always be bounded so a
 * confused model cannot drive the device indefinitely.
 */
export const MAX_AGENT_STEPS = 40;

/** True when the loop must stop, either because it finished or ran out of budget. */
export const shouldStop = (status: AgentStatus, stepsTaken: number): boolean =>
  status === 'done' || status === 'failed' || stepsTaken >= MAX_AGENT_STEPS;
