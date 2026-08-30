import { NativeModules } from 'react-native';

/**
 * The AI provider registry.
 *
 * Replaces one base URL and one hand-typed model string (issue B6) with several providers, one active, and
 * models discovered from the provider itself. It lives in root settings and is shared by both modes, because
 * a provider is a root-level concern (issue A5) — Agent Mode and Workflow Mode use the same credentials and
 * neither owns them.
 *
 * ## The key is not part of a provider
 *
 * `Provider` has `hasApiKey`, never the key. Reads happen in the Keystore at request time, through
 * {@link readActiveApiKey}, which takes no argument on purpose: a function that could name any provider could
 * enumerate keys, and the only key anyone legitimately needs is the one about to be used (ADR 0007).
 *
 * The convenient mistake — putting the key on the object so an edit form can show it — is the exact thing
 * that rule forbids, so the type makes it impossible rather than discouraged.
 */

export type Provider = {
  readonly id: string;
  /** What the user calls it: "OpenAI", "my laptop". */
  readonly label: string;
  readonly baseUrl: string;
  /** The chosen model, or null when none has been picked yet. A real state the UI must handle. */
  readonly model: string | null;
  /** Discovered or manually entered model ids. */
  readonly models: readonly string[];
  readonly modelsFetchedAtEpochMs: number | null;
  readonly isActive: boolean;
  readonly createdAtEpochMs: number;
  /** Whether a key is stored. Never the key itself. */
  readonly hasApiKey: boolean;
};

type ProviderRegistryNative = {
  list: () => Promise<Provider[]>;
  getActive: () => Promise<Provider | null>;
  save: (id: string, label: string, baseUrl: string, model: string | null) => Promise<Provider>;
  setActive: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setModels: (id: string, models: readonly string[]) => Promise<void>;
  setModel: (id: string, model: string) => Promise<void>;
  setKey: (id: string, apiKey: string | null) => Promise<boolean>;
  hasKey: (id: string) => Promise<boolean>;
  getActiveKey: () => Promise<string | null>;
};

const native = ((): ProviderRegistryNative | undefined => {
  try {
    return (NativeModules as { ProviderRegistry?: ProviderRegistryNative }).ProviderRegistry;
  } catch {
    return undefined;
  }
})();

export const isProviderRegistryAvailable = (): boolean => native !== undefined;

/**
 * A starting point for a new provider.
 *
 * OpenAI because it is the reference implementation of the protocol. The whole point of ADR 0007 is that a
 * local gateway on `http://localhost:1234/v1` works identically with no code change, which is also why the
 * base URL is a plain editable field rather than a picker of blessed vendors.
 */
export const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

const newId = (): string =>
  `provider_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const listProviders = async (): Promise<readonly Provider[]> => {
  if (native === undefined) return [];

  try {
    return await native.list();
  } catch {
    // An unreadable registry must not stop settings from opening — that is where the user would go to fix it.
    return [];
  }
};

export const activeProvider = async (): Promise<Provider | null> => {
  if (native === undefined) return null;

  try {
    return await native.getActive();
  } catch {
    return null;
  }
};

/**
 * Adds or updates a provider.
 *
 * Non-secret fields only. The key is a separate call, so no code path exists in which a provider record and a
 * credential travel together.
 */
export const saveProvider = async (input: {
  readonly id?: string;
  readonly label: string;
  readonly baseUrl: string;
  readonly model?: string | null;
}): Promise<Provider | null> => {
  if (native === undefined) return null;

  const id = input.id ?? newId();

  try {
    return await native.save(
      id,
      input.label.trim(),
      // Trailing slashes removed here rather than at request time: `${baseUrl}/models` with a trailing slash
      // gives a double slash, which some gateways 404 on. Fixing it once at the edge beats every call site
      // remembering.
      input.baseUrl.trim().replace(/\/+$/, ''),
      input.model ?? null,
    );
  } catch {
    return null;
  }
};

export const setActiveProvider = async (id: string): Promise<void> => {
  try {
    await native?.setActive(id);
  } catch {
    // The list re-reads and shows the truth either way.
  }
};

/** Deletes a provider and its key. */
export const deleteProvider = async (id: string): Promise<void> => {
  try {
    await native?.remove(id);
  } catch {
    // As above.
  }
};

export const setProviderModel = async (id: string, model: string): Promise<void> => {
  try {
    await native?.setModel(id, model);
  } catch {
    // As above.
  }
};

export const setProviderModels = async (id: string, models: readonly string[]): Promise<void> => {
  try {
    await native?.setModels(id, models);
  } catch {
    // As above.
  }
};

/**
 * Stores a provider's key.
 *
 * Resolves false when the Keystore refused, so the UI can say the key was not saved. Silently succeeding
 * would leave the user believing they had configured a provider and discovering otherwise mid-run.
 */
export const setProviderKey = async (id: string, apiKey: string): Promise<boolean> => {
  if (native === undefined) return false;

  try {
    return await native.setKey(id, apiKey.trim() === '' ? null : apiKey.trim());
  } catch {
    return false;
  }
};

/**
 * Reads the active provider's key.
 *
 * Called by the provider client immediately before a request, and nowhere else. Never held in React state,
 * never rendered, never logged, never placed in a prompt.
 *
 * Returns null rather than an empty string when there is none, because null means "not configured" and the
 * agent has to tell that apart from a local gateway that legitimately needs no key.
 */
export const readActiveApiKey = async (): Promise<string | null> => {
  if (native === undefined) return null;

  try {
    return await native.getActiveKey();
  } catch {
    return null;
  }
};

/**
 * Fetches the models a provider offers.
 *
 * `GET {baseUrl}/models`, the OpenAI-compatible shape: `{ data: [{ id }] }`. Some providers do not implement
 * it, some return a bare array, and some need a key for it — so **failure is expected and is not an error
 * state**. The step file is explicit: manual entry is a first-class path, never a fallback the user is pushed
 * into by a red message.
 *
 * The key is read here at call time and used only for this request. It is not returned, stored, or logged.
 */
export type DiscoveryResult =
  | { readonly ok: true; readonly models: readonly string[] }
  | { readonly ok: false; readonly reason: string };

export const discoverModels = async (
  baseUrl: string,
  apiKey: string | null,
): Promise<DiscoveryResult> => {
  const url = `${baseUrl.trim().replace(/\/+$/, '')}/models`;

  // A timeout, because a wrong base URL otherwise hangs until the platform gives up — which on a phone can
  // be a minute of a spinner with no explanation.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), DISCOVERY_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: apiKey === null ? {} : { Authorization: `Bearer ${apiKey}` },
      signal: abort.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        // The status is the useful part: 401 means the key, 404 means the provider does not implement it, and
        // those lead to different actions.
        reason: `The provider answered ${response.status}. ${describeStatus(response.status)}`,
      };
    }

    const models = extractModelIds(await response.json());

    if (models.length === 0) {
      return { ok: false, reason: 'The provider returned no models. Enter a model name instead.' };
    }

    return { ok: true, models };
  } catch (error) {
    if (abort.signal.aborted) {
      return { ok: false, reason: 'The provider did not answer in time. Check the base URL.' };
    }

    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Could not reach the provider.',
    };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Pulls model ids out of whatever shape came back.
 *
 * Three shapes tolerated because all three exist in the wild: the OpenAI `{ data: [{ id }] }`, a bare array
 * of objects, and a bare array of strings. Being lenient here is the difference between a local gateway
 * working and the user being told to type model names by hand for no good reason.
 */
const extractModelIds = (payload: unknown): readonly string[] => {
  const rows = Array.isArray(payload)
    ? payload
    : typeof payload === 'object' &&
        payload !== null &&
        Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : [];

  const ids: string[] = [];

  for (const row of rows) {
    if (typeof row === 'string' && row.trim() !== '') {
      ids.push(row);
      continue;
    }

    if (typeof row === 'object' && row !== null) {
      const id = (row as { id?: unknown }).id;
      if (typeof id === 'string' && id.trim() !== '') ids.push(id);
    }
  }

  // Sorted, because provider order is arbitrary and a user scanning for "gpt-4o" in a list of two hundred
  // wants it findable. De-duplicated because some gateways list a model under several aliases.
  return [...new Set(ids)].sort((left, right) => left.localeCompare(right));
};

const describeStatus = (status: number): string => {
  if (status === 401 || status === 403) return 'Check the API key.';
  if (status === 404) return 'This provider may not offer a model list — enter a name instead.';
  if (status >= 500) return 'The provider had a problem. Try again, or enter a name.';
  return 'Enter a model name instead.';
};

/** Ten seconds. Long enough for a slow gateway, short enough that a wrong URL fails while the user waits. */
const DISCOVERY_TIMEOUT_MS = 10_000;

/**
 * How long a cached model list stays fresh.
 *
 * A day. Model lists change rarely, and re-fetching on every visit to settings would spend the user's
 * bandwidth and their provider's rate limit for almost never any change.
 */
export const MODEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const isModelCacheStale = (provider: Provider): boolean =>
  provider.modelsFetchedAtEpochMs === null ||
  Date.now() - provider.modelsFetchedAtEpochMs > MODEL_CACHE_TTL_MS;
