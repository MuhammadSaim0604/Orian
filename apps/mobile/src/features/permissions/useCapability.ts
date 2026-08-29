import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';

import {
  type Capability,
  type CapabilityId,
  type RequestOutcome,
  onCapabilitiesChanged,
} from './capabilities';
import { type CapabilityState, selectCapability, useCapabilityStore } from './capabilityStore';

/**
 * Keeps capability state current.
 *
 * Mounted once, high in the tree. Two things keep the snapshot honest, and both are needed:
 *
 * - **The native change event**, for a runtime prompt resolving or a capture session ending.
 * - **App resume**, for everything granted in system settings. Four of the five required
 *   capabilities can only be granted there, and Android gives no callback — the only moment the app
 *   can learn the answer is when it comes back to the foreground.
 *
 * Without the resume listener the user grants accessibility, returns, and the app still says it is
 * off. That is the single most likely way this feature would appear broken.
 */
export const useCapabilityWatcher = (): void => {
  const load = useCapabilityStore((state) => state.load);
  const refresh = useCapabilityStore((state) => state.refresh);
  const apply = useCapabilityStore((state) => state.apply);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const subscription = onCapabilitiesChanged(apply);
    return () => subscription.remove();
  }, [apply]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') void refresh();
    });

    return () => subscription.remove();
  }, [refresh]);
};

export type CapabilityHandle = {
  readonly capability: Capability | undefined;
  readonly granted: boolean;
  readonly requesting: boolean;
  /** True when the user has been sent to Settings and has not come back with it granted. */
  readonly awaitingSettings: boolean;
  request: () => Promise<RequestOutcome>;
  openSettings: () => Promise<void>;
};

/**
 * One capability, for the just-in-time path.
 *
 * This is what a node palette or a tool toggle uses: ask for the capability at the moment something
 * needs it, rather than up front. Subscribes narrowly so a screen watching contacts does not
 * re-render when the overlay permission changes.
 */
export const useCapability = (id: CapabilityId): CapabilityHandle => {
  const capability = useCapabilityStore(selectCapability(id));
  const requesting = useCapabilityStore((state) => state.requesting === id);
  const awaitingSettings = useCapabilityStore((state) => state.awaitingSettings.includes(id));

  const requestAction = useCapabilityStore((state) => state.request);
  const openSettingsAction = useCapabilityStore((state) => state.openSettings);

  const request = useCallback(() => requestAction(id), [id, requestAction]);
  const openSettings = useCallback(() => openSettingsAction(id), [id, openSettingsAction]);

  return {
    capability,
    granted: capability?.granted ?? false,
    requesting,
    awaitingSettings,
    request,
    openSettings,
  };
};

/**
 * Requests a capability and reports whether the caller may proceed.
 *
 * The distinction that matters: a settings grant means "not yet", not "no". Returning false for it
 * lets a caller add the node anyway with a warning, rather than treating a user who is mid-grant as
 * having refused.
 */
export const useEnsureCapability = (): ((id: CapabilityId) => Promise<boolean>) => {
  const request = useCapabilityStore((state) => state.request);
  const capabilities = useCapabilityStore((state) => state.capabilities);

  return useCallback(
    async (id) => {
      const existing = capabilities.find((capability) => capability.id === id);
      if (existing?.granted === true) return true;

      const outcome = await request(id);
      return outcome === 'granted';
    },
    [capabilities, request],
  );
};

/** Selector re-export, so a screen needing the whole list does not import the store directly. */
export const useCapabilities = (): readonly Capability[] =>
  useCapabilityStore((state: CapabilityState) => state.capabilities);
