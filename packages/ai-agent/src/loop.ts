import {
  type MemoryEntry,
  type Observation,
  buildAgentContext,
  buildPlanContext,
  parseStructured,
} from '@mobile-automation/prompt-engine';
import {
  allToolDefinitions,
  toolsForRequest,
  validateToolCall,
  type ToolName,
} from '@mobile-automation/tool-sdk';
import { z } from 'zod';

import {
  AgentEventBus,
  type AgentEventListener,
  type RunOutcome,
  toolExecutedEvent,
} from './events';
import { AgentMemory, describeScreen } from './memory';
import { type ModelProvider, ProviderError, isProviderError } from './provider';

/**
 * The agent loop: goal, plan, observe, choose a tool, execute, observe, replan, done.
 *
 * Separate from the workflow engine and sharing only the tool runtime (ADR 0008). The
 * agent's non-determinism must never leak into deterministic workflow execution, which
 * is why there is no code in common beyond the tool vocabulary.
 *
 * The loop is **always bounded**. A confused model driving someone's phone is the worst
 * failure this product can have, so there are four independent stops: a step ceiling, a
 * wall-clock deadline, a stuck detector, and cancellation. Any one of them ends the run.
 */

/** How the agent reaches the device. Same shape the workflow engine uses. */
export type DeviceTools = {
  readonly isAvailable: boolean;
  invoke: (tool: string, args: Readonly<Record<string, unknown>>) => Promise<unknown>;
};

export type AgentRunOptions = {
  readonly goal: string;

  /** Hard ceiling on tool executions. */
  readonly maxSteps?: number;

  /**
   * Wall-clock ceiling.
   *
   * Separate from the step count because a step is not a fixed cost: a `waitForElement`
   * can take thirty seconds, so forty steps could be twenty minutes of the user's phone
   * being driven.
   */
  readonly deadlineMs?: number;

  /** Restricts which tools the model may call, for a read-only or gated mode. */
  readonly allowedTools?: readonly ToolName[];

  readonly signal?: AbortSignal;

  readonly onEvent?: AgentEventListener;

  /** Skips the planning turn, for a single obvious action. */
  readonly skipPlanning?: boolean;

  /**
   * History from earlier in the same conversation.
   *
   * For per-session memory (Step 4): a second run in a session must know what the first did,
   * or the agent repeats work the user just watched it do. Seeded into the existing
   * `AgentMemory` rather than held separately, so the stuck and replan detectors reason over
   * the whole conversation and there is no second implementation of "what has been tried".
   *
   * These do **not** consume the step budget: `maxSteps` bounds what this run does, and a
   * follow-up in a long conversation would otherwise start with almost no budget left.
   */
  readonly seedMemory?: readonly MemoryEntry[];

  readonly runId?: string;
};

export type AgentRunResult = {
  readonly runId: string;
  readonly outcome: RunOutcome;
  readonly stepsTaken: number;
  readonly durationMs: number;
  /** The model's account of what it did, or why it stopped. */
  readonly summary: string;
  readonly error?: string;
  readonly memory: ReturnType<AgentMemory['snapshot']>;
};

export const MAX_AGENT_STEPS = 40;

/** Ten minutes. Long enough for a real task, short enough not to strand a phone. */
export const DEFAULT_DEADLINE_MS = 600_000;

/**
 * How many consecutive rejected tool calls to tolerate.
 *
 * A rejection is fed back as a correction and usually fixed on the next attempt. Three
 * in a row means the model is not understanding the tools, and further attempts spend
 * the user's money without progress.
 */
export const MAX_CONSECUTIVE_REJECTIONS = 3;

/** What the loop asks the model for on a planning turn. */
const PlanSchema = z.object({ steps: z.array(z.string().min(1)).min(1).max(20) });

/**
 * What the loop asks for when the model is finished.
 *
 * The model signals completion by calling no tool and replying with prose, so this is
 * only used to interpret that reply - not to force a shape on every turn.
 */
export type AgentDependencies = {
  readonly provider: ModelProvider;
  readonly tools: DeviceTools;
  /** Reads the current screen. Injected so the loop is testable with a fake device. */
  readonly observe: () => Promise<Observation>;
  readonly now?: () => number;
};

/**
 * Runs the agent until the goal is met, the budget is spent, or it is stopped.
 *
 * Never throws for an ordinary failure - the outcome is in the result, because the UI
 * has to display a failed run either way. It throws only for a misconfigured provider,
 * which is a setup problem rather than a run outcome.
 */
export const runAgent = async (
  dependencies: AgentDependencies,
  options: AgentRunOptions,
): Promise<AgentRunResult> => {
  const runId = options.runId ?? `run_${Date.now().toString(36)}`;
  const now = dependencies.now ?? (() => Date.now());
  const events = new AgentEventBus();
  if (options.onEvent !== undefined) events.subscribe(options.onEvent);

  const maxSteps = options.maxSteps ?? MAX_AGENT_STEPS;
  const deadline = now() + (options.deadlineMs ?? DEFAULT_DEADLINE_MS);
  const signal = options.signal ?? new AbortController().signal;

  const toolNames = options.allowedTools;
  const toolDefinitions =
    toolNames === undefined
      ? allToolDefinitions()
      : allToolDefinitions().filter((definition) => toolNames.includes(definition.name));
  const requestTools = toolsForRequest(toolNames);

  const memory = new AgentMemory();

  // Before the run starts, so the plan is made in light of what has already been tried. Planning with
  // no memory in a conversation that has history would produce a plan the agent then immediately
  // abandons.
  if (options.seedMemory !== undefined && options.seedMemory.length > 0) {
    memory.seed(options.seedMemory);
  }

  const startedAt = now();

  events.emit({
    type: 'runStarted',
    runId,
    timestampEpochMs: startedAt,
    goal: options.goal,
    maxSteps,
    model: dependencies.provider.model,
  });

  let outcome: RunOutcome = 'exhausted';
  let summary = '';
  let errorMessage: string | undefined;
  let consecutiveRejections = 0;
  let lastRejection: string | null = null;

  try {
    if (options.skipPlanning !== true) {
      const plan = await makePlan(dependencies, options.goal, toolDefinitions, signal);
      memory.setPlan(plan);

      events.emit({
        type: 'planned',
        runId,
        timestampEpochMs: now(),
        steps: plan,
        isReplan: false,
      });
    }

    // Bounded on steps **taken**, not on total memory. Seeded history from earlier in the conversation
    // must not consume this run's budget, or a follow-up in a long session would start with nothing left
    // to spend.
    while (memory.takenCount < maxSteps) {
      if (signal.aborted) {
        outcome = 'cancelled';
        summary = 'The run was stopped.';
        break;
      }

      if (now() > deadline) {
        outcome = 'exhausted';
        summary = 'The run ran out of time before the goal was reached.';
        break;
      }

      // Observed every iteration, never cached. The screen is the one thing that
      // changes underneath the agent, and acting on a stale reading is the failure
      // mode this ordering exists to prevent.
      const observation = await dependencies.observe();
      memory.observe(observation);

      events.emit({
        type: 'observed',
        runId,
        timestampEpochMs: now(),
        packageName: observation.packageName,
        activityName: observation.activityName,
        elementCount: countElements(observation.uiTree),
        screenshotPath: observation.screenshotPath ?? null,
      });

      const stuck = memory.isStuck();
      if (stuck.stuck) {
        events.emit({
          type: 'replanning',
          runId,
          timestampEpochMs: now(),
          reason: stuck.reason!,
          stepsTaken: memory.stepCount,
        });

        const plan = await makePlan(
          dependencies,
          `${options.goal}\n\nThe previous approach is not working: ${stuck.reason}. ` +
            `${memory.summarise()} Plan a different approach.`,
          toolDefinitions,
          signal,
        );

        memory.setPlan(plan);

        events.emit({
          type: 'planned',
          runId,
          timestampEpochMs: now(),
          steps: plan,
          isReplan: true,
        });
      }

      const response = await dependencies.provider.complete({
        messages: buildAgentContext({
          goal: options.goal,
          observation,
          memory: memory.entries(),
          tools: toolDefinitions,
          stepsTaken: memory.stepCount,
          maxSteps,
          plan: memory.plan,
          lastRejection,
        }),
        tools: requestTools,
        // 'auto' rather than 'required': the model needs a way to say it is finished,
        // and forcing a tool call means it can only stop by hitting the step ceiling.
        toolChoice: 'auto',
        signal,
      });

      if (response.content != null && response.content.trim() !== '') {
        events.emit({
          type: 'thinking',
          runId,
          timestampEpochMs: now(),
          step: memory.stepCount + 1,
          content: response.content,
        });
      }

      // No tool call means the model considers the work finished or impossible. Its
      // prose is the summary the user sees.
      if (response.toolCalls.length === 0) {
        outcome = 'succeeded';
        summary = response.content?.trim() ?? 'The agent stopped without saying why.';
        break;
      }

      // One at a time, deliberately. A model asked to act on a phone will sometimes
      // propose three taps at once, but the second depends on what the first did to the
      // screen - and it cannot know that yet.
      const proposed = response.toolCalls[0]!;

      const validation = validateToolCall({
        id: proposed.id,
        name: proposed.name,
        arguments: proposed.arguments,
      });

      if (!validation.ok) {
        consecutiveRejections++;
        lastRejection = validation.message;

        events.emit({
          type: 'toolCallRejected',
          runId,
          timestampEpochMs: now(),
          step: memory.stepCount + 1,
          tool: validation.toolName,
          reason: validation.reason,
          correction: validation.message,
        });

        if (consecutiveRejections >= MAX_CONSECUTIVE_REJECTIONS) {
          outcome = 'failed';
          summary =
            'The agent could not produce a valid action. ' + `Last problem: ${validation.message}`;
          errorMessage = validation.message;
          break;
        }

        // Not counted as a step: nothing touched the device, and charging the budget
        // for a malformed call would let a confused model exhaust the run without ever
        // acting.
        continue;
      }

      consecutiveRejections = 0;
      lastRejection = null;

      const call = validation.call;

      events.emit({
        type: 'toolCallProposed',
        runId,
        timestampEpochMs: now(),
        step: memory.stepCount + 1,
        tool: call.name,
        arguments: call.arguments,
      });

      const startedStepAt = now();
      let result: unknown;
      let failure: { message: string; code?: string } | null = null;

      try {
        result = await dependencies.tools.invoke(call.name, call.arguments);
      } catch (error) {
        failure = describeToolFailure(error);
      }

      // Read after the action so the trace shows what each step changed, and so the
      // next iteration's memory says where the agent ended up.
      const screenAfter = await safeDescribeScreen(dependencies.observe);

      events.emit(
        toolExecutedEvent({
          runId,
          step: memory.stepCount + 1,
          call,
          observationBefore: observation,
          durationMs: now() - startedStepAt,
          outcome: failure === null ? 'succeeded' : 'failed',
          result,
          error: failure?.message,
          errorCode: failure?.code,
          screenAfter,
        }),
      );

      memory.record({
        tool: call.name,
        arguments: call.arguments,
        outcome: failure === null ? 'succeeded' : 'failed',
        summary: failure === null ? summariseResult(result) : failure.message,
        screenBefore: describeScreen(observation),
        screenAfter,
      });

      if (failure !== null && memory.shouldReplan()) {
        events.emit({
          type: 'replanning',
          runId,
          timestampEpochMs: now(),
          reason: `${memory.consecutiveFailures()} steps in a row failed`,
          stepsTaken: memory.stepCount,
        });

        const plan = await makePlan(
          dependencies,
          `${options.goal}\n\n${memory.summarise()} Plan how to recover.`,
          toolDefinitions,
          signal,
        );

        memory.setPlan(plan);

        events.emit({
          type: 'planned',
          runId,
          timestampEpochMs: now(),
          steps: plan,
          isReplan: true,
        });
      }
    }

    if (outcome === 'exhausted' && summary === '') {
      summary = `The agent used all ${maxSteps} steps without finishing.`;
    }
  } catch (error) {
    if (signal.aborted) {
      outcome = 'cancelled';
      summary = 'The run was stopped.';
    } else if (isProviderError(error) && error.needsUserAction) {
      // A misconfigured provider is a setup problem, not a run outcome - the user must
      // fix it before any run can work, so it is worth surfacing as an exception.
      throw error;
    } else {
      outcome = 'failed';
      errorMessage = error instanceof Error ? error.message : String(error);
      summary = `The run failed: ${errorMessage}`;
    }
  }

  const durationMs = now() - startedAt;

  events.emit({
    type: 'runFinished',
    runId,
    timestampEpochMs: now(),
    outcome,
    stepsTaken: memory.takenCount,
    durationMs,
    summary,
    error: errorMessage,
  });

  return {
    runId,
    outcome,
    stepsTaken: memory.takenCount,
    durationMs,
    summary,
    error: errorMessage,
    memory: memory.snapshot(),
  };
};

/**
 * Asks the model for a plan.
 *
 * A plan is not executed step by step - the screen decides what is actually possible -
 * but it measurably improves tool choice, and it is what the UI shows so the user knows
 * what the agent intends before it touches anything.
 *
 * A failed plan is not fatal. The loop can work without one, and refusing to start
 * because a planning call failed would be worse than starting unplanned.
 */
const makePlan = async (
  dependencies: AgentDependencies,
  goal: string,
  tools: ReturnType<typeof allToolDefinitions>,
  signal: AbortSignal | undefined,
): Promise<readonly string[]> => {
  try {
    const response = await dependencies.provider.complete({
      messages: buildPlanContext({
        goal,
        availableNodeTypes: tools.map((tool) => ({
          type: tool.name,
          description: tool.description,
        })),
      }),
      signal,
    });

    const parsed = parseStructured(PlanSchema, response.content ?? '');
    return parsed.ok ? parsed.value.steps : [];
  } catch (error) {
    if (isProviderError(error) && error.needsUserAction) throw error;
    return [];
  }
};

/** Reads the screen for a memory entry, tolerating a read that fails. */
const safeDescribeScreen = async (observe: () => Promise<Observation>): Promise<string | null> => {
  try {
    return describeScreen(await observe());
  } catch {
    // The action may have left the device briefly unreadable - mid-transition, or the
    // service momentarily unavailable. Not worth failing the step over.
    return null;
  }
};

/**
 * Turns a tool failure into a message and a code.
 *
 * The code comes from the bridge's own classification where present, so the model is
 * told "element_not_found" rather than a stack trace - and the difference between "the
 * element is not there" and "you lack permission" is what determines whether replanning
 * can help.
 */
const describeToolFailure = (error: unknown): { message: string; code?: string } => {
  const candidate = error as { message?: unknown; code?: unknown };

  return {
    message:
      typeof candidate?.message === 'string' && candidate.message !== ''
        ? candidate.message
        : 'the tool failed',
    code: typeof candidate?.code === 'string' ? candidate.code : undefined,
  };
};

/**
 * One line describing what a tool returned, for memory.
 *
 * Summarised rather than stored whole: a `getUiTree` result is thousands of tokens, and
 * putting it into memory would crowd out the current screen with a stale copy of an
 * older one.
 */
const summariseResult = (result: unknown): string => {
  if (result === null || result === undefined) return 'done';

  if (typeof result === 'string')
    return result.length > 120 ? `${result.slice(0, 120)}...` : result;

  if (Array.isArray(result)) return `${result.length} result${result.length === 1 ? '' : 's'}`;

  if (typeof result === 'object') {
    const candidate = result as { text?: unknown; packageName?: unknown; nodeCount?: unknown };

    if (typeof candidate.text === 'string') return `found "${candidate.text}"`;
    if (typeof candidate.packageName === 'string') return `on ${candidate.packageName}`;
    if (typeof candidate.nodeCount === 'number') return `${candidate.nodeCount} elements`;

    return 'done';
  }

  return String(result);
};

/** Counts elements in a UI tree, for the observed event. */
const countElements = (tree: unknown): number => {
  if (tree === null || typeof tree !== 'object') return 0;

  const candidate = tree as { nodeCount?: unknown; root?: unknown; children?: unknown[] };

  // The serializer already reports this; recounting would walk the whole tree for a
  // number that is only shown in the UI.
  if (typeof candidate.nodeCount === 'number') return candidate.nodeCount;

  let count = 0;
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    count++;
    const children = (node as { children?: unknown[] }).children;
    if (Array.isArray(children)) children.forEach(visit);
  };

  visit(candidate.root ?? candidate);
  return count;
};

export { ProviderError };
