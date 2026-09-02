import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_TEMPERATURE,
  PROVIDER_ERROR_KINDS,
  ProviderError,
  createChatCompletionsProvider,
  isProviderError,
} from './provider';

const completion = (overrides: Record<string, unknown> = {}) => ({
  choices: [
    {
      message: { content: 'Done.', tool_calls: undefined },
      finish_reason: 'stop',
    },
  ],
  ...overrides,
});

const okResponse = (body: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => body,
  }) as unknown as Response;

const errorResponse = (status: number, message?: string) =>
  ({
    ok: false,
    status,
    json: async () => (message === undefined ? {} : { error: { message } }),
  }) as unknown as Response;

const provider = (
  fetchImpl: typeof globalThis.fetch,
  overrides: Partial<Parameters<typeof createChatCompletionsProvider>[0]> = {},
  dependencies: Parameters<typeof createChatCompletionsProvider>[1] = {},
) =>
  createChatCompletionsProvider(
    {
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-4o-mini',
      apiKey: async () => 'sk-test',
      ...overrides,
    },
    { fetch: fetchImpl, sleep: async () => {}, ...dependencies },
  );

describe('configuration', () => {
  it('reads the key at call time rather than holding it', async () => {
    // So it cannot be captured in a heap dump or a serialized config, and can come
    // straight from Android secure storage.
    const reads: number[] = [];
    const fetchImpl = vi.fn(async () => okResponse(completion()));

    const client = provider(fetchImpl as unknown as typeof globalThis.fetch, {
      apiKey: async () => {
        reads.push(Date.now());
        return 'sk-test';
      },
    });

    await client.complete({ messages: [] });
    await client.complete({ messages: [] });

    expect(reads).toHaveLength(2);
  });

  it('sends the key as a bearer token', async () => {
    const fetchImpl = vi.fn(async () => okResponse(completion()));

    await provider(fetchImpl as unknown as typeof globalThis.fetch).complete({ messages: [] });

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
  });

  it('omits the header entirely for a local gateway with no key', async () => {
    const fetchImpl = vi.fn(async () => okResponse(completion()));

    await provider(fetchImpl as unknown as typeof globalThis.fetch, {
      apiKey: async () => '',
    }).complete({ messages: [] });

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('fails clearly when no provider is configured', async () => {
    const client = provider((async () => okResponse(completion())) as typeof globalThis.fetch, {
      apiKey: async () => null,
    });

    await expect(client.complete({ messages: [] })).rejects.toThrow(/No AI provider is configured/);
  });

  it('marks a missing configuration as needing the user, not a retry', async () => {
    const client = provider((async () => okResponse(completion())) as typeof globalThis.fetch, {
      apiKey: async () => null,
    });

    try {
      await client.complete({ messages: [] });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isProviderError(error)).toBe(true);
      if (isProviderError(error)) {
        expect(error.needsUserAction).toBe(true);
        expect(error.retryable).toBe(false);
      }
    }
  });

  it('reports whether it is configured', async () => {
    const configured = provider((async () => okResponse(completion())) as typeof globalThis.fetch);
    const unconfigured = provider(
      (async () => okResponse(completion())) as typeof globalThis.fetch,
      { apiKey: async () => null },
    );

    await expect(configured.isConfigured()).resolves.toBe(true);
    await expect(unconfigured.isConfigured()).resolves.toBe(false);
  });

  it('treats a blank base URL as unconfigured', async () => {
    const client = provider((async () => okResponse(completion())) as typeof globalThis.fetch, {
      baseUrl: '   ',
    });

    await expect(client.isConfigured()).resolves.toBe(false);
  });

  it('tolerates a trailing slash on the base URL', async () => {
    const fetchImpl = vi.fn(async () => okResponse(completion()));

    await provider(fetchImpl as unknown as typeof globalThis.fetch, {
      baseUrl: 'https://api.example.com/v1/',
    }).complete({ messages: [] });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://api.example.com/v1/chat/completions');
  });

  it('defaults to temperature zero, since a creative selector is a wrong selector', async () => {
    const fetchImpl = vi.fn(async () => okResponse(completion()));

    await provider(fetchImpl as unknown as typeof globalThis.fetch).complete({ messages: [] });

    const body = JSON.parse((fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.temperature).toBe(DEFAULT_TEMPERATURE);
    expect(DEFAULT_TEMPERATURE).toBe(0);
  });
});

describe('requests', () => {
  it('sends the model and messages', async () => {
    const fetchImpl = vi.fn(async () => okResponse(completion()));

    await provider(fetchImpl as unknown as typeof globalThis.fetch).complete({
      messages: [
        { role: 'system', content: 'Be careful.' },
        { role: 'user', content: 'Open WhatsApp.' },
      ],
    });

    const body = JSON.parse((fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string);

    expect(body.model).toBe('gpt-4o-mini');
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'Be careful.' });
  });

  it('carries a tool call id on a tool message', async () => {
    // Without it the provider cannot match a result to the call it answers.
    const fetchImpl = vi.fn(async () => okResponse(completion()));

    await provider(fetchImpl as unknown as typeof globalThis.fetch).complete({
      messages: [{ role: 'tool', content: '{"ok":true}', toolCallId: 'call_9' }],
    });

    const body = JSON.parse((fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.messages[0].tool_call_id).toBe('call_9');
  });

  it('sends an assistant turn with its tool calls', async () => {
    /**
     * The defect at its root.
     *
     * This mapper used to emit only `role`, `content` and `tool_call_id`. **`tool_calls` was dropped silently**,
     * so an assistant turn could never be replayed — which is why production network logs showed nothing but
     * system and user messages however many steps had been taken, and why the model had no way to see its own
     * actions.
     */
    const fetchImpl = vi.fn(async () => okResponse(completion()));

    await provider(fetchImpl as unknown as typeof globalThis.fetch).complete({
      messages: [
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            { id: 'call_1', name: 'openApp', arguments: '{"packageName":"com.whatsapp"}' },
          ],
        },
      ],
    });

    const body = JSON.parse((fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string);

    expect(body.messages[0].tool_calls).toEqual([
      {
        id: 'call_1',
        type: 'function',
        function: { name: 'openApp', arguments: '{"packageName":"com.whatsapp"}' },
      },
    ]);
    // Null rather than '', because an empty string reads as an empty reply rather than an absent one.
    expect(body.messages[0].content).toBeNull();
  });

  it('passes tool arguments through as the string they arrived as', async () => {
    // Not re-serialized. A round trip through JSON.parse and JSON.stringify is not guaranteed byte-identical, and
    // some providers match the assistant turn against the tool results answering it.
    const fetchImpl = vi.fn(async () => okResponse(completion()));
    const raw = '{"text": "hello",  "exact":true}';

    await provider(fetchImpl as unknown as typeof globalThis.fetch).complete({
      messages: [
        {
          role: 'assistant',
          content: null,
          toolCalls: [{ id: 'c1', name: 'findTextOnScreen', arguments: raw }],
        },
      ],
    });

    const body = JSON.parse((fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string);

    expect(body.messages[0].tool_calls[0].function.arguments).toBe(raw);
  });

  it('sends multi-part content with an image as a data url', async () => {
    // A model cannot fetch a `file://` path off someone's phone, so a tool result carrying a screenshot has to
    // carry the bytes.
    const fetchImpl = vi.fn(async () => okResponse(completion()));

    await provider(fetchImpl as unknown as typeof globalThis.fetch).complete({
      messages: [
        {
          role: 'tool',
          toolCallId: 'c1',
          content: [
            { type: 'text', text: 'Screenshot of the current screen.' },
            {
              type: 'image_url',
              imageUrl: { url: 'data:image/png;base64,AAA', detail: 'auto' },
            },
          ],
        },
      ],
    });

    const body = JSON.parse((fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string);

    // Snake_case on the wire, camelCase internally.
    expect(body.messages[0].content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,AAA', detail: 'auto' },
    });
  });

  it('leaves a plain string as a string rather than wrapping it in parts', async () => {
    // Both are legal, but the string form is what every provider has supported longest, and there is no reason to
    // make the common case the less compatible one.
    const fetchImpl = vi.fn(async () => okResponse(completion()));

    await provider(fetchImpl as unknown as typeof globalThis.fetch).complete({
      messages: [{ role: 'user', content: 'hello' }],
    });

    const body = JSON.parse((fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string);

    expect(body.messages[0].content).toBe('hello');
  });

  it('does not send reasoning back by default', async () => {
    // It is often the largest part of a response, the assistant turn plus its tool results already carry the
    // decision, and several providers reject an unrecognised field on an assistant message.
    const fetchImpl = vi.fn(async () => okResponse(completion()));

    await provider(fetchImpl as unknown as typeof globalThis.fetch).complete({
      messages: [{ role: 'assistant', content: 'Done.', reasoning: 'I thought about it.' }],
    });

    const body = JSON.parse((fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string);

    expect(body.messages[0].reasoning).toBeUndefined();
  });

  it('sends tools when supplied', async () => {
    const fetchImpl = vi.fn(async () => okResponse(completion()));

    await provider(fetchImpl as unknown as typeof globalThis.fetch).complete({
      messages: [],
      tools: [
        {
          type: 'function',
          function: { name: 'click', description: 'Tap', parameters: { type: 'object' } },
        },
      ],
      toolChoice: 'auto',
    });

    const body = JSON.parse((fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string);

    expect(body.tools).toHaveLength(1);
    expect(body.tool_choice).toBe('auto');
  });

  it('omits the tool fields when there are no tools', async () => {
    // A provider that rejects an empty tools array is a real thing.
    const fetchImpl = vi.fn(async () => okResponse(completion()));

    await provider(fetchImpl as unknown as typeof globalThis.fetch).complete({ messages: [] });

    const body = JSON.parse((fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string);

    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });
});

describe('responses', () => {
  it('reads prose content', async () => {
    const client = provider((async () => okResponse(completion())) as typeof globalThis.fetch);

    const response = await client.complete({ messages: [] });

    expect(response.content).toBe('Done.');
    expect(response.toolCalls).toEqual([]);
  });

  it('reads tool calls', async () => {
    const client = provider((async () =>
      okResponse(
        completion({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    function: { name: 'click', arguments: '{"selector":{"text":"Send"}}' },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        }),
      )) as typeof globalThis.fetch);

    const response = await client.complete({ messages: [] });

    expect(response.toolCalls).toEqual([
      { id: 'call_1', name: 'click', arguments: '{"selector":{"text":"Send"}}' },
    ]);
  });

  it('reads reasoning under either spelling', async () => {
    // Providers disagree on the field name, and an unrecognised one means a reasoning model's whole thought
    // process is silently discarded — which reads as a model that returned nothing but a tool call.
    for (const field of ['reasoning', 'reasoning_content']) {
      const client = provider((async () =>
        okResponse(
          completion({
            choices: [
              {
                message: { content: null, [field]: 'I should look at the screen first.' },
                finish_reason: 'stop',
              },
            ],
          }),
        )) as typeof globalThis.fetch);

      const response = await client.complete({ messages: [] });

      expect(response.reasoning).toBe('I should look at the screen first.');
    }
  });

  it('reports no reasoning when there is none', async () => {
    const client = provider((async () => okResponse(completion())) as typeof globalThis.fetch);

    expect((await client.complete({ messages: [] })).reasoning).toBeNull();
  });

  it('handles content and a tool call together', async () => {
    // Both present is valid, and a strict reader would break on it.
    const client = provider((async () =>
      okResponse(
        completion({
          choices: [
            {
              message: {
                content: 'Tapping send.',
                tool_calls: [{ id: 'c', function: { name: 'click', arguments: '{}' } }],
              },
            },
          ],
        }),
      )) as typeof globalThis.fetch);

    const response = await client.complete({ messages: [] });

    expect(response.content).toBe('Tapping send.');
    expect(response.toolCalls).toHaveLength(1);
  });

  it('drops a tool call with no name rather than passing an empty one on', async () => {
    // Validation would otherwise report a confusing "no tool called """.
    const client = provider((async () =>
      okResponse(
        completion({
          choices: [{ message: { tool_calls: [{ id: 'c', function: { arguments: '{}' } }] } }],
        }),
      )) as typeof globalThis.fetch);

    const response = await client.complete({ messages: [] });

    expect(response.toolCalls).toEqual([]);
  });

  it('reads usage when the provider reports it', async () => {
    const client = provider((async () =>
      okResponse(
        completion({ usage: { prompt_tokens: 1_200, completion_tokens: 40 } }),
      )) as typeof globalThis.fetch);

    const response = await client.complete({ messages: [] });

    expect(response.usage).toEqual({ promptTokens: 1_200, completionTokens: 40 });
  });

  it('tolerates a provider that omits usage', async () => {
    const client = provider((async () => okResponse(completion())) as typeof globalThis.fetch);

    await expect(client.complete({ messages: [] })).resolves.toMatchObject({ usage: undefined });
  });

  it('reports a response with no choices as malformed', async () => {
    const client = provider((async () => okResponse({ choices: [] })) as typeof globalThis.fetch);

    await expect(client.complete({ messages: [] })).rejects.toThrow(/OpenAI-compatible/);
  });
});

describe('error classification', () => {
  it('treats 401 as a key problem needing the user', async () => {
    const client = provider((async () => errorResponse(401)) as typeof globalThis.fetch);

    try {
      await client.complete({ messages: [] });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isProviderError(error)).toBe(true);
      if (isProviderError(error)) {
        expect(error.kind).toBe('unauthorized');
        expect(error.needsUserAction).toBe(true);
        expect(error.retryable).toBe(false);
      }
    }
  });

  it('treats 429 as retryable', async () => {
    // A rate limit clears; the agent should wait rather than fail the run.
    let attempts = 0;

    const client = provider((async () => {
      attempts++;
      return attempts === 1 ? errorResponse(429) : okResponse(completion());
    }) as typeof globalThis.fetch);

    await expect(client.complete({ messages: [] })).resolves.toMatchObject({ content: 'Done.' });
    expect(attempts).toBe(2);
  });

  it('treats a 5xx as retryable', async () => {
    let attempts = 0;

    const client = provider((async () => {
      attempts++;
      return attempts < 3 ? errorResponse(503) : okResponse(completion());
    }) as typeof globalThis.fetch);

    await expect(client.complete({ messages: [] })).resolves.toBeDefined();
    expect(attempts).toBe(3);
  });

  it('does not retry a 400, since repeating a wrong request wastes money', async () => {
    let attempts = 0;

    const client = provider((async () => {
      attempts++;
      return errorResponse(400, 'context length exceeded');
    }) as typeof globalThis.fetch);

    await expect(client.complete({ messages: [] })).rejects.toThrow(/context length exceeded/);
    expect(attempts).toBe(1);
  });

  it("includes the provider's own message, which usually says exactly what is wrong", async () => {
    const client = provider((async () =>
      errorResponse(404, 'model not found')) as typeof globalThis.fetch);

    await expect(client.complete({ messages: [] })).rejects.toThrow(/model not found/);
  });

  it('tolerates a provider that returns HTML for an error', async () => {
    const client = provider(
      (async () =>
        ({
          ok: false,
          status: 502,
          json: async () => {
            throw new Error('not json');
          },
        }) as unknown as Response) as typeof globalThis.fetch,
    );

    await expect(client.complete({ messages: [] })).rejects.toThrow(/had an error/);
  });

  it('gives up after the attempt limit', async () => {
    let attempts = 0;

    const client = provider(
      (async () => {
        attempts++;
        return errorResponse(503);
      }) as typeof globalThis.fetch,
      {},
      { maxAttempts: 2 },
    );

    await expect(client.complete({ messages: [] })).rejects.toThrow();
    expect(attempts).toBe(2);
  });

  it('classifies a network failure', async () => {
    const client = provider((async () => {
      throw new TypeError('Network request failed');
    }) as typeof globalThis.fetch);

    await expect(client.complete({ messages: [] })).rejects.toThrow(/Could not reach/);
  });

  it('distinguishes cancellation from a timeout', async () => {
    // Both surface as AbortError, but only one is retryable and only one is the user's
    // choice.
    const controller = new AbortController();
    controller.abort();

    const client = provider((async () => okResponse(completion())) as typeof globalThis.fetch);

    try {
      await client.complete({ messages: [], signal: controller.signal });
      expect.unreachable('should have thrown');
    } catch (error) {
      if (isProviderError(error)) expect(error.kind).toBe('cancelled');
    }
  });

  it('is recognisable with instanceof after transpilation', () => {
    const error = new ProviderError('network', 'x');

    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toBeInstanceOf(Error);
    expect(isProviderError(error)).toBe(true);
  });

  it('declares every failure kind it can report', () => {
    expect(PROVIDER_ERROR_KINDS).toContain('not-configured');
    expect(PROVIDER_ERROR_KINDS).toContain('unauthorized');
    expect(PROVIDER_ERROR_KINDS).toContain('rate-limited');
    expect(PROVIDER_ERROR_KINDS).toContain('malformed-response');
  });
});
