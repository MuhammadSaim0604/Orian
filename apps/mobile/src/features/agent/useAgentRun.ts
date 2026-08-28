import {
  type AgentEvent,
  type AgentRunResult,
  createChatCompletionsProvider,
  runAgent,
} from '@mobile-automation/ai-agent';
import { invokeTool } from '@mobile-automation/native-automation';
import { type Observation } from '@mobile-automation/prompt-engine';
import { useCallback, useEffect, useRef, useState } from 'react';

import { loadProviderSettings, readApiKey } from './providerSettings';

/**
 * Drives an agent run from the UI.
 *
 * Two things this hook exists to get right.
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
 */

export type AgentRunState = 'idle' | 'running' | 'finished';

export type AgentActivity = {
  readonly runState: AgentRunState;
  readonly events: readonly AgentEvent[];
  readonly result: AgentRunResult | null;
  /** A configuration problem, distinct from a failed run. */
  readonly configError: string | null;
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

  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

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
              if (!mountedRef.current) return;

              setEvents((current) =>
                current.length >= MAX_RETAINED_EVENTS
                  ? [...current.slice(1), event]
                  : [...current, event],
              );
            },
          },
        );

        if (!mountedRef.current) return;

        setResult(runResult);
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
    setRunState('idle');
    setEvents([]);
    setResult(null);
    setConfigError(null);
  }, []);

  return { runState, events, result, configError, start, stop, reset };
};
