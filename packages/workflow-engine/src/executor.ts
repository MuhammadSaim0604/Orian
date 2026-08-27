import {
  ExecutionCancelledError,
  type ExecutionContext,
  type JsonObject,
  type JsonValue,
  type NodeRegistry,
  type NodeResult,
  type ToolInvoker,
  isExecutionCancelledError,
  isNodeExecutionError,
  unavailableToolInvoker,
} from '@mobile-automation/node-sdk';
import { type ExecutionPolicy, OUTPUT_HANDLE_DONE } from '@mobile-automation/workflow-schema';

import { ExecutionEventBus, type ExecutionEventListener, type ExecutionOutcome } from './events';
import {
  type LoadedWorkflow,
  type ResolvedNode,
  branchHandle,
  loadWorkflow,
  nextNodeIds,
} from './loader';
import { RunVariableStore } from './variables';

/**
 * The workflow executor.
 *
 * Walks the graph from its entry node, following whichever output handle each node
 * names. Not a topological sort: which nodes run depends on decisions made while
 * running - a condition takes one branch, a loop repeats its body - so the order can
 * only be discovered by executing.
 *
 * Nothing here imports React Native, and nothing reaches the device except through
 * the `ToolInvoker` the caller supplies. The engine could run in Node against a fake.
 */

export type ExecuteOptions = {
  /** Values collected before the run, such as answers to Input nodes. */
  readonly variables?: JsonObject;

  /** How device tools are reached. Defaults to refusing every call. */
  readonly tools?: ToolInvoker;

  /** Cancels the run. A stopped workflow is a normal outcome, not a failure. */
  readonly signal?: AbortSignal;

  readonly onEvent?: ExecutionEventListener;

  /**
   * Ceiling on total steps.
   *
   * A backstop distinct from per-loop limits: nested loops multiply, and a workflow
   * that runs for an hour on someone's phone is a bug however it got there.
   */
  readonly maxSteps?: number;

  /** Injectable for tests, so retry delays do not make the suite slow. */
  readonly sleep?: (ms: number) => Promise<void>;

  readonly executionId?: string;
};

export type ExecutionResult = {
  readonly executionId: string;
  readonly outcome: ExecutionOutcome;
  readonly durationMs: number;
  readonly stepsRun: number;
  readonly variables: JsonObject;
  readonly failedNodeId?: string;
  readonly error?: string;
  /** Node ids in the order they ran, including repeats. */
  readonly trace: readonly string[];
};

export const DEFAULT_MAX_STEPS = 10_000;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Runs a loaded workflow.
 *
 * Never throws for a workflow-level failure: the outcome is reported in the result,
 * because a failed run is an expected outcome that the UI has to display either way.
 * It does throw for programming errors, which are bugs rather than outcomes.
 */
export const executeWorkflow = async (
  loaded: LoadedWorkflow,
  options: ExecuteOptions = {},
): Promise<ExecutionResult> => {
  const executionId = options.executionId ?? `exec_${Date.now().toString(36)}`;
  const events = new ExecutionEventBus();
  if (options.onEvent !== undefined) events.subscribe(options.onEvent);

  const variables = new RunVariableStore(loaded.workflow.variables, events, executionId);
  if (options.variables !== undefined) variables.seed(options.variables);

  const tools = options.tools ?? unavailableToolInvoker;
  const signal = options.signal ?? new AbortController().signal;
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const sleep = options.sleep ?? defaultSleep;

  const startedAt = Date.now();
  const trace: string[] = [];

  events.emit({
    type: 'workflowStarted',
    executionId,
    timestampEpochMs: startedAt,
    workflowId: loaded.workflow.id,
    workflowName: loaded.workflow.metadata.name,
    nodeCount: loaded.workflow.nodes.length,
    variables: variables.publicSnapshot(),
  });

  /** Outputs each node published, so a downstream node can read them. */
  const outputsByNode = new Map<string, JsonObject>();

  /** Loop nodes waiting to be re-entered when the body runs out. */
  const returnStack: string[] = [];

  let currentNodeId: string | undefined = loaded.entryNodeId;
  let stepsRun = 0;
  let outcome: ExecutionOutcome = 'succeeded';
  let failedNodeId: string | undefined;
  let errorMessage: string | undefined;

  try {
    while (currentNodeId !== undefined) {
      if (signal.aborted) throw new ExecutionCancelledError();

      if (stepsRun >= maxSteps) {
        throw new Error(
          `stopped after ${maxSteps} steps to avoid running forever - check the workflow's loops`,
        );
      }

      const resolved = loaded.nodes.get(currentNodeId);
      if (resolved === undefined) {
        // Load-time validation makes this unreachable; treating it as a bug rather
        // than a workflow failure is deliberate.
        throw new Error(
          `internal error: node "${currentNodeId}" vanished from the loaded workflow`,
        );
      }

      const step = await runNode(resolved, {
        loaded,
        events,
        executionId,
        variables,
        tools,
        signal,
        sleep,
        outputsByNode,
        returnStack,
      });

      stepsRun++;
      trace.push(currentNodeId);

      if (step.kind === 'failed') {
        outcome = 'failed';
        failedNodeId = currentNodeId;
        errorMessage = step.error;
        break;
      }

      currentNodeId = step.nextNodeId;
    }
  } catch (error) {
    if (isExecutionCancelledError(error)) {
      outcome = 'cancelled';
    } else {
      outcome = 'failed';
      failedNodeId = currentNodeId;
      errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  const durationMs = Date.now() - startedAt;

  events.emit({
    type: 'workflowFinished',
    executionId,
    timestampEpochMs: Date.now(),
    outcome,
    durationMs,
    stepsRun,
    failedNodeId,
    error: errorMessage,
    variables: variables.publicSnapshot(),
  });

  return {
    executionId,
    outcome,
    durationMs,
    stepsRun,
    variables: variables.publicSnapshot(),
    failedNodeId,
    error: errorMessage,
    trace,
  };
};

/** Everything a single node execution needs from the run. */
type StepContext = {
  loaded: LoadedWorkflow;
  events: ExecutionEventBus;
  executionId: string;
  variables: RunVariableStore;
  tools: ToolInvoker;
  signal: AbortSignal;
  sleep: (ms: number) => Promise<void>;
  outputsByNode: Map<string, JsonObject>;
  /**
   * Loop nodes waiting to be re-entered, innermost last.
   *
   * This is what lets a loop body flow forward to a dead end instead of looping back
   * with an edge - which keeps the graph acyclic and so keeps cycle detection
   * meaningful.
   */
  returnStack: string[];
};

type StepOutcome =
  | { kind: 'advanced'; nextNodeId: string | undefined }
  | { kind: 'failed'; error: string };

/**
 * Runs one node, applying its retry policy.
 *
 * Retries live here rather than in the node so every node gets the same behaviour
 * without implementing it, and so the log shows attempts consistently. A node that
 * declares its failure not retryable is never retried, however generous the policy -
 * repeating a call that cannot succeed only delays the real report.
 */
const runNode = async (resolved: ResolvedNode, step: StepContext): Promise<StepOutcome> => {
  const { node, definition, config } = resolved;
  const policy = effectivePolicy(resolved);

  step.variables.enterNode(node.id);

  const inputs = gatherInputs(node.id, step);

  for (let attempt = 0; ; attempt++) {
    if (step.signal.aborted) throw new ExecutionCancelledError();

    const attemptStartedAt = Date.now();

    step.events.emit({
      type: 'nodeStarted',
      executionId: step.executionId,
      timestampEpochMs: attemptStartedAt,
      nodeId: node.id,
      nodeType: node.type,
      label: node.metadata.label,
      attempt,
    });

    try {
      const result = await runWithTimeout(
        () =>
          definition.execute(
            buildContext(resolved, config, inputs, attempt, step) as ExecutionContext<never>,
          ),
        policy.timeoutMs,
        node.id,
      );

      step.events.emit({
        type: 'nodeSucceeded',
        executionId: step.executionId,
        timestampEpochMs: Date.now(),
        nodeId: node.id,
        nodeType: node.type,
        durationMs: Date.now() - attemptStartedAt,
        summary: result.summary,
        outputs: result.outputs as JsonObject | undefined,
      });

      if (result.outputs !== undefined) {
        step.outputsByNode.set(node.id, result.outputs as JsonObject);
      }

      return { kind: 'advanced', nextNodeId: resolveNext(resolved, result, step) };
    } catch (error) {
      if (isExecutionCancelledError(error)) throw error;

      const failure = describeFailure(error);
      const canRetry = failure.retryable && attempt < policy.retry;

      if (canRetry) {
        step.events.emit({
          type: 'nodeRetrying',
          executionId: step.executionId,
          timestampEpochMs: Date.now(),
          nodeId: node.id,
          nodeType: node.type,
          attempt: attempt + 1,
          ofAttempts: policy.retry,
          delayMs: policy.retryDelayMs,
          reason: failure.message,
        });

        await step.sleep(policy.retryDelayMs);
        continue;
      }

      const continuing = policy.onError === 'continue';

      step.events.emit({
        type: 'nodeFailed',
        executionId: step.executionId,
        timestampEpochMs: Date.now(),
        nodeId: node.id,
        nodeType: node.type,
        durationMs: Date.now() - attemptStartedAt,
        error: failure.message,
        retryable: failure.retryable,
        needsUserAction: failure.needsUserAction,
        continuing,
      });

      if (continuing) {
        // The step failed but the workflow goes on, so follow the default edge.
        return { kind: 'advanced', nextNodeId: resolveNext(resolved, {}, step) };
      }

      return { kind: 'failed', error: failure.message };
    }
  }
};

/**
 * A node's effective policy: the workflow's setting, or the definition's default.
 *
 * Definitions carry defaults because some steps are inherently flaky - opening an app
 * during a cold start, for instance - and expecting every user to discover that and
 * configure retries by hand would make the product feel unreliable.
 */
const effectivePolicy = (resolved: ResolvedNode): ExecutionPolicy => {
  const fromWorkflow = resolved.node.executionPolicy;
  const fromDefinition = resolved.definition.defaultExecutionPolicy;

  if (fromDefinition === undefined) return fromWorkflow;

  // The workflow only overrides where it differs from the schema default, so a
  // definition's advice is not silently discarded by an untouched form field.
  const isDefault =
    fromWorkflow.retry === 0 &&
    fromWorkflow.retryDelayMs === 500 &&
    fromWorkflow.onError === 'stop';

  return isDefault ? { ...fromWorkflow, ...fromDefinition } : fromWorkflow;
};

const buildContext = (
  resolved: ResolvedNode,
  config: unknown,
  inputs: JsonObject,
  attempt: number,
  step: StepContext,
): ExecutionContext<unknown> => ({
  nodeId: resolved.node.id,
  config,
  inputs,
  variables: step.variables,
  tools: step.tools,
  signal: step.signal,
  attempt,
  log: (message) => {
    step.events.emit({
      type: 'log',
      executionId: step.executionId,
      timestampEpochMs: Date.now(),
      nodeId: resolved.node.id,
      message,
    });
  },
});

/**
 * Collects the values arriving on a node's inputs.
 *
 * Upstream outputs are keyed by the target handle the edge names, so a node reads
 * `inputs.element` without knowing which node produced it. That indirection is what
 * lets a workflow be rewired on the canvas without editing node configs.
 */
const gatherInputs = (nodeId: string, step: StepContext): JsonObject => {
  const inputs: JsonObject = {};

  for (const edge of step.loaded.incoming.get(nodeId) ?? []) {
    const upstream = step.outputsByNode.get(edge.source);
    if (upstream === undefined) continue;

    // The whole upstream output object lands on the handle, and its `result` is also
    // hoisted, since that is what a single-value node publishes and what a config
    // referring to a node output almost always means.
    for (const [key, value] of Object.entries(upstream)) {
      inputs[key] = value as JsonValue;
    }

    inputs[edge.targetHandle] = (upstream.result ?? null) as JsonValue;
  }

  return inputs;
};

/**
 * Where to go next, following the handle the node's result named.
 *
 * Loops are the interesting case. A loop node asks to be re-entered with
 * `repeat: true`, and its body flows **forward** to a dead end rather than looping
 * back with an edge. When execution runs out of successors, the engine returns to
 * the innermost loop waiting on the return stack.
 *
 * That design is deliberate. The obvious alternative - drawing an edge from the last
 * body node back to the loop - makes the graph genuinely cyclic, which means cycle
 * detection can no longer distinguish an intended loop from a workflow that will run
 * forever. Keeping the graph acyclic preserves that check, removes an edge the user
 * would otherwise have to remember to draw, and makes nesting fall out naturally
 * from the stack.
 */
const resolveNext = (
  resolved: ResolvedNode,
  result: NodeResult,
  step: StepContext,
): string | undefined => {
  const handle = branchHandle(result.branch);
  const targets = nextNodeIds(step.loaded, resolved.node.id, handle);

  if (result.branch !== undefined) {
    step.events.emit({
      type: 'branchTaken',
      executionId: step.executionId,
      timestampEpochMs: Date.now(),
      nodeId: resolved.node.id,
      handle,
      targetNodeIds: targets,
    });
  }

  if (result.repeat === true) {
    if (targets.length === 0) {
      // A loop with an empty body would spin forever, so treat this pass as the
      // last and continue past the loop.
      return advancePast(resolved.node.id, step);
    }

    // Remember to come back here once the body reaches its end.
    step.returnStack.push(resolved.node.id);
    return targets[0];
  }

  if (targets.length > 0) return firstTarget(targets);

  // Dead end: hand control back to the innermost loop still running, if any.
  return step.returnStack.pop();
};

/**
 * Leaves a loop, following its `done` handle.
 *
 * Used when a loop finishes on the same call that would have started an iteration -
 * an empty body, or a count already satisfied.
 */
const advancePast = (nodeId: string, step: StepContext): string | undefined => {
  const done = nextNodeIds(step.loaded, nodeId, OUTPUT_HANDLE_DONE);
  if (done.length > 0) return done[0];
  return step.returnStack.pop();
};

/**
 * The single successor to follow.
 *
 * Execution is sequential on purpose. Two nodes fanning out from one handle would both
 * drive the same physical screen, and there is only one screen - so the second would
 * act on whatever the first left behind. The loader permits the shape; the executor
 * follows the first edge and the canvas shows the order.
 */
const firstTarget = (targets: readonly string[]): string | undefined => targets[0];

/** Applies a node's timeout, if it declared one. */
const runWithTimeout = async (
  run: () => Promise<NodeResult>,
  timeoutMs: number | undefined,
  nodeId: string,
): Promise<NodeResult> => {
  if (timeoutMs === undefined) return run();

  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      run(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`node "${nodeId}" took longer than ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    // Cleared even on success, or a pending timer would hold the process open - which
    // in a test suite shows up as Vitest refusing to exit.
    if (timer !== undefined) clearTimeout(timer);
  }
};

const describeFailure = (
  error: unknown,
): { message: string; retryable: boolean; needsUserAction: boolean } => {
  if (isNodeExecutionError(error)) {
    return {
      message: error.message,
      retryable: error.retryable,
      needsUserAction: error.needsUserAction,
    };
  }

  return {
    message: error instanceof Error ? error.message : String(error),
    // An unclassified error is assumed transient, matching the common case of a
    // device hiccup, but a node that knows better says so explicitly.
    retryable: true,
    needsUserAction: false,
  };
};

/**
 * Loads and runs a workflow in one call.
 *
 * The entry point the app uses. Load errors throw because an invalid workflow cannot
 * produce a run at all, while a failed run returns a result.
 */
export const runWorkflow = async (
  raw: unknown,
  registry: NodeRegistry,
  options: ExecuteOptions = {},
): Promise<ExecutionResult> => executeWorkflow(loadWorkflow(raw, registry), options);
