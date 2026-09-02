import { type PromptMessage } from '@mobile-automation/prompt-engine';
import { type ToolName } from '@mobile-automation/tool-sdk';

/**
 * The model provider client: OpenAI-compatible Chat Completions only (ADR 0007).
 *
 * One protocol, configured by base URL, model, and key, so any compatible provider or
 * local gateway works without a code change. That is the whole reason for the
 * restriction - supporting four protocols before the automation core is proven would
 * spread the effort thin.
 *
 * The key is passed in per request and **never stored on this object**. It lives in
 * Android secure storage and is read at call time, so it cannot be captured in a heap
 * dump, a serialized config, or a log line.
 */

export type ProviderConfig = {
  /** e.g. `https://api.openai.com/v1` or `http://localhost:1234/v1`. */
  readonly baseUrl: string;
  readonly model: string;
  /**
   * Supplied per call, not held.
   *
   * A function rather than a string so the caller can read it from secure storage at
   * the moment of use, and so nothing here ever owns a credential.
   */
  readonly apiKey: () => Promise<string | null>;
  /** Some providers need extra headers; a key must never be passed this way. */
  readonly headers?: Readonly<Record<string, string>>;
  readonly temperature?: number;
  readonly maxTokens?: number;
  /** Per-request ceiling. A model call that hangs would freeze the agent loop. */
  readonly timeoutMs?: number;
  /**
   * Whether to send a previous turn's reasoning back.
   *
   * Off by default (`SEND_REASONING_BY_DEFAULT`). Configurable because a provider that uses reasoning for
   * continuity across turns needs it, and one that rejects unknown assistant fields must not have it.
   */
  readonly sendReasoning?: boolean;
};

export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

/**
 * Deliberately low.
 *
 * Automation wants the model to follow the screen it was given rather than embellish,
 * and a creative selector is a wrong selector.
 */
export const DEFAULT_TEMPERATURE = 0;

/** A tool the model may call, in the provider's function-calling shape. */
export type RequestTool = {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
  };
};

export type CompletionRequest = {
  readonly messages: readonly PromptMessage[];
  readonly tools?: readonly RequestTool[];
  /**
   * Whether the model must call a tool.
   *
   * `required` is used for the agent's action turn: it has already decided the model
   * should act, and a prose reply would just waste a round trip.
   */
  readonly toolChoice?: 'auto' | 'none' | 'required';
  readonly signal?: AbortSignal;
};

/** A tool call the model asked for, before validation. */
export type ProviderToolCall = {
  readonly id: string;
  readonly name: string;
  /** JSON string, as providers send it. Validated by `tool-sdk`, not here. */
  readonly arguments: string;
};

export type CompletionResponse = {
  /** Prose content, if the model replied with any. */
  readonly content: string | null;
  readonly toolCalls: readonly ProviderToolCall[];
  /**
   * The model's reasoning, when it emitted any.
   *
   * Read from `reasoning` or `reasoning_content` — providers disagree on the name, and a reasoning model whose
   * field is unrecognised looks like a model that returned nothing but a tool call.
   */
  readonly reasoning: string | null;
  /** Why the model stopped, useful for spotting a truncated response. */
  readonly finishReason: string | null;
  readonly usage?: {
    readonly promptTokens: number;
    readonly completionTokens: number;
  };
};

export const PROVIDER_ERROR_KINDS = [
  'not-configured',
  'unauthorized',
  'rate-limited',
  'server-error',
  'bad-request',
  'network',
  'timeout',
  'cancelled',
  'malformed-response',
] as const;

export type ProviderErrorKind = (typeof PROVIDER_ERROR_KINDS)[number];

/**
 * A provider failure, classified.
 *
 * The kinds matter because the agent's response differs: a rate limit should be waited
 * out, a bad key needs the user, and a malformed response should be re-prompted. A
 * single opaque error would force the loop to treat all three the same.
 */
export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly status?: number;
  /** Whether waiting and trying again could plausibly succeed. */
  readonly retryable: boolean;
  /** Whether the user must fix something - a key, a URL - before any retry helps. */
  readonly needsUserAction: boolean;

  constructor(
    kind: ProviderErrorKind,
    message: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'ProviderError';
    this.kind = kind;
    this.status = options.status;
    this.retryable = RETRYABLE_KINDS.has(kind);
    this.needsUserAction = USER_ACTION_KINDS.has(kind);

    if (options.cause !== undefined) this.cause = options.cause;

    // Restores the prototype chain, lost when a built-in is subclassed and transpiled.
    Object.setPrototypeOf(this, ProviderError.prototype);
  }
}

const RETRYABLE_KINDS = new Set<ProviderErrorKind>([
  'rate-limited',
  'server-error',
  'network',
  'timeout',
]);

const USER_ACTION_KINDS = new Set<ProviderErrorKind>(['not-configured', 'unauthorized']);

export const isProviderError = (value: unknown): value is ProviderError =>
  value instanceof ProviderError;

/**
 * What the agent needs from a model.
 *
 * An interface, so the agent loop can be tested against a scripted provider with no
 * network. That is what makes the flagship scenario a fast, deterministic unit test
 * rather than something only verifiable by spending money.
 */
export type ModelProvider = {
  complete: (request: CompletionRequest) => Promise<CompletionResponse>;
  /** For the UI: whether a key and model are configured at all. */
  isConfigured: () => Promise<boolean>;
  readonly model: string;
};

/** Injected so tests need no real network and no fake timers. */
export type ProviderDependencies = {
  readonly fetch?: typeof globalThis.fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly maxAttempts?: number;
};

/**
 * Creates a Chat Completions client.
 *
 * Retries only what is worth retrying: a 429 or a 5xx is transient, while a 400 means
 * the request itself is wrong and repeating it wastes the user's time and money.
 */
export const createChatCompletionsProvider = (
  config: ProviderConfig,
  dependencies: ProviderDependencies = {},
): ModelProvider => {
  const doFetch = dependencies.fetch ?? globalThis.fetch;
  const sleep = dependencies.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const maxAttempts = dependencies.maxAttempts ?? 3;

  const isConfigured = async (): Promise<boolean> => {
    if (config.baseUrl.trim() === '' || config.model.trim() === '') return false;
    const key = await config.apiKey();
    // A blank key is allowed: a local gateway usually needs none.
    return key !== null;
  };

  const complete = async (request: CompletionRequest): Promise<CompletionResponse> => {
    const key = await config.apiKey();

    if (key === null) {
      throw new ProviderError(
        'not-configured',
        'No AI provider is configured. Add a provider URL, model, and key in settings.',
      );
    }

    const body = buildRequestBody(config, request);
    let lastError: ProviderError | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (request.signal?.aborted === true) {
        throw new ProviderError('cancelled', 'The request was cancelled.');
      }

      try {
        return await sendOnce(doFetch, config, key, body, request.signal);
      } catch (error) {
        const providerError = asProviderError(error);

        if (!providerError.retryable || attempt === maxAttempts - 1) throw providerError;

        lastError = providerError;

        // Exponential backoff. A rate limit that clears in a second is common; one
        // that clears instantly is not, so the first wait is not zero.
        await sleep(500 * 2 ** attempt);
      }
    }

    throw lastError ?? new ProviderError('network', 'The request could not be completed.');
  };

  return { complete, isConfigured, model: config.model };
};

/**
 * Whether the model's reasoning is sent back on the next turn.
 *
 * False, and this is a considered default rather than laziness. Reasoning is often the largest part of a
 * response, it is not required for the model to continue coherently — the assistant turn and its tool results
 * carry the decision — and several providers reject an unrecognised field on an assistant message outright. It
 * is kept on the message for the UI and the trace, which is where it is actually useful.
 */
export const SEND_REASONING_BY_DEFAULT = false;

/**
 * Builds the request body.
 *
 * ## What this must get right
 *
 * The whole conversation is replayed on every call, and a provider validates its shape strictly: an assistant
 * message that called tools must carry those calls with their original ids, and every tool message must
 * reference an id that appeared on a preceding assistant message. Get either wrong and the request is rejected
 * as a whole — or worse, accepted with the model unable to see what it just did.
 *
 * An earlier version of this function mapped only `role`, `content` and `tool_call_id`. **`tool_calls` was
 * dropped silently**, so an assistant turn could never be replayed and the request carried nothing but system
 * and user messages however many steps had been taken. That is the bug this shape exists to make impossible.
 */
const buildRequestBody = (
  config: ProviderConfig,
  request: CompletionRequest,
): Record<string, unknown> => {
  const body: Record<string, unknown> = {
    model: config.model,
    messages: request.messages.map((message) => toWireMessage(message, config)),
    temperature: config.temperature ?? DEFAULT_TEMPERATURE,
  };

  if (config.maxTokens !== undefined) body.max_tokens = config.maxTokens;

  if (request.tools !== undefined && request.tools.length > 0) {
    body.tools = request.tools;
    body.tool_choice = request.toolChoice ?? 'auto';
  }

  return body;
};

/** One message in the provider's shape. */
const toWireMessage = (message: PromptMessage, config: ProviderConfig): Record<string, unknown> => {
  const wire: Record<string, unknown> = {
    role: message.role,
    content: toWireContent(message.content),
  };

  // A tool result must carry the id of the call it answers, or the provider cannot match them.
  if (message.toolCallId !== undefined) wire.tool_call_id = message.toolCallId;

  if (message.toolCalls !== undefined && message.toolCalls.length > 0) {
    wire.tool_calls = message.toolCalls.map((call) => ({
      id: call.id,
      type: 'function',
      // `arguments` is passed through as the string it arrived as. Re-serializing a parsed object is not
      // guaranteed byte-identical, and some providers match the assistant turn against its tool results.
      function: { name: call.name, arguments: call.arguments },
    }));
  }

  if (
    message.reasoning !== undefined &&
    (config.sendReasoning ?? SEND_REASONING_BY_DEFAULT) &&
    message.role === 'assistant'
  ) {
    wire.reasoning = message.reasoning;
  }

  return wire;
};

/**
 * Content in the provider's shape.
 *
 * A plain string stays a string rather than becoming a one-element array. Both are legal, but the string form
 * is what every provider has supported since before parts existed, and there is no reason to make the common
 * case the less compatible one.
 */
const toWireContent = (
  content: PromptMessage['content'],
): string | null | readonly Record<string, unknown>[] => {
  if (content === null || typeof content === 'string') return content;

  return content.map((part) =>
    part.type === 'text'
      ? { type: 'text', text: part.text }
      : {
          type: 'image_url',
          image_url:
            part.imageUrl.detail === undefined
              ? { url: part.imageUrl.url }
              : { url: part.imageUrl.url, detail: part.imageUrl.detail },
        },
  );
};

const sendOnce = async (
  doFetch: typeof globalThis.fetch,
  config: ProviderConfig,
  key: string,
  body: Record<string, unknown>,
  signal: AbortSignal | undefined,
): Promise<CompletionResponse> => {
  const controller = new AbortController();
  const timeoutMs = config.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener('abort', onCallerAbort);

  try {
    const response = await doFetch(`${trimTrailingSlash(config.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Sent only here, from a value read moments ago. Never logged.
        ...(key === '' ? {} : { Authorization: `Bearer ${key}` }),
        ...config.headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) throw await describeHttpFailure(response);

    const json = (await response.json()) as unknown;
    return parseCompletion(json);
  } catch (error) {
    if (isProviderError(error)) throw error;

    if (isAbortError(error)) {
      // A caller abort and a timeout both surface as AbortError; they are different
      // outcomes, and only one is retryable.
      throw signal?.aborted === true
        ? new ProviderError('cancelled', 'The request was cancelled.')
        : new ProviderError('timeout', `The model did not respond within ${timeoutMs}ms.`);
    }

    throw new ProviderError(
      'network',
      `Could not reach the AI provider at ${config.baseUrl}. Check the URL and your connection.`,
      { cause: error },
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }
};

/**
 * Classifies an HTTP failure.
 *
 * The provider's own message is included where it is safe: it usually says exactly
 * what is wrong ("model not found", "context length exceeded"), and hiding it behind a
 * generic status would leave the user guessing.
 */
const describeHttpFailure = async (response: Response): Promise<ProviderError> => {
  const detail = await readErrorMessage(response);

  if (response.status === 401 || response.status === 403) {
    return new ProviderError(
      'unauthorized',
      `The AI provider rejected the API key${detail}. Check the key in settings.`,
      { status: response.status },
    );
  }

  if (response.status === 429) {
    return new ProviderError(
      'rate-limited',
      `The AI provider is rate limiting requests${detail}.`,
      {
        status: response.status,
      },
    );
  }

  if (response.status >= 500) {
    return new ProviderError('server-error', `The AI provider had an error${detail}.`, {
      status: response.status,
    });
  }

  return new ProviderError('bad-request', `The AI provider rejected the request${detail}.`, {
    status: response.status,
  });
};

const readErrorMessage = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as { error?: { message?: unknown } };
    const message = body?.error?.message;
    return typeof message === 'string' && message !== '' ? `: ${message}` : '';
  } catch {
    // A provider that returns HTML for an error is common enough not to be worth
    // reporting as its own failure.
    return '';
  }
};

/**
 * Reads the response, tolerating what providers actually send.
 *
 * `content` may be absent when the model only called a tool, `tool_calls` may be
 * absent when it only replied, and both may be present. A strict reader would break on
 * a perfectly valid response.
 */
const parseCompletion = (json: unknown): CompletionResponse => {
  const payload = json as {
    choices?: {
      message?: {
        content?: unknown;
        reasoning?: unknown;
        reasoning_content?: unknown;
        tool_calls?: { id?: unknown; function?: { name?: unknown; arguments?: unknown } }[];
      };
      finish_reason?: unknown;
    }[];
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  };

  const choice = payload?.choices?.[0];

  if (choice === undefined) {
    throw new ProviderError(
      'malformed-response',
      'The AI provider returned no completion. It may not be OpenAI-compatible.',
    );
  }

  const message = choice.message ?? {};

  const toolCalls: ProviderToolCall[] = (message.tool_calls ?? [])
    .map((call, index) => ({
      id: typeof call.id === 'string' ? call.id : `call_${index}`,
      name: typeof call.function?.name === 'string' ? call.function.name : '',
      arguments: typeof call.function?.arguments === 'string' ? call.function.arguments : '{}',
    }))
    // A call with no name cannot be dispatched; dropping it is better than passing an
    // empty name to validation, which would report a confusing "no tool called """.
    .filter((call) => call.name !== '');

  return {
    content: typeof message.content === 'string' ? message.content : null,
    toolCalls,
    // Both spellings are read because providers disagree, and the cost of guessing wrong is that a reasoning
    // model's whole thought process is silently discarded.
    reasoning: readReasoning(message),
    finishReason: typeof choice.finish_reason === 'string' ? choice.finish_reason : null,
    usage:
      typeof payload.usage?.prompt_tokens === 'number' &&
      typeof payload.usage?.completion_tokens === 'number'
        ? {
            promptTokens: payload.usage.prompt_tokens,
            completionTokens: payload.usage.completion_tokens,
          }
        : undefined,
  };
};

const readReasoning = (message: {
  reasoning?: unknown;
  reasoning_content?: unknown;
}): string | null => {
  for (const candidate of [message.reasoning, message.reasoning_content]) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate;
  }

  return null;
};

const asProviderError = (error: unknown): ProviderError => {
  if (isProviderError(error)) return error;

  return new ProviderError('network', error instanceof Error ? error.message : String(error), {
    cause: error,
  });
};

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');

const trimTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

/** Narrows the tool list for a read-only agent mode. */
export type ToolSelection = readonly ToolName[];
