import { useMemo } from 'react';

import { type SessionSummary } from './sessionStorage';
import { type SessionState, useSessionStore } from './sessionStore';

/**
 * Derived views of the session list.
 *
 * Hooks rather than store selectors, and that is not a stylistic choice: zustand v5 compares snapshots with
 * `Object.is`, so a selector that builds a new array with `.filter()` or `.map()` never matches its previous
 * result and the subscribing component re-renders forever. The symptom is the app freezing, or a Jest run
 * hanging with no failure output — which is how it was found in Step 2.
 *
 * So each hook subscribes to a stable slice and derives inside `useMemo`. Same pattern as
 * `features/permissions/useCapabilityViews.ts`.
 */

/** The open session, or null. */
export const useActiveSession = (): SessionSummary | null => {
  const sessions = useSessionStore(selectSessions);
  const activeId = useSessionStore(selectActiveId);

  return useMemo(
    () => sessions.find((session) => session.id === activeId) ?? null,
    [activeId, sessions],
  );
};

/**
 * Sessions grouped by age, for a sidebar that reads like a history rather than a list of timestamps.
 *
 * Today / Earlier this week / Older, because "3 days ago" is something a person has to decode while a
 * heading they can skim is not.
 */
export type SessionGroup = {
  readonly label: string;
  readonly sessions: readonly SessionSummary[];
};

export const useGroupedSessions = (): readonly SessionGroup[] => {
  const sessions = useSessionStore(selectSessions);

  return useMemo(() => {
    const now = Date.now();

    const today: SessionSummary[] = [];
    const week: SessionSummary[] = [];
    const older: SessionSummary[] = [];

    for (const session of sessions) {
      const age = now - session.updatedAtEpochMs;

      if (age < DAY_MS) today.push(session);
      else if (age < WEEK_MS) week.push(session);
      else older.push(session);
    }

    // Empty groups are dropped rather than shown empty: a heading with nothing under it is noise in a
    // narrow sidebar.
    return [
      { label: 'Today', sessions: today },
      { label: 'Earlier this week', sessions: week },
      { label: 'Older', sessions: older },
    ].filter((group) => group.sessions.length > 0);
  }, [sessions]);
};

/** Whether there is a conversation to type into. False only in the moment before the first is created. */
export const useHasSession = (): boolean => useSessionStore(selectActiveId) !== null;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const selectSessions = (state: SessionState): readonly SessionSummary[] => state.sessions;

const selectActiveId = (state: SessionState): string | null => state.activeSessionId;
