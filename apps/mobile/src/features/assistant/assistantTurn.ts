import { Conversation, type ModelProvider, isProviderError } from '@mobile-automation/ai-agent';
import { invokeTool, readScreenshotBase64 } from '@mobile-automation/native-automation';
import { buildAssistantContext } from '@mobile-automation/prompt-engine';
import { type ToolName, toolsForRequest, validateToolCall } from '@mobile-automation/tool-sdk';
import { stripMarkdown } from '@mobile-automation/ui';

import { enabledToolNames, readAgentSettings } from '../agent/agentSettings';
import { describeToolCall } from '../agent/ChatMessageRow';

/**
 * One Orion Assist turn.
 *
 * ## Why this is not `runAgent`
 *
 * `runAgent` is the right engine for a goal that takes forty steps: it holds a plan, detects stalls, records a
 * trace, and reports through an event bus so a notification and an overlay can follow along. None of that applies
 * to "what does this say" — and three parts of it are actively wrong here:
 *
 * - It emits `runStarted`/`runFinished` events that the run controller's notification and status strip listen
 *   for. A voice question would post a notification saying the phone was being driven.
 * - It carries planning tools. This prompt forbids planning, so offering them invites the model to disobey it.
 * - Its step budget is forty. A voice turn that took forty steps has already failed at being a voice turn.
 *
 * So this is a small loop of its own with a hard ceiling, sharing the parts that must not diverge: the same
 * `Conversation` (and therefore the same every-call-is-answered rule), the same `validateToolCall`, the same
 * `invokeTool` dispatch, and the same tool toggles the user set on the tools page.
 */

/** The most tool calls one spoken answer may take. */
export const MAX_ASSISTANT_STEPS = 8;

/** How long the user waits before it gives up, in ms. Short: they are standing there listening. */
export const ASSISTANT_DEADLINE_MS = 45_000;

export type AssistantTurnResult = {
  /** What to show in the panel. May contain markdown, because a model does what a model does. */
  readonly answer: string;
  /** What to speak. Markdown stripped, because a voice reading asterisks is worse than no voice. */
  readonly spoken: string;
};

export const runAssistantTurn = async (input: {
  readonly provider: ModelProvider;
  readonly question: string;
  readonly history: readonly Parameters<Conversation['seed']>[0][number][];
  readonly signal: AbortSignal;
  readonly onAction: (phrase: string) => void;
}): Promise<AssistantTurnResult> => {
  const settings = readAgentSettings();
  const conversation = new Conversation();

  if (input.history.length > 0) conversation.seed(input.history);
  conversation.addUserMessage(input.question);

  /**
   * Device tools only — no `createPlan` or `updatePlan`.
   *
   * The prompt says never to plan; withholding the tools is what makes that true rather than a request. A model
   * given a planning tool and told not to plan will occasionally plan.
   */
  const tools = toolsForRequest(enabledToolNames(settings));

  const deadline = Date.now() + ASSISTANT_DEADLINE_MS;

  for (let step = 0; step < MAX_ASSISTANT_STEPS; step++) {
    if (input.signal.aborted) return { answer: '', spoken: '' };

    if (Date.now() > deadline) {
      const message = 'That took too long, so I stopped.';
      return { answer: message, spoken: message };
    }

    const response = await input.provider.complete({
      messages: buildAssistantContext({ messages: conversation.all() }),
      tools,
      toolChoice: 'auto',
      signal: input.signal,
    });

    conversation.recordAssistantTurn({
      content: response.content,
      toolCalls: response.toolCalls,
      reasoning: response.reasoning,
    });

    // No tool call means it is answering, which is the expected shape of most turns here.
    if (response.toolCalls.length === 0) {
      const answer = response.content?.trim() ?? '';

      if (answer === '') {
        const message = 'I did not get an answer to that.';
        return { answer: message, spoken: message };
      }

      return { answer, spoken: stripMarkdown(answer) };
    }

    // One device action per turn, same rule and same reason as the agent loop: the second depends on what the
    // first changed. The rest are answered rather than dropped, or the next request is invalid.
    let executed = false;

    for (const proposed of response.toolCalls) {
      if (input.signal.aborted) return { answer: '', spoken: '' };

      if (executed) {
        conversation.answerToolCall({
          toolCallId: proposed.id,
          text: 'Not run. One action at a time — read the screen again if you still need this.',
        });
        continue;
      }

      const validation = validateToolCall({
        id: proposed.id,
        name: proposed.name as ToolName,
        arguments: proposed.arguments,
      });

      if (!validation.ok) {
        conversation.answerToolCall({ toolCallId: proposed.id, text: validation.message });
        continue;
      }

      executed = true;

      const call = validation.call;
      input.onAction(describeToolCall(call.name, call.arguments));

      try {
        const result = await invokeTool(call.name, call.arguments);
        await answerCall(conversation, proposed.id, call.name, result);
      } catch (error) {
        const failure = error as { message?: unknown; code?: unknown };
        const code = typeof failure?.code === 'string' ? ` (${failure.code})` : '';
        const message = typeof failure?.message === 'string' ? failure.message : 'the tool failed';

        conversation.answerToolCall({
          toolCallId: proposed.id,
          text: `Failed${code}: ${message}`,
        });
      }
    }
  }

  // Out of steps. Phrased as something a person would say rather than as a budget message: the user is listening,
  // not reading a log.
  const message = 'I could not work that out from this screen.';
  return { answer: message, spoken: message };
};

/**
 * Answers one tool call.
 *
 * A screenshot carries its bytes, exactly as in the agent loop — a model cannot fetch a `file://` path off
 * someone's phone. Everything else answers with compact JSON.
 */
const answerCall = async (
  conversation: Conversation,
  toolCallId: string,
  tool: ToolName,
  result: unknown,
): Promise<void> => {
  if (tool === 'takeScreenshot') {
    const path = (result as { filePath?: unknown } | null)?.filePath;

    if (typeof path === 'string' && path !== '') {
      const base64 = await readScreenshotBase64(path);

      if (base64 !== null && base64 !== '') {
        conversation.answerToolCallWithImage({
          toolCallId,
          text: 'Screenshot of the current screen.',
          base64,
        });
        return;
      }
    }
  }

  conversation.answerToolCall({
    toolCallId,
    text: result === undefined || result === null ? 'Done.' : safeJson(result),
  });
};

const safeJson = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

export { isProviderError };
