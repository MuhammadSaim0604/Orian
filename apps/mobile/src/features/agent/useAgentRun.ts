import {
  type AgentEvent,
  type AgentRunResult,
  createChatCompletionsProvider,
  runAgent,
} from '@mobile-automation/ai-agent';
import { ExecutionRecorder, type ExecutionTrace } from '@mobile-automation/execution-recorder';
import { invokeTool } from '@mobile-automation/native-automation';
import { type Observation } from '@mobile-automation/prompt-engine';
import { useCallback, useEffect, useRef, useState } from 'react';

import { saveTrace } from '../recorder/traceStorage';

import { loadProviderSettings, readApiKey } from './providerSettings';

/**
 * Drives an agent run from the UI, and records it.
 *
 * Three things this hook exists to get right.
 *
 * **The key is read per request, not held.** `createChatCompletionsProvider` takes a
 * function, and that function goes straight to the Keystore - so the credential never
 * enters React state where it could be captured by a devtools snapshot or a crash report
 * (ADR 0007).
 *
 * **Cancellation is real.** The user watching their own phone being driven must be able to
 * stop it, and stopping has to take effect between steps rather than after the agent
 * finishes whatever it planned. The `AbortController` is threaded through the loop, and
 * the loop checks it before every step.
 *
 * **Recording is automatic.** Every run is recorded, because the decision to keep a run as a
 * workflow is one the user makes *after* watching it succeed - asking them to opt in
 * beforehand would mean the interesting runs are the ones that were not recorded.
 */

export type AgentRunState = 'idle' | 'running' | 'finished';

export type AgentActivity = {
  readonly runState: AgentRunState;
  readonly events: readonly AgentEvent[];
  readonly result: AgentRunResult | null;
  /** A configuration problem, distinct from a failed run. */
  readonly configError: string | null;
  /** The recording of the finished run, ready to compile into a workflow. */
  readonly trace: ExecutionTrace | null;
  start: (goal: string) => void;
  stop: () => void;
  reset: () => void;
};

/** Cap on retained events, so a long run cannot grow the list without bound. */
const MAX_RETAINED_EVENTS = 200;

/**
 * Reads the current screen for the agent.
 *
 * The compact tree, because the full tree of a busy screen is tens of thousands of tokens
 * and the omitted fields carry no information the model can use.
 */
const observeScreen = async (): Promise<Observation> => {
  const [screen, tree] = await Promise.all([
    invokeTool('getCurrentScreen', {}) as Promise<{
      packageName: string | null;
      activityName: string | null;
    }>,
    invokeTool('getUiTree', { compact: true }),
  ]);

  return {
    packageName: screen.packageName,
    activityName: screen.activityName,
    uiTree: tree,
  };
};

export const useAgentRun = (): AgentActivity => {
  const [runState, setRunState] = useState<AgentRunState>('idle');
  const [events, setEvents] = useState<readonly AgentEvent[]>([]);
  const [result, setResult] = useState<AgentRunResult | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [trace, setTrace] = useState<ExecutionTrace | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // One recorder for the hook's lifetime. It holds no state between runs - `start` clears it -
  // and keeping it in a ref means an event arriving during a re-render still lands.
  const recorderRef = useRef(new ExecutionRecorder());

  useEffect(
    () => () => {
      mountedRef.current = false;
      // Abort on unmount, or a run would keep driving the device after its screen is
      // gone - with nothing left to show the user what is happening.
      controllerRef.current?.abort();
    },
    [],
  );

  const start = useCallback((goal: string) => {
    if (goal.trim() === '') return;

    const controller = new AbortController();
    controllerRef.current = controller;

    setRunState('running');
    setEvents([]);
    setResult(null);
    setConfigError(null);
    setTrace(null);
    recorderRef.current.reset();

    void (async () => {
      try {
        const settings = await loadProviderSettings();

        if (!settings.hasApiKey) {
          setConfigError('Add an AI provider key in settings before running the agent.');
          setRunState('idle');
          return;
        }

        const provider = createChatCompletionsProvider({
          baseUrl: settings.baseUrl,
          model: settings.model,
          // Read at call time, from the Keystore. Never stored here.
          apiKey: readApiKey,
        });

        const runResult = await runAgent(
          {
            provider,
            tools: {
              isAvailable: true,
              invoke: invokeTool,
            },
            observe: observeScreen,
          },
          {
            goal: goal.trim(),
            signal: controller.signal,
            onEvent: (event) => {
              // The recorder is fed first and unconditionally: it must see every step even
              // if the screen has gone, or the trace would be missing the tail of the run.
              feedRecorder(recorderRef.current, event, settings.model);

              if (!mountedRef.current) return;

              setEvents((current) =>
                current.length >= MAX_RETAINED_EVENTS
                  ? [...current.slice(1), event]
                  : [...current, event],
              );
            },
          },
        );

        const recorded = recorderRef.current.result;

        // Persisted regardless of outcome. A failed run is often the more interesting
        // recording, and it is also the one a user wants to look at.
        if (recorded !== null && recorded.steps.length > 0) {
          await saveTrace(recorded).catch(() => false);
        }

        if (!mountedRef.current) return;

        setResult(runResult);
        setTrace(recorded);
        setRunState('finished');
      } catch (error) {
        if (!mountedRef.current) return;

        // A thrown error from runAgent means a provider misconfiguration - an ordinary
        // failed run comes back in the result instead.
        setConfigError(error instanceof Error ? error.message : 'The agent could not start.');
        setRunState('idle');
      }
    })();
  }, []);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    recorderRef.current.reset();
    setRunState('idle');
    setEvents([]);
    setResult(null);
    setConfigError(null);
    setTrace(null);
  }, []);

  return { runState, events, result, configError, trace, start, stop, reset };
};

/**
 * Routes an agent event into the recorder.
 *
 * Three of the nine event types matter to a recording; the rest are UI narration. Kept as a
 * function here rather than inside the recorder so the recorder stays independent of the
 * agent's event union - which is what lets it be tested against a plain object.
 */
const feedRecorder = (recorder: ExecutionRecorder, event: AgentEvent, model: string): void => {
  switch (event.type) {
    case 'runStarted':
      recorder.start({
        runId: event.runId,
        goal: event.goal,
        model,
        timestampEpochMs: event.timestampEpochMs,
      });
      return;

    case 'toolExecuted':
      recorder.record(event);
      return;

    case 'runFinished':
      recorder.finish({
        outcome: event.outcome,
        summary: event.summary,
        timestampEpochMs: event.timestampEpochMs,
      });
      return;

    default:
      return;
  }
};
