import { type AgentEvent, type AgentRunResult } from '@mobile-automation/ai-agent';
import { type ExecutionTrace } from '@mobile-automation/execution-recorder';
import { useCallback, useEffect, useState } from 'react';

import {
  type RunSnapshot,
  type RunState,
  clearFollowUp,
  queueFollowUp,
  readRun,
  resetRun,
  startRun,
  stopRun,
  subscribeToRun,
} from './runController';

/**
 * A view onto the run.
 *
 * Deliberately thin. The run lives in `runController`, a module (ADR 0016), and this hook only
 * subscribes — **it does not own anything and it does not clean anything up**. That absence is the
 * fix for issue B1: the previous version aborted the run in its unmount effect, so leaving the screen
 * killed the agent, which is precisely when the agent is meant to be working.
 *
 * Mount it in as many places as needed. The chat, the overlay, and a status strip can all use it and
 * all see the same run.
 */

export type { RunState };

export type AgentActivity = {
  readonly runState: RunState;
  /** Identifies the run, so an overlay bound to an older one can notice. */
  readonly runId: string | null;
  readonly goal: string;
  /** What the agent is doing right now, in the user's terms. */
  readonly currentTask: string;
  readonly events: readonly AgentEvent[];
  readonly result: AgentRunResult | null;
  readonly configError: string | null;
  readonly trace: ExecutionTrace | null;
  /** An instruction waiting to run as the next goal, or null. */
  readonly queuedFollowUp: string | null;
  /** False when the run will pause if the app is backgrounded. Worth telling the user before they leave. */
  readonly timersHeld: boolean;
  start: (goal: string) => void;
  stop: () => void;
  reset: () => void;
  /** Queues an instruction to run when the current run ends. */
  queue: (instruction: string) => void;
  clearQueued: () => void;
};

export const useAgentRun = (): AgentActivity => {
  // Seeded from the controller rather than from empty state, so a screen mounted while a run is
  // already in progress shows it immediately — with its history — instead of looking idle for a
  // frame. That is the "reconnection" requirement in Step 3.
  const [snapshot, setSnapshot] = useState<RunSnapshot>(readRun);

  useEffect(() => {
    // Re-read on subscribe: a run may have progressed between the initial render and this effect.
    setSnapshot(readRun());

    return subscribeToRun(setSnapshot);
  }, []);

  const start = useCallback((goal: string) => {
    startRun(goal);
  }, []);

  return {
    runState: snapshot.runState,
    runId: snapshot.runId,
    goal: snapshot.goal,
    currentTask: snapshot.currentTask,
    events: snapshot.events,
    result: snapshot.result,
    configError: snapshot.configError,
    trace: snapshot.trace,
    queuedFollowUp: snapshot.queuedFollowUp,
    timersHeld: snapshot.timersHeld,
    start,
    stop: stopRun,
    reset: resetRun,
    queue: queueFollowUp,
    clearQueued: clearFollowUp,
  };
};
