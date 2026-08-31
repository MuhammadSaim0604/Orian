import { create } from 'zustand';

import {
  type Provider,
  type ProviderModel,
  activeProvider,
  changeModelId,
  deleteProvider,
  discoverModels,
  isModelCacheStale,
  listProviders,
  mergeModels,
  readActiveApiKey,
  removeModel,
  renameModel,
  saveProvider,
  setActiveProvider,
  setProviderKey,
  setProviderModel,
  setProviderModels,
} from './providerRegistry';

/**
 * Provider registry state, shared by both modes.
 *
 * A module store rather than screen state, because the same registry is read from root settings, from each
 * mode's settings, from the chat's model picker, and by the run controller at the moment a run starts. Four
 * readers, one truth.
 *
 * Nothing here ever holds an API key. `hasApiKey` on each provider is as close as this state comes to one.
 */

export type DiscoveryState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'fetching'; readonly providerId: string }
  /** Discovery failed. Not an error state in the UI — manual entry is a first-class path. */
  | { readonly kind: 'unavailable'; readonly providerId: string; readonly reason: string };

export type ProviderRegistryState = {
  readonly providers: readonly Provider[];
  readonly loading: boolean;
  readonly discovery: DiscoveryState;
};

export type ProviderRegistryActions = {
  refresh: () => Promise<void>;
  save: (input: {
    readonly id?: string;
    readonly label: string;
    readonly baseUrl: string;
    readonly model?: string | null;
    /** Written to the Keystore, never kept. Omitted leaves any existing key untouched. */
    readonly apiKey?: string;
  }) => Promise<{ readonly ok: boolean; readonly keyStored: boolean; readonly id: string | null }>;
  activate: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  chooseModel: (id: string, modelId: string) => Promise<void>;
  /** Fetches the model list from the provider. Records failure without treating it as an error. */
  discover: (provider: Provider) => Promise<void>;
  /** Adds a model the user typed, for providers that do not implement `/models`. */
  addModel: (id: string, model: ProviderModel) => Promise<void>;
  /** Renames a model without touching its id. */
  renameModel: (providerId: string, modelId: string, name: string) => Promise<void>;
  /** Corrects a model's id, keeping its name. */
  editModelId: (providerId: string, modelId: string, nextId: string) => Promise<void>;
  deleteModel: (providerId: string, modelId: string) => Promise<void>;
  resetForTests: () => void;
};

const INITIAL: ProviderRegistryState = {
  providers: [],
  loading: false,
  discovery: { kind: 'idle' },
};

export const useProviderStore = create<ProviderRegistryState & ProviderRegistryActions>(
  (set, get) => ({
    ...INITIAL,

    refresh: async () => {
      set({ loading: true });
      const providers = await listProviders();
      set({ providers, loading: false });
    },

    save: async ({ id, label, baseUrl, model, apiKey }) => {
      const saved = await saveProvider({ id, label, baseUrl, model });

      if (saved === null) return { ok: false, keyStored: false, id: null };

      // The key goes second and separately, so the row exists before anything tries to associate a credential
      // with it — and so a failed key write leaves a usable provider the user can retry the key on.
      let keyStored = true;
      if (apiKey !== undefined && apiKey.trim() !== '') {
        keyStored = await setProviderKey(saved.id, apiKey);
      }

      await get().refresh();

      return { ok: true, keyStored, id: saved.id };
    },

    activate: async (id) => {
      // Optimistic, because switching provider is a single tap whose effect should be immediate. Exactly one
      // active provider is the invariant, enforced in a transaction on the Kotlin side; mirroring it here
      // keeps the UI honest between the tap and the re-read.
      set((state) => ({
        providers: state.providers.map((provider) => ({
          ...provider,
          isActive: provider.id === id,
        })),
      }));

      await setActiveProvider(id);
      await get().refresh();
    },

    remove: async (id) => {
      await deleteProvider(id);
      await get().refresh();
    },

    chooseModel: async (id, modelId) => {
      set((state) => ({
        providers: state.providers.map((provider) =>
          provider.id === id ? { ...provider, model: modelId } : provider,
        ),
      }));

      await setProviderModel(id, modelId);
    },

    discover: async (provider) => {
      set({ discovery: { kind: 'fetching', providerId: provider.id } });

      // Read at call time and used only for this request. Only the active provider's key is readable, which
      // is why discovery for a non-active provider goes out unauthenticated — most `/models` endpoints allow
      // that, and the ones that do not produce a 401 the UI explains rather than a silent failure.
      const apiKey = provider.isActive ? await readActiveApiKey() : null;

      const result = await discoverModels(provider.baseUrl, apiKey);

      if (!result.ok) {
        set({ discovery: { kind: 'unavailable', providerId: provider.id, reason: result.reason } });
        return;
      }

      // Merged rather than replaced, so a name the user wrote survives a re-fetch — and re-fetching is routine,
      // since the cache has a TTL.
      const merged = mergeModels(provider.models, result.models);

      await setProviderModels(provider.id, merged);

      // A provider with no model chosen gets the first discovered one, so the common case needs no second
      // tap. Never overrides an existing choice: a user who picked a cheaper model must not have it silently
      // replaced by whatever the provider happens to list first.
      if (provider.model === null && merged[0] !== undefined) {
        await setProviderModel(provider.id, merged[0].id);
      }

      set({ discovery: { kind: 'idle' } });
      await get().refresh();
    },

    addModel: async (id, model) => {
      const trimmedId = model.id.trim();
      if (trimmedId === '') return;

      const provider = get().providers.find((candidate) => candidate.id === id);
      if (provider === undefined) return;

      const name = model.name.trim() === '' ? trimmedId : model.name.trim();

      // Merged into the stored list rather than replacing it, and stored the same way a discovered list is — so
      // a manually entered model is a first-class citizen rather than a special case the UI has to remember.
      const models = provider.models.some((candidate) => candidate.id === trimmedId)
        ? provider.models.map((candidate) =>
            candidate.id === trimmedId ? { id: trimmedId, name } : candidate,
          )
        : [...provider.models, { id: trimmedId, name }];

      await setProviderModels(id, models);
      await setProviderModel(id, trimmedId);
      await get().refresh();
    },

    renameModel: async (providerId, modelId, name) => {
      const provider = get().providers.find((candidate) => candidate.id === providerId);
      if (provider === undefined) return;

      await setProviderModels(providerId, renameModel(provider.models, modelId, name));
      await get().refresh();
    },

    editModelId: async (providerId, modelId, nextId) => {
      const provider = get().providers.find((candidate) => candidate.id === providerId);
      if (provider === undefined) return;

      const models = changeModelId(provider.models, modelId, nextId);
      await setProviderModels(providerId, models);

      // The selected model follows its id, or the provider would be left pointing at a model that no longer
      // exists — and that failure would arrive mid-run rather than here.
      if (provider.model === modelId) {
        const renamed = models.find((candidate) => candidate.id === nextId.trim());
        if (renamed !== undefined) await setProviderModel(providerId, renamed.id);
      }

      await get().refresh();
    },

    deleteModel: async (providerId, modelId) => {
      const provider = get().providers.find((candidate) => candidate.id === providerId);
      if (provider === undefined) return;

      const models = removeModel(provider.models, modelId);
      await setProviderModels(providerId, models);

      // Deleting the selected model has to leave a valid selection. The first remaining one, because leaving
      // the provider with a model that is gone would fail at the start of the next run.
      if (provider.model === modelId && models[0] !== undefined) {
        await setProviderModel(providerId, models[0].id);
      }

      await get().refresh();
    },

    resetForTests: () => set({ ...INITIAL }),
  }),
);

/** Identity-stable selectors only. Derived collections belong in hooks (see the zustand v5 note elsewhere). */
export const selectProviders = (state: ProviderRegistryState): readonly Provider[] =>
  state.providers;

export const selectDiscovery = (state: ProviderRegistryState): DiscoveryState => state.discovery;

/**
 * The provider a run will use, as the caller needs to know it.
 *
 * Deliberately a plain async function rather than store state: the run controller reads it at the moment a
 * run starts, and reading through a React store would tie the run's configuration to whether a component
 * happened to have refreshed.
 */
export type RunnableProvider = {
  readonly baseUrl: string;
  readonly model: string;
  readonly hasApiKey: boolean;
};

export type ProviderReadiness =
  | { readonly ok: true; readonly provider: RunnableProvider }
  | { readonly ok: false; readonly reason: string };

/**
 * Whether a run can start, and why not.
 *
 * Three distinct failures with three distinct fixes, kept apart because "cannot start" with no explanation is
 * the single most frustrating thing this screen could say.
 */
export const readRunnableProvider = async (): Promise<ProviderReadiness> => {
  const provider = await activeProvider();

  if (provider === null) {
    return { ok: false, reason: 'Add an AI provider in settings before running the agent.' };
  }

  if (provider.model === null || provider.model.trim() === '') {
    return {
      ok: false,
      reason: `Choose a model for ${provider.label} in settings.`,
    };
  }

  if (!provider.hasApiKey) {
    return {
      ok: false,
      // Named, because a user with three providers configured needs to know which one is short of a key.
      reason: `Add an API key for ${provider.label} in settings.`,
    };
  }

  return {
    ok: true,
    provider: {
      baseUrl: provider.baseUrl,
      model: provider.model,
      hasApiKey: true,
    },
  };
};

/** Providers whose cached model list is old enough to be worth re-fetching. */
export const staleProviders = (providers: readonly Provider[]): readonly Provider[] =>
  providers.filter(isModelCacheStale);
