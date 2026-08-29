import { useMemo } from 'react';

import { type Capability, type CapabilityId } from './capabilities';
import { type CapabilityState, useCapabilityStore } from './capabilityStore';

/**
 * Derived views of the capability list.
 *
 * These exist as hooks rather than store selectors for a reason that cost real time to find: a
 * selector returning `state.capabilities.filter(...)` produces a **new array on every call**, and
 * zustand v5 compares snapshots with `Object.is`. Subscribing to one therefore re-renders forever —
 * which presents as the app or the test runner simply hanging, with no error.
 *
 * So components subscribe to the raw array, whose reference is stable, and derive from it with
 * `useMemo`. The plain functions in `capabilityStore` remain for tests and non-React callers, where
 * calling them once is safe.
 */

const useCapabilityList = (): readonly Capability[] =>
  useCapabilityStore((state: CapabilityState) => state.capabilities);

export const useRequiredCapabilities = (): readonly Capability[] => {
  const capabilities = useCapabilityList();

  return useMemo(
    () => capabilities.filter((capability) => capability.tier === 'required'),
    [capabilities],
  );
};

export const useOptionalCapabilities = (): readonly Capability[] => {
  const capabilities = useCapabilityList();

  return useMemo(
    () => capabilities.filter((capability) => capability.tier === 'optional'),
    [capabilities],
  );
};

export const useMissingRequiredCapabilities = (): readonly Capability[] => {
  const capabilities = useCapabilityList();

  return useMemo(
    () =>
      capabilities.filter((capability) => capability.tier === 'required' && !capability.granted),
    [capabilities],
  );
};

/**
 * Whether onboarding can continue.
 *
 * A boolean, so it can be subscribed to directly — `Object.is` compares booleans by value, which is
 * exactly why this one is safe as a selector while the array views are not.
 *
 * **False while the list is empty**, which is the honest answer rather than a permissive one: an
 * empty list means nothing has been read yet, not that everything is granted. The other way round
 * would walk a user straight past the permission screen on a slow first load.
 */
export const useRequiredCapabilitiesGranted = (): boolean =>
  useCapabilityStore((state: CapabilityState) => {
    const required = state.capabilities.filter((capability) => capability.tier === 'required');
    return required.length > 0 && required.every((capability) => capability.granted);
  });

export const useIsCapabilityGranted = (id: CapabilityId): boolean =>
  useCapabilityStore((state: CapabilityState) =>
    state.capabilities.some((capability) => capability.id === id && capability.granted),
  );
