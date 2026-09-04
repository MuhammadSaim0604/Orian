/**
 * One Orion Assist turn.
 *
 * The point of these is the **ceiling**, and the fact that planning tools are withheld rather than merely
 * discouraged. A voice turn that quietly became a forty-step run would be the worst version of this feature: the
 * user asked a question, walked away, and the phone carried on being driven.
 *
 * A Jest suite rather than vitest, because this reaches `react-native` through `native-automation` and the app's
 * Jest config is the only place with the RN preset.
 */

import { type CompletionRequest, type CompletionResponse } from '@mobile-automation/ai-agent';

const mockInvoke = jest.fn(async (_tool: string, _args: unknown) => ({ nodeCount: 3 }) as unknown);

jest.mock('@mobile-automation/native-automation', () => ({
  invokeTool: (tool: string, args: unknown) => mockInvoke(tool, args),
  readScreenshotBase64: async () => null,
}));

jest.mock('../../agent/agentSettings', () => ({
  readAgentSettings: () => ({ disabledTools: [], maxSteps: 40, deadlineMs: 600_000 }),
  enabledToolNames: () => undefined,
}));

jest.mock('../../agent/ChatMessageRow', () => ({
  describeToolCall: (tool: string) => `did ${tool}`,
}));

import { MAX_ASSISTANT_STEPS, runAssistantTurn } from '../assistantTurn';

type Request = CompletionRequest;
type Response = CompletionResponse;

beforeEach(() => {
  mockInvoke.mockClear();
  mockInvoke.mockImplementation(async () => ({ nodeCount: 3 }));
});

const provider = (script: readonly Response[]) => {
  const requests: Request[] = [];
  let index = 0;

  return {
    requests,
    model: 'test',
    isConfigured: async () => true,
    complete: async (request: Request) => {
      requests.push(request);
      const response = script[index] ?? script.at(-1)!;
      index++;
      return response;
    },
  };
};

const prose = (content: string): Response => ({
  content,
  toolCalls: [],
  reasoning: null,
  finishReason: 'stop',
});

const call = (name: string, args: unknown, id = 'c1'): Response => ({
  content: null,
  toolCalls: [{ id, name, arguments: JSON.stringify(args) }],
  reasoning: null,
  finishReason: 'tool_calls',
});

const run = (script: readonly Response[], onAction = () => undefined) => {
  const model = provider(script);

  return {
    model,
    result: runAssistantTurn({
      provider: model,
      question: 'what does this say',
      history: [],
      signal: new AbortController().signal,
      onAction,
    }),
  };
};

describe('answering', () => {
  it('returns the reply and a spoken version', async () => {
    const { result } = run([prose('It says **Send**.')]);

    // Two strings from one source, deliberately: the panel shows the markdown and the voice reads the plain text.
    // A voice saying "star star Send star star" is worse than no voice.
    await expect(result).resolves.toEqual({
      answer: 'It says **Send**.',
      spoken: 'It says Send.',
    });
  });

  it('reads the screen when asked to, then answers', async () => {
    const { model, result } = run([call('getUiTree', { compact: true }), prose('It says Send.')]);

    await result;

    expect(mockInvoke).toHaveBeenCalled();
    expect(model.requests).toHaveLength(2);
  });

  it('says something rather than nothing when the model returns nothing', async () => {
    const { result } = run([prose('')]);

    await expect(result).resolves.toMatchObject({ answer: 'I did not get an answer to that.' });
  });
});

describe('the tool array', () => {
  it('never offers a planning tool', async () => {
    /**
     * The prompt says never to plan; withholding the tools is what makes that true rather than a request. A model
     * given a planning tool and told not to plan will occasionally plan, and a plan card in a panel that is about
     * to close is meaningless.
     */
    const { model, result } = run([prose('Done.')]);
    await result;

    const names = model.requests[0]!.tools!.map((tool) => tool.function.name);

    expect(names).not.toContain('createPlan');
    expect(names).not.toContain('updatePlan');
  });

  it('offers the device tools', async () => {
    const { model, result } = run([prose('Done.')]);
    await result;

    expect(model.requests[0]!.tools!.map((tool) => tool.function.name)).toContain('getUiTree');
  });

  it('sends the same tool array on every call', async () => {
    const { model, result } = run([call('getUiTree', {}), prose('Done.')]);
    await result;

    const shapes = new Set(model.requests.map((request) => JSON.stringify(request.tools)));

    expect(model.requests).toHaveLength(2);
    expect(shapes.size).toBe(1);
  });

  it('uses the assistant prompt, not the agent prompt', async () => {
    const { model, result } = run([prose('Done.')]);
    await result;

    expect(model.requests[0]!.messages[0]!.content).toContain('You are Orion');
  });
});

describe('bounds', () => {
  it('gives up after its step ceiling rather than running on', async () => {
    // A voice turn that took forty steps has already failed at being a voice turn.
    const { model, result } = run([call('getUiTree', {})]);

    await expect(result).resolves.toMatchObject({
      answer: 'I could not work that out from this screen.',
    });

    expect(model.requests).toHaveLength(MAX_ASSISTANT_STEPS);
  });

  it('stops when cancelled', async () => {
    const controller = new AbortController();
    const model = provider([call('getUiTree', {}), prose('Done.')]);

    mockInvoke.mockImplementationOnce(async () => {
      controller.abort();
      return {};
    });

    const result = await runAssistantTurn({
      provider: model,
      question: 'anything',
      history: [],
      signal: controller.signal,
      onAction: () => undefined,
    });

    expect(result.answer).toBe('');
  });
});

describe('one action at a time', () => {
  it('runs the first device call and answers the rest', async () => {
    // Same rule and same reason as the agent loop: the second depends on what the first changed. Answered rather
    // than dropped, because an unanswered call invalidates the next request.
    const model = provider([
      {
        content: null,
        toolCalls: [
          { id: 'c1', name: 'getUiTree', arguments: '{}' },
          { id: 'c2', name: 'getCurrentScreen', arguments: '{}' },
        ],
        reasoning: null,
        finishReason: 'tool_calls',
      },
      prose('Done.'),
    ]);

    await runAssistantTurn({
      provider: model,
      question: 'anything',
      history: [],
      signal: new AbortController().signal,
      onAction: () => undefined,
    });

    const answers = model.requests[1]!.messages.filter((message) => message.role === 'tool');

    expect(answers).toHaveLength(2);
    expect(answers[1]?.content).toContain('One action at a time');
  });
});

describe('what the user is told it did', () => {
  it('reports each action as it happens', async () => {
    // A voice assistant that sits silent for eight seconds reads as broken even when it is working.
    const actions: string[] = [];

    const { result } = run([call('getUiTree', {}), prose('Done.')], ((phrase: string) =>
      actions.push(phrase)) as never);

    await result;

    expect(actions).toEqual(['did getUiTree']);
  });
});

describe('a failing tool', () => {
  it('tells the model why, with the code', async () => {
    // The failure text is the model's context for what to do next: "element not found" and "you lack permission"
    // call for different responses.
    mockInvoke.mockImplementationOnce(async () => {
      throw Object.assign(new Error('nothing there'), { code: 'element_not_found' });
    });

    const model = provider([call('click', { selector: { text: 'Send' } }), prose('Could not.')]);

    await runAssistantTurn({
      provider: model,
      question: 'tap send',
      history: [],
      signal: new AbortController().signal,
      onAction: () => undefined,
    });

    const answer = model.requests[1]!.messages.find((message) => message.role === 'tool');

    expect(answer?.content).toContain('element_not_found');
  });
});
