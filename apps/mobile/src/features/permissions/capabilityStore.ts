import { create } from 'zustand';

import {
  type Capability,
  type CapabilityId,
  type RequestOutcome,
  arePermissionsAvailable,
  openSettingsFor,
  readCapabilities,
  refreshCapabilities,
  requestCapability,
} from './capabilities';

/**
 * Capability state, shared across the app.
 *
 * A store rather than a hook's local state, for two reasons that both matter here. Several screens
 * need the same answer at once — onboarding, root settings, the node palette, and Step 4's tools page
 * — and re-reading per screen would mean four native round trips for one truth. And the overlay
 * windows are separate React roots that reach app state only through store modules they import, so a
 * capability check from an overlay has to live somewhere they can see.
 *
 * The store holds a **snapshot**, refreshed deliberately. Nothing here caches across a request or a
 * resume: `refresh()` always goes to the platform.
 */

export type CapabilityState = {
  readonly capabilities: readonly Capability[];
  readonly loading: boolean;
  /** The capability currently being requested, so one button can show progress. */
  readonly requesting: CapabilityId | null;
  /**
   * Capabilities whose grant the user was sent to Settings for.
   *
   * Tracked because a settings grant has no callback: the UI needs to know it is waiting on a round
   * trip so it can say "come back when you have allowed it" rather than appearing to hang.
   */
  readonly awaitingSettings: readonly CapabilityId[];
  /** Set when a request could not even be started. */
  readonly error: string | null;
};

export type CapabilityActions = {
  load: () => Promise<void>;
  /** Re-reads from the platform. Called on app resume and after returning from Settings. */
  refresh: () => Promise<void>;
  request: (id: CapabilityId) => Promise<RequestOutcome>;
  openSettings: (id: CapabilityId) => Promise<void>;
  /** Replaces the snapshot from the native change event. */
  apply: (capabilities: readonly Capability[]) => void;
  reset: () => void;
};

const initialState = (): CapabilityState => ({
  capabilities: [],
  loading: false,
  requesting: null,
  awaitingSettings: [],
  error: null,
});

export const useCapabilityStore = create<CapabilityState & CapabilityActions>((set, get) => ({
  ...initialState(),

  load: async () => {
    if (get().loading) return;

    set({ loading: true, error: null });

    const capabilities = await readCapabilities();

    set({
      capabilities,
      loading: false,
      error:
        capabilities.length === 0 && !arePermissionsAvailable()
          ? 'Permissions cannot be read in this build.'
          : null,
    });
  },

  refresh: async () => {
    const capabilities = await refreshCapabilities();

    set((state) => ({
      capabilities,
      // A capability that is now granted is no longer awaited. Clearing on the value rather than on
      // the return from Settings is what makes this correct when the user granted it some other way
      // — from a notification, say, or in a previous session.
      awaitingSettings: state.awaitingSettings.filter(
        (id) => !capabilities.some((capability) => capability.id === id && capability.granted),
      ),
    }));
  },

  request: async (id) => {
    set({ requesting: id, error: null });

    const outcome = await requestCapability(id);

    set((state) => ({
      requesting: null,
      awaitingSettings:
        outcome === 'settings_opened' && !state.awaitingSettings.includes(id)
          ? [...state.awaitingSettings, id]
          : state.awaitingSettings,
      error:
        outcome === 'unsupported' ? 'That permission cannot be requested on this device.' : null,
    }));

    // A runtime prompt has already resolved by now, so the snapshot is stale. A settings grant has
    // not, and refreshing is harmless — it simply reports the same state until the user returns.
    await get().refresh();

    return outcome;
  },

  openSettings: async (id) => {
    const opened = await openSettingsFor(id);

    set((state) => ({
      awaitingSettings:
        opened && !state.awaitingSettings.includes(id)
          ? [...state.awaitingSettings, id]
          : state.awaitingSettings,
      error: opened ? null : 'That settings page could not be opened on this device.',
    }));
  },

  apply: (capabilities) =>
    set((state) => ({
      capabilities,
      awaitingSettings: state.awaitingSettings.filter(
        (id) => !capabilities.some((capability) => capability.id === id && capability.granted),
      ),
    })),

  reset: () => set(initialState()),
}));

// --- selectors ----------------------------------------------------------------

export const selectCapability =
  (id: CapabilityId): ((state: CapabilityState) => Capability | undefined) =>
  (state) =>
    state.capabilities.find((capability) => capability.id === id);

export const selectRequired = (state: CapabilityState): readonly Capability[] =>
  state.capabilities.filter((capability) => capability.tier === 'required');

export const selectOptional = (state: CapabilityState): readonly Capability[] =>
  state.capabilities.filter((capability) => capability.tier === 'optional');

export const selectMissingRequired = (state: CapabilityState): readonly Capability[] =>
  state.capabilities.filter((capability) => capability.tier === 'required' && !capability.granted);

/**
 * Whether onboarding can continue.
 *
 * **False while the snapshot is empty**, which is the honest answer rather than a permissive one: an
 * empty list means nothing has been read yet, not that everything is granted. Getting this the wrong
 * way round would let a user straight past the permission screen on a slow first load.
 */
export const selectRequiredGranted = (state: CapabilityState): boolean => {
  const required = selectRequired(state);
  return required.length > 0 && required.every((capability) => capability.granted);
};

export const selectIsGranted =
  (id: CapabilityId): ((state: CapabilityState) => boolean) =>
  (state) =>
    state.capabilities.some((capability) => capability.id === id && capability.granted);
