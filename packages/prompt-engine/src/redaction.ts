/**
 * Keeping secrets and noise out of prompts.
 *
 * Two separate jobs that both come down to "not everything belongs in the model
 * context". Redaction is a safety rule: provider credentials live in Android secure
 * storage and must never be sent to a provider, logged, or stored in a trace
 * (ADR 0007). Trimming is a budget rule: the UI tree of a busy screen can be tens of
 * thousands of tokens on its own.
 *
 * Both run over data the app assembled, not over model output - model output is
 * validated by the parsers instead.
 */

/**
 * Key names whose values must never reach a prompt.
 *
 * Matched by substring rather than exactly, so `openaiApiKey` and `X-Auth-Token` are
 * caught too. Being over-eager here is cheap; missing one is not.
 */
export const REDACTED_KEYS = [
  'apikey',
  'api_key',
  'authorization',
  'token',
  'password',
  'secret',
  'credential',
  'bearer',
  'privatekey',
  'private_key',
] as const;

export const REDACTION_PLACEHOLDER = '[redacted]' as const;

/** True when a key's value must be stripped before the prompt is sent. */
export const isRedactedKey = (key: string): boolean => {
  // Underscores, hyphens, and spaces are all stripped from both sides, so `api_key`,
  // `X-Auth-Token`, and `apiKey` are one comparison rather than three special cases.
  const normalised = key.toLowerCase().replace(/[-_\s]/g, '');
  return REDACTED_KEYS.some((redacted) => normalised.includes(redacted.replace(/_/g, '')));
};

/**
 * Recursively replaces sensitive values.
 *
 * Recursive because context is assembled from nested structures - a UI tree, a node
 * config, a tool result - and a key at depth four is exactly as dangerous as one at
 * the top. Structure is preserved so the model still sees that a field existed, which
 * matters when it is reasoning about a login screen.
 */
export const redact = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redact);

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};

    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = isRedactedKey(key) ? REDACTION_PLACEHOLDER : redact(nested);
    }

    return result;
  }

  return value;
};

/** Serialises a value for a prompt, with secrets removed. */
export const toPromptJson = (value: unknown, indent = 0): string =>
  JSON.stringify(redact(value), null, indent);

/**
 * Truncates text to a token budget, saying so.
 *
 * The marker is not decoration. Text that stops mid-sentence with no explanation reads
 * to the model as the whole content, and it will confidently reason about a screen it
 * only saw half of.
 */
export const truncateToTokens = (text: string, maxTokens: number): string => {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;

  const kept = text.slice(0, maxChars);
  const omitted = text.length - kept.length;

  return `${kept}\n... [truncated, ${omitted} characters omitted]`;
};

/**
 * Keeps the most recent items that fit a budget.
 *
 * Recent rather than earliest: the agent's last few observations describe the screen
 * it is looking at now, while its first ones describe a screen that is long gone.
 * Order is preserved in the result so the model still reads them chronologically.
 */
export const keepRecentWithinBudget = <T>(
  items: readonly T[],
  maxTokens: number,
  sizeOf: (item: T) => number,
): { readonly kept: readonly T[]; readonly droppedCount: number } => {
  const kept: T[] = [];
  let used = 0;

  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]!;
    const size = sizeOf(item);

    if (used + size > maxTokens && kept.length > 0) break;

    kept.unshift(item);
    used += size;
  }

  return { kept, droppedCount: items.length - kept.length };
};
