/**
 * Model discovery, and what happens when it fails.
 *
 * Discovery failing is **ordinary**, not an error: plenty of OpenAI-compatible providers do not implement
 * `/models`, some require a key for it, and a local gateway may be offline. The step file is explicit that
 * manual entry is a first-class path, so what is protected here is that a failure produces a *reason a person
 * can act on* rather than a dead end.
 *
 * The permissive parsing is equally deliberate. Three response shapes exist in the wild, and being strict about
 * one of them would mean telling users to type model names by hand for no reason.
 */

const mockFetch = jest.fn();

jest.mock('react-native', () => ({
  NativeModules: {},
}));

import { discoverModels, isModelCacheStale, type Provider } from '../providerRegistry';

beforeEach(() => {
  mockFetch.mockReset();
  (globalThis as { fetch?: unknown }).fetch = mockFetch;
});

const ok = (payload: unknown) => ({
  ok: true,
  status: 200,
  json: async () => payload,
});

describe('parsing the model list', () => {
  it('reads the OpenAI shape', async () => {
    mockFetch.mockResolvedValue(ok({ data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }] }));

    const result = await discoverModels('https://api.openai.com/v1', 'sk-test');

    expect(result).toEqual({ ok: true, models: ['gpt-4o', 'gpt-4o-mini'] });
  });

  it('reads a bare array of objects', async () => {
    mockFetch.mockResolvedValue(ok([{ id: 'llama-3' }]));

    const result = await discoverModels('http://localhost:1234/v1', null);

    expect(result).toEqual({ ok: true, models: ['llama-3'] });
  });

  it('reads a bare array of strings', async () => {
    mockFetch.mockResolvedValue(ok(['mistral-7b', 'phi-3']));

    const result = await discoverModels('http://localhost:1234/v1', null);

    expect(result).toEqual({ ok: true, models: ['mistral-7b', 'phi-3'] });
  });

  it('sorts, so a long list is scannable', async () => {
    mockFetch.mockResolvedValue(ok({ data: [{ id: 'zeta' }, { id: 'alpha' }] }));

    const result = await discoverModels('https://example.com/v1', null);

    expect(result).toEqual({ ok: true, models: ['alpha', 'zeta'] });
  });

  it('de-duplicates, since some gateways alias one model several times', async () => {
    mockFetch.mockResolvedValue(ok({ data: [{ id: 'gpt-4o' }, { id: 'gpt-4o' }] }));

    const result = await discoverModels('https://example.com/v1', null);

    expect(result).toEqual({ ok: true, models: ['gpt-4o'] });
  });

  it('ignores rows with no usable id', async () => {
    mockFetch.mockResolvedValue(ok({ data: [{ id: '' }, { name: 'no-id' }, { id: 'good' }] }));

    const result = await discoverModels('https://example.com/v1', null);

    expect(result).toEqual({ ok: true, models: ['good'] });
  });
});

describe('the request', () => {
  it('appends /models to the base URL', async () => {
    mockFetch.mockResolvedValue(ok({ data: [{ id: 'x' }] }));

    await discoverModels('https://api.openai.com/v1', null);

    expect(mockFetch.mock.calls[0]?.[0]).toBe('https://api.openai.com/v1/models');
  });

  it('does not produce a double slash from a trailing slash', async () => {
    // Some gateways 404 on `//models`, which would look like the provider not supporting discovery at all.
    mockFetch.mockResolvedValue(ok({ data: [{ id: 'x' }] }));

    await discoverModels('https://api.openai.com/v1/', null);

    expect(mockFetch.mock.calls[0]?.[0]).toBe('https://api.openai.com/v1/models');
  });

  it('sends the key when there is one', async () => {
    mockFetch.mockResolvedValue(ok({ data: [{ id: 'x' }] }));

    await discoverModels('https://api.openai.com/v1', 'sk-test');

    expect(mockFetch.mock.calls[0]?.[1]?.headers).toEqual({ Authorization: 'Bearer sk-test' });
  });

  it('sends no auth header when there is no key', async () => {
    // A local gateway legitimately needs none, and sending `Bearer null` would be worse than nothing.
    mockFetch.mockResolvedValue(ok({ data: [{ id: 'x' }] }));

    await discoverModels('http://localhost:1234/v1', null);

    expect(mockFetch.mock.calls[0]?.[1]?.headers).toEqual({});
  });
});

describe('failure, reported as information', () => {
  it('points at the key on a 401', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });

    const result = await discoverModels('https://api.openai.com/v1', 'sk-wrong');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('API key');
  });

  it('explains a 404 as the provider not offering a list', async () => {
    // The commonest case, and the one where a scary error message would be actively misleading — nothing is
    // wrong, this provider simply does not implement the endpoint.
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });

    const result = await discoverModels('http://localhost:1234/v1', null);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('enter a name');
  });

  it('reports a server error as worth retrying', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

    const result = await discoverModels('https://example.com/v1', null);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('Try again');
  });

  it('reports an empty list as needing a manual name', async () => {
    mockFetch.mockResolvedValue(ok({ data: [] }));

    const result = await discoverModels('https://example.com/v1', null);

    expect(result.ok).toBe(false);
  });

  it('reports a network failure with its message', async () => {
    mockFetch.mockRejectedValue(new Error('Network request failed'));

    const result = await discoverModels('https://nowhere.invalid/v1', null);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('Network request failed');
  });

  it('never throws, whatever comes back', async () => {
    // This runs behind a button in settings. An exception here would surface as a crash while the user was
    // trying to configure the thing that fixes it.
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => 'nonsense' });

    await expect(discoverModels('https://example.com/v1', null)).resolves.toBeDefined();
  });
});

describe('the cache', () => {
  const provider = (overrides: Partial<Provider> = {}): Provider => ({
    id: 'p1',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    models: ['gpt-4o-mini'],
    modelsFetchedAtEpochMs: Date.now(),
    isActive: true,
    createdAtEpochMs: 1,
    hasApiKey: true,
    ...overrides,
  });

  it('treats a never-fetched provider as stale', () => {
    expect(isModelCacheStale(provider({ modelsFetchedAtEpochMs: null }))).toBe(true);
  });

  it('treats a fresh fetch as current', () => {
    // Re-fetching on every visit to settings would spend the user's bandwidth and their provider's rate limit
    // for a list that changes monthly at best.
    expect(isModelCacheStale(provider())).toBe(false);
  });

  it('treats a fetch from two days ago as stale', () => {
    const twoDays = Date.now() - 2 * 24 * 60 * 60 * 1000;

    expect(isModelCacheStale(provider({ modelsFetchedAtEpochMs: twoDays }))).toBe(true);
  });
});
