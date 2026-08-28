import { invokeTool } from '@mobile-automation/native-automation';
import {
  type ExecutionEvent,
  type ExecutionResult,
  isWorkflowLoadError,
  runWorkflow,
} from '@mobile-automation/workflow-engine';
import { useCallback, useRef, useState } from 'react';

import { useCanvasStore } from '../canvas/canvasStore';
import { useExecutionStore } from '../canvas/executionStore';
import { nodeRegistry } from '../canvas/registry';

/**
 * Running the workflow that is on the canvas.
 *
 * Load errors are handled separately from run failures, because they are different problems
 * for the user: a load error means the workflow is not valid and nothing happened, while a
 * run failure means the phone was driven and something went wrong partway. Collapsing them
 * would leave the user unsure whether their device was touched.
 */

export type WorkflowRunState = {
  readonly running: boolean;
  /** Validation problems, each already located by the loader. */
  readonly loadIssues: readonly string[];
  readonly result: ExecutionResult | null;
  run: () => void;
  stop: () => void;
};

export const useWorkflowRun = (): WorkflowRunState => {
  const [loadIssues, setLoadIssues] = useState<readonly string[]>([]);
  const [result, setResult] = useState<ExecutionResult | null>(null);

  const controllerRef = useRef<AbortController | null>(null);

  const running = useExecutionStore((state) => state.running);
  const startRun = useExecutionStore((state) => state.startRun);
  const apply = useExecutionStore((state) => state.apply);

  const run = useCallback(() => {
    const workflow = useCanvasStore.getState().toWorkflow();

    setLoadIssues([]);
    setResult(null);

    const controller = new AbortController();
    controllerRef.current = controller;

    startRun(`exec_${Date.now().toString(36)}`);

    void (async () => {
      try {
        const runResult = await runWorkflow(workflow, nodeRegistry, {
          tools: { isAvailable: true, invoke: invokeTool },
          signal: controller.signal,
          onEvent: (event: ExecutionEvent) => apply(event),
        });

        setResult(runResult);
      } catch (error) {
        if (isWorkflowLoadError(error)) {
          // Reported as located issues rather than one long message, so the user can see that
          // three separate things need fixing.
          setLoadIssues(
            error.issues.map((issue) =>
              issue.path === '' ? issue.message : `${issue.path}: ${issue.message}`,
            ),
          );
        } else {
          setLoadIssues([error instanceof Error ? error.message : 'The workflow could not run.']);
        }

        // Cleared so the canvas does not keep showing a run that never started.
        useExecutionStore.getState().clear();
      }
    })();
  }, [apply, startRun]);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  return { running, loadIssues, result, run, stop };
};
