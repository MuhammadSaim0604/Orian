import {
  type MemoryEntry,
  type Observation,
  type PromptMessage,
  buildAgentContext,
} from '@mobile-automation/prompt-engine';
import { toolsForRequest, validateToolCall, type ToolName } from '@mobile-automation/tool-sdk';

import { Conversation, DEFAULT_CONVERSATION_TOKENS } from './conversation';
import {
  AgentEventBus,
  type AgentEventListener,
  type RunOutcome,
  toolExecutedEvent,
} from './events';
import { AgentMemory, describeScreen } from './memory';
import {
  applyPlanningCall,
  isPlanningTool,
  planningToolsForRequest,
  type PlanningToolName,
} from './planningTools';
import { type ModelProvider, ProviderError, isProviderError } from './provider';

/**
 * The agent loop: one conversation, one call shape, tools on every turn.
 *
 * ## What this used to do, and why it was wrong
 *
 * The previous loop made a *planning* call with its own system prompt and no tools, then rebuilt a
 * two-message request on every iteration with the screen, the tool list, the history and the budget all
 * flattened into one user message. The model never received an assistant message or a tool result, so it could
 * not see its own actions; the first call looked nothing like the rest; and the request grew without bound
 * because a fresh UI tree was injected every turn whether or not it was wanted.
 *
 * Now there is one shape. Every turn sends `[system, ...conversation]` with the same system prompt and the same
 * tool array, and the conversation accumulates real messages: `user`, `assistant` with `tool_calls`, one `tool`
 * per call, and so on.
 *
 * ## The rule the loop exists to uphold
 *
 * **Every tool call the model makes is answered before the next request.** A provider given an assistant
 * message carrying a `tool_call` with no matching `tool` message rejects the entire request. So each branch
 * below — success, failure, rejection, refusal, no-such-tool — ends in an answer, and `answerAnyUnanswered`
 * catches the paths that leave early.
 *
 * The loop is still **always bounded**. A confused model driving someone's phone is the worst failure this
 * product can have, so there are four independent stops: a step ceiling, a wall-clock deadline, a stuck
 * detector, and cancellation.
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

  /**
   * Earlier messages from the same conversation.
   *
   * Real `PromptMessage` values, replayed as themselves. This replaces two mechanisms that both worked by
   * describing history rather than showing it: `seedMemory`, which rebuilt fake memory entries, and
   * `contextualGoal`, which pasted the previous exchange into the goal string.
   *
   * They do **not** consume the step budget: `maxSteps` bounds what this run does, and a follow-up in a long
   * conversation would otherwise start with almost nothing left to spend.
   */
  readonly history?: readonly PromptMessage[];

  /** Ceiling on the conversation before the oldest exchanges are dropped. */
  readonly maxConversationTokens?: number;

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
  /**
   * The conversation as it ended.
   *
   * Returned so the caller can persist it and replay it on the next turn. This is what makes a follow-up work
   * without anyone summarising anything.
   */
  readonly messages: ReturnType<Conversation['all']>;
};

export const MAX_AGENT_STEPS = 40;

/** Ten minutes. Long enough for a real task, short enough not to strand a phone. */
export const DEFAULT_DEADLINE_MS = 600_000;

/**
 * How many consecutive rejected tool calls to tolerate.
 *
 * A rejection is fed back as a tool result and usually fixed on the next attempt. Three in a row means the
 * model is not understanding the tools, and further attempts spend the user's money without progress.
 */
export const MAX_CONSECUTIVE_REJECTIONS = 3;

/**
 * How many turns with no tool call and no prose to tolerate.
 *
 * A model that returns an empty message is not finished and not acting. Without this the loop would treat it as
 * a completed run, which is how a failure becomes a silent success.
 */
export const MAX_EMPTY_TURNS = 2;

export type AgentDependencies = {
  readonly provider: ModelProvider;
  readonly tools: DeviceTools;
  /**
   * Reads the current screen, for the **recorder** only.
   *
   * No longer injected into any prompt — the model sees a screen by calling `getUiTree`. This is called around a
   * tool execution so a trace step records the screen as it was, which is what makes a recorded run compile
   * into a durable workflow (ADR 0009).
   */
  readonly observe: () => Promise<Observation>;
  /**
   * Reads a captured screenshot as base64, when the model calls `takeScreenshot`.
   *
   * Injected rather than done here because reading a file is the app's business, and because a caller with no
   * vision-capable model can leave it out — in which case the tool result carries the metadata alone rather
   * than megabytes the model cannot use.
   */
  readonly readScreenshotBase64?: (path: string) => Promise<string | null>;
  readonly now?: () => number;
};

/**
 * Runs the agent until the goal is met, the budget is spent, or it is stopped.
 *
 * Never throws for an ordinary failure — the outcome is in the result, because the UI has to display a failed
 * run either way. It throws only for a misconfigured provider, which is a setup problem rather than a run
 * outcome.
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
  const maxConversationTokens = options.maxConversationTokens ?? DEFAULT_CONVERSATION_TOKENS;

  /**
   * The tool array, built once and sent on **every** call including the first.
   *
   * Planning tools travel alongside the device tools rather than in a separate request, which is what lets the
   * model plan and act in the same turn instead of paying for a round trip to do nothing but plan.
   */
  const requestTools = [...toolsForRequest(options.allowedTools), ...planningToolsForRequest()];

  const memory = new AgentMemory();
  const conversation = new Conversation();

  if (options.history !== undefined && options.history.length > 0) {
    conversation.seed(options.history);
  }

  // The user's message, exactly as typed. Nothing wrapped around it, nothing appended.
  conversation.addUserMessage(options.goal);

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
  let emptyTurns = 0;

  try {
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

      /**
       * Trimmed before the call, not after.
       *
       * The trim keeps an assistant turn and its answers together — splitting them is the one thing a provider
       * refuses outright — so it can only run at a point where nothing is pending, which is here.
       */
      conversation.trimToBudget(maxConversationTokens);

      const response = await dependencies.provider.complete({
        messages: buildAgentContext({ messages: conversation.all() }),
        tools: requestTools,
        // 'auto' rather than 'required': the model needs a way to say it is finished, and forcing a tool call
        // means it can only stop by hitting the step ceiling.
        toolChoice: 'auto',
        signal,
      });

      // Recorded before anything is dispatched, so the conversation holds what the model actually said even if
      // the step that follows fails. Verbatim, including the call ids the tool answers will reference.
      conversation.recordAssistantTurn({
        content: response.content,
        toolCalls: response.toolCalls,
        reasoning: response.reasoning,
      });

      /**
       * Reasoning is surfaced but never sent back (see `SEND_REASONING_BY_DEFAULT`).
       *
       * Emitted before the content check because it explains the pause the user is watching, and a reasoning
       * model often returns nothing but reasoning plus a tool call.
       */
      if (response.reasoning != null && response.reasoning.trim() !== '') {
        events.emit({
          type: 'thinking',
          runId,
          timestampEpochMs: now(),
          step: memory.stepCount + 1,
          content: response.reasoning,
        });
      }

      // No tool call means the model considers the work finished or impossible. Its prose is the summary the
      // user sees.
      if (response.toolCalls.length === 0) {
        const prose = response.content?.trim() ?? '';

        if (prose === '') {
          emptyTurns++;

          if (emptyTurns >= MAX_EMPTY_TURNS) {
            outcome = 'failed';
            summary = 'The agent stopped responding.';
            errorMessage = 'the model returned no action and no reply';
            break;
          }

          // Asked once, as a user message: there is no tool call to answer, and a conversation cannot end on an
          // assistant message if the next thing sent is another assistant turn.
          conversation.addUserMessage(
            'You replied with nothing. Either call a tool to continue, or say what you did and stop.',
          );
          continue;
        }

        outcome = 'succeeded';
        summary = prose;
        break;
      }

      emptyTurns = 0;

      /**
       * Prose alongside a tool call is worth surfacing; prose *instead of* one is the final answer.
       *
       * Emitting it in both cases made the same text arrive twice, and a consumer persisting both showed the
       * final response as two identical bubbles.
       */
      if (response.content != null && response.content.trim() !== '') {
        events.emit({
          type: 'thinking',
          runId,
          timestampEpochMs: now(),
          step: memory.stepCount + 1,
          content: response.content,
        });
      }

      /**
       * Every call is answered, but only the **first device call** is executed.
       *
       * A model asked to act on a phone will sometimes propose three taps at once, and the second depends on
       * what the first did to the screen — which it cannot know yet. The others are answered with an explanation
       * rather than dropped, because dropping them would leave the next request invalid.
       *
       * Planning calls do not count against that: they touch nothing, so several can be applied in one turn.
       */
      let executedOne = false;

      for (const proposed of response.toolCalls) {
        if (signal.aborted) break;

        if (isPlanningTool(proposed.name)) {
          handlePlanningCall({
            call: proposed,
            name: proposed.name,
            conversation,
            memory,
            events,
            runId,
            now,
          });
          continue;
        }

        if (executedOne) {
          conversation.answerToolCall({
            toolCallId: proposed.id,
            text:
              'Not run. Only one device action happens per turn, because the next one depends on what this ' +
              'one changed. Read the screen and call it again if it is still what you want.',
          });
          continue;
        }

        const validation = validateToolCall({
          id: proposed.id,
          name: proposed.name as ToolName,
          arguments: proposed.arguments,
        });

        if (!validation.ok) {
          consecutiveRejections++;

          // The correction goes back as the **tool result**, not as a user message. The model's call is
          // outstanding; answering anywhere else leaves it unanswered and the next request invalid.
          conversation.answerToolCall({ toolCallId: proposed.id, text: validation.message });

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
              'The agent could not produce a valid action. ' +
              `Last problem: ${validation.message}`;
            errorMessage = validation.message;
          }

          // Not counted as a step: nothing touched the device, and charging the budget for a malformed call
          // would let a confused model exhaust the run without ever acting.
          continue;
        }

        consecutiveRejections = 0;
        executedOne = true;

        const call = validation.call;

        events.emit({
          type: 'toolCallProposed',
          runId,
          timestampEpochMs: now(),
          step: memory.stepCount + 1,
          tool: call.name,
          arguments: call.arguments,
        });

        /**
         * Read for the recorder, not for the prompt.
         *
         * A trace step records the screen as it was before the action, which is what lets the generator choose
         * a more durable selector than the agent used. The model does not receive this.
         */
        const observation = await safeObserve(dependencies.observe);
        if (observation !== null) memory.observe(observation);

        const startedStepAt = now();
        let result: unknown;
        let failure: { message: string; code?: string } | null = null;

        try {
          result = await dependencies.tools.invoke(call.name, call.arguments);
        } catch (error) {
          failure = describeToolFailure(error);
        }

        const screenAfter = await safeDescribeScreen(dependencies.observe);

        // The answer the model reads. A screenshot answers with the image itself; everything else with text.
        await answerDeviceCall({
          conversation,
          dependencies,
          toolCallId: proposed.id,
          tool: call.name,
          result,
          failure,
        });

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
      }

      if (outcome === 'failed') break;

      /**
       * A stall is reported to the model, as a user message, once per new problem.
       *
       * Told rather than acted on: the model is the thing that can change approach, and `updatePlan` is how it
       * says so. Previously the loop made a whole extra planning call here, which produced a new plan on every
       * turn for as long as the condition persisted, because `isStuck()` keeps reporting until something moves.
       * `claimReplan` fires once per distinct reason.
       */
      const replan = memory.claimReplan();

      if (replan.replan) {
        events.emit({
          type: 'replanning',
          runId,
          timestampEpochMs: now(),
          reason: replan.reason!,
          stepsTaken: memory.stepCount,
        });

        conversation.addUserMessage(
          `This is not working: ${replan.reason}. Try a different approach, and call updatePlan to say what ` +
            'it is.',
        );
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
      // A misconfigured provider is a setup problem, not a run outcome — the user must fix it before any run can
      // work, so it is worth surfacing as an exception.
      throw error;
    } else {
      outcome = 'failed';
      errorMessage = error instanceof Error ? error.message : String(error);
      summary = `The run failed: ${errorMessage}`;
    }
  }

  /**
   * Nothing is left owing.
   *
   * A run can end mid-turn — cancelled, out of budget, a provider error — and an unanswered call would make the
   * **next** run's first request invalid, turning a clean stop here into a confusing provider error later.
   */
  conversation.answerAnyUnanswered('Not run: the run ended.');

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
    messages: conversation.all(),
  };
};

/**
 * Applies a planning call and answers it.
 *
 * Never reaches the device, and never reaches `validateToolCall` either — the planning schemas live in
 * `planningTools.ts` precisely so these names stay out of the device tool vocabulary that the MCP server
 * publishes.
 */
const handlePlanningCall = (input: {
  readonly call: { readonly id: string; readonly arguments: string };
  readonly name: PlanningToolName;
  readonly conversation: Conversation;
  readonly memory: AgentMemory;
  readonly events: AgentEventBus;
  readonly runId: string;
  readonly now: () => number;
}): void => {
  let parsedArguments: unknown = {};

  try {
    parsedArguments = input.call.arguments.trim() === '' ? {} : JSON.parse(input.call.arguments);
  } catch {
    input.conversation.answerToolCall({
      toolCallId: input.call.id,
      text: `The arguments for "${input.name}" were not valid JSON. Send them again as a single JSON object.`,
    });
    return;
  }

  const applied = applyPlanningCall(input.name, parsedArguments);

  input.conversation.answerToolCall({ toolCallId: input.call.id, text: applied.message });

  if (!applied.ok) return;

  input.memory.setPlan(applied.steps);

  input.events.emit({
    type: 'planned',
    runId: input.runId,
    timestampEpochMs: input.now(),
    steps: applied.steps,
    isReplan: applied.isReplan,
  });
};

/**
 * Answers a device tool call.
 *
 * `takeScreenshot` is the one tool whose useful output is pixels, so its answer carries the image as base64 in
 * a content part. Answering with a file path would tell the model an image exists somewhere it cannot reach —
 * worse than saying capture failed, because it invites a confident guess about content nobody has seen.
 *
 * Everything else answers with JSON. Compact rather than pretty: indentation is tokens the user pays for.
 */
const answerDeviceCall = async (input: {
  readonly conversation: Conversation;
  readonly dependencies: AgentDependencies;
  readonly toolCallId: string;
  readonly tool: ToolName;
  readonly result: unknown;
  readonly failure: { message: string; code?: string } | null;
}): Promise<void> => {
  if (input.failure !== null) {
    // The failure text is the model's context for what to do next, which is why the code is included: the
    // difference between "element not found" and "you lack permission" decides whether retrying can help.
    const code = input.failure.code === undefined ? '' : ` (${input.failure.code})`;

    input.conversation.answerToolCall({
      toolCallId: input.toolCallId,
      text: `Failed${code}: ${input.failure.message}`,
    });
    return;
  }

  if (input.tool === 'takeScreenshot') {
    const attached = await attachScreenshot(input);
    if (attached) return;
  }

  input.conversation.answerToolCall({
    toolCallId: input.toolCallId,
    text: input.result === undefined || input.result === null ? 'Done.' : safeJson(input.result),
  });
};

/**
 * Attaches a screenshot's bytes to the answer.
 *
 * Returns false when it cannot, so the caller falls back to text rather than the model receiving nothing. That
 * happens legitimately: a caller may not supply a reader at all, because a model with no vision support cannot
 * use megabytes of base64 and would be charged for them anyway.
 */
const attachScreenshot = async (input: {
  readonly conversation: Conversation;
  readonly dependencies: AgentDependencies;
  readonly toolCallId: string;
  readonly result: unknown;
}): Promise<boolean> => {
  const read = input.dependencies.readScreenshotBase64;
  if (read === undefined) return false;

  const path = (input.result as { filePath?: unknown } | null)?.filePath;
  if (typeof path !== 'string' || path === '') return false;

  try {
    const base64 = await read(path);
    if (base64 === null || base64 === '') return false;

    input.conversation.answerToolCallWithImage({
      toolCallId: input.toolCallId,
      text: `Screenshot of the current screen. ${safeJson(input.result)}`,
      base64,
      mimeType: 'image/png',
    });

    return true;
  } catch {
    // A screenshot that cannot be read is not a failed step — the capture worked. Falling back to the metadata
    // lets the model know it exists and move on.
    return false;
  }
};

/** Serialises a tool result, tolerating a value that cannot be. */
const safeJson = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

/** Reads the screen for the recorder, tolerating a read that fails. */
const safeObserve = async (observe: () => Promise<Observation>): Promise<Observation | null> => {
  try {
    return await observe();
  } catch {
    return null;
  }
};

/** Reads the screen for a memory entry, tolerating a read that fails. */
const safeDescribeScreen = async (observe: () => Promise<Observation>): Promise<string | null> => {
  try {
    return describeScreen(await observe());
  } catch {
    // The action may have left the device briefly unreadable — mid-transition, or the service momentarily
    // unavailable. Not worth failing the step over.
    return null;
  }
};

/**
 * Turns a tool failure into a message and a code.
 *
 * The code comes from the bridge's own classification where present, so the model is told
 * "element_not_found" rather than shown a stack trace — and the difference between "the element is not there"
 * and "you lack permission" is what determines whether trying again can help.
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
 * Summarised rather than stored whole. Memory's only remaining job is stuck detection, and a full `getUiTree`
 * result there would be thousands of tokens held for no reader — the model gets the real result as a tool
 * message.
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

export { ProviderError };
export type { MemoryEntry };
