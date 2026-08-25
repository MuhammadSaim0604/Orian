/**
 * `@mobile-automation/prompt-engine`
 *
 * Every prompt in the product is built here - agent planning, node
 * configuration, and workflow generation. No ad-hoc string concatenation at
 * call sites, so prompts stay versioned and testable.
 *
 * Phase 1 scaffold - templates, context builders, and parsers are built in
 * Phase 7.
 */

export const PACKAGE_NAME = '@mobile-automation/prompt-engine' as const;

/** Chat Completions message roles (ADR 0007). */
export const MESSAGE_ROLES = ['system', 'user', 'assistant', 'tool'] as const;

export type MessageRole = (typeof MESSAGE_ROLES)[number];

/** The distinct context assembly jobs the engine performs. */
export const CONTEXT_KINDS = ['agent', 'nodeConfig', 'workflowGeneration'] as const;

export type ContextKind = (typeof CONTEXT_KINDS)[number];

/**
 * Keys that must never appear in an assembled prompt. Provider credentials
 * live in Android secure storage and are not model context (ADR 0005).
 */
export const REDACTED_KEYS = ['apiKey', 'authorization', 'token', 'password'] as const;

/** True when a context key must be stripped before the prompt is sent. */
export const isRedactedKey = (key: string): boolean =>
  REDACTED_KEYS.some((redacted) => key.toLowerCase() === redacted.toLowerCase());
