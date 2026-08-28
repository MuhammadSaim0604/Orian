/**
 * `@mobile-automation/prompt-engine`
 *
 * Every prompt in the product is built here - agent planning, node configuration, and
 * workflow generation. No ad-hoc string concatenation at call sites, so prompts stay
 * versioned, reviewable, and testable.
 *
 * Three things live here that are easy to underrate:
 *
 * - **Context assembly is the agent's perception.** The model cannot see the phone; it
 *   sees what `buildAgentContext` assembles. What is included and how it is labelled
 *   determines what the agent is capable of.
 * - **Redaction is a safety boundary.** Provider credentials live in Android secure
 *   storage and must never reach a prompt, a log, or a trace (ADR 0007).
 * - **Parsing is the gate before action.** Model output is text; `parseStructured`
 *   turns it into something validated, repairing formatting but never meaning.
 */

export const PACKAGE_NAME = '@mobile-automation/prompt-engine' as const;

/** The distinct context assembly jobs the engine performs. */
export const CONTEXT_KINDS = ['agent', 'nodeConfig', 'workflowGeneration'] as const;

export type ContextKind = (typeof CONTEXT_KINDS)[number];

export {
  MESSAGE_ROLES,
  MessageRoleSchema,
  type MessageRole,
  type PromptMessage,
  type PromptTemplate,
  type RenderedPrompt,
  assistantMessage,
  defineTemplate,
  estimateMessagesTokens,
  estimateTokens,
  joinSections,
  numberedList,
  renderPrompt,
  section,
  systemMessage,
  toolMessage,
  userMessage,
} from './template';

export {
  REDACTED_KEYS,
  REDACTION_PLACEHOLDER,
  isRedactedKey,
  keepRecentWithinBudget,
  redact,
  toPromptJson,
  truncateToTokens,
} from './redaction';

export {
  AGENT_SYSTEM_PROMPT,
  DEFAULT_CONTEXT_BUDGET,
  type AgentContextInput,
  type ContextBudget,
  type MemoryEntry,
  type Observation,
  buildAgentContext,
} from './agent-context';

export {
  NODE_CONFIG_SYSTEM_PROMPT,
  type NodeConfigContextInput,
  buildNodeConfigContext,
} from './node-config-context';

export {
  GENERATION_SYSTEM_PROMPT,
  type GenerationContextInput,
  type TraceStepSummary,
  buildGenerationContext,
  buildPlanContext,
} from './generation-context';

export {
  type ParseFailure,
  type ParseResult,
  type ParseSuccess,
  extractJson,
  parseStructured,
  parseWithRetry,
  repairJson,
} from './parser';
