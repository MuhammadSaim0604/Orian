import {
  type ExecutionTrace,
  type GenerationResult,
  type ReplayCheck,
  checkReplay,
  durabilityOf,
  generateWorkflow,
} from '@mobile-automation/execution-recorder';
import { useCallback, useMemo, useState } from 'react';

/**
 * Compiling a recorded run into a workflow.
 *
 * Synchronous and deterministic - no provider, no await. Worth stating plainly because the
 * neighbouring "Create with AI" path does call a model: this one compiles a recording, and the
 * trace already says exactly what happened.
 *
 * Regenerating on an option change is cheap for the same reason, so the variable toggle can
 * take effect immediately rather than behind a button.
 */

export type TraceCompilation = {
  readonly generation: GenerationResult;
  readonly check: ReplayCheck;
  readonly durability: ReturnType<typeof durabilityOf>;
};

export type UseTraceWorkflow = {
  readonly compilation: TraceCompilation | null;
  readonly extractVariables: boolean;
  setExtractVariables: (enabled: boolean) => void;
};

export const useTraceWorkflow = (trace: ExecutionTrace | null): UseTraceWorkflow => {
  const [extractVariables, setExtractVariables] = useState(true);

  const compilation = useMemo<TraceCompilation | null>(() => {
    if (trace === null) return null;

    const generation = generateWorkflow(trace, { extractVariables });

    return {
      generation,
      check: checkReplay(trace, generation),
      durability: durabilityOf(generation.origins),
    };
  }, [extractVariables, trace]);

  const setEnabled = useCallback((enabled: boolean) => {
    setExtractVariables(enabled);
  }, []);

  return { compilation, extractVariables, setExtractVariables: setEnabled };
};
