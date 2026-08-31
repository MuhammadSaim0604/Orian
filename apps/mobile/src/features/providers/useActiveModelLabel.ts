import { useEffect, useMemo } from 'react';

import { useProviderStore } from './providerStore';

/**
 * The active model's name, for the chat header's button.
 *
 * A hook rather than a store selector, because it derives a string from two fields — and a selector that
 * computed a value would allocate on every call, which under zustand v5's `Object.is` comparison is the
 * infinite-re-render trap this codebase has already hit once.
 *
 * The **name** is what appears, not the id. A person picks "Cheap" out of a list; `gpt-4o-mini-2024-07-18`
 * across a header button is unreadable and would ellipsize to `gpt-4o-mini-2…` regardless.
 */
export const useActiveModelLabel = (): string => {
  const providers = useProviderStore((state) => state.providers);
  const refresh = useProviderStore((state) => state.refresh);

  useEffect(() => {
    // The header may be the first thing mounted, before any settings screen has loaded the registry.
    if (providers.length === 0) void refresh();
  }, [providers.length, refresh]);

  return useMemo(() => {
    const active = providers.find((provider) => provider.isActive) ?? null;

    // Said plainly rather than left blank, because a button labelled with nothing gives no reason to press it —
    // and pressing it is exactly what fixes this state.
    if (active === null) return 'No model';

    if (active.model === null || active.model.trim() === '') return 'Choose model';

    const selected = active.models.find((model) => model.id === active.model);

    // The id as a fallback: a model chosen before the list was fetched has no entry to take a name from, and the
    // id is still true.
    return selected?.name ?? active.model;
  }, [providers]);
};
