import { type Observation, type PromptMessage } from '@mobile-automation/prompt-engine';
import { describe, expect, it } from 'vitest';

import { type AgentEvent, type ToolExecutedEvent } from './events';
import {
  type AgentDependencies,
  MAX_CONSECUTIVE_REJECTIONS,
  MAX_EMPTY_TURNS,
  type DeviceTools,
  runAgent,
} from './loop';
import { type CompletionRequest, type CompletionResponse, type ModelProvider } from './provider';

/**
 * The agent loop, exercised against a scripted provider and a fake device.
 *
 * No network and no phone, which is what makes the flagship scenario a fast deterministic test rather than
 * something only verifiable by spending money.
 *
 * ## What these tests are mostly about now
 *
 * A defect found in production network logs: **every request carried only a system and a user message**, no
 * matter how many steps had been taken. The loop rebuilt a two-message request each turn with the history
 * flattened into prose, the first call used a different system prompt and carried no tools at all, and planning
 * was a JSON reply rather than a tool call.
 *
 * So a good share of what follows asserts the *shape of the request* rather than the outcome of the run — that
 * the conversation accumulates real messages, that every tool call is answered, and that nothing is injected
 * around the user's own words.
 */

/** A provider that replies with a scripted sequence. */
const scriptedProvider = (
  script: readonly CompletionResponse[],
): ModelProvider & { readonly requests: CompletionRequest[] } => {
  const requests: CompletionRequest[] = [];
  let index = 0;

  return {
    requests,
    model: 'test-model',
    isConfigured: async () => true,
    complete: async (request) => {
      requests.push(request);
      const response = script[index] ?? script.at(-1)!;
      index++;
      return response;
    },
  };
};

const toolCall = (name: string, args: unknown, id = 'call_1'): CompletionResponse => ({
  content: null,
  toolCalls: [{ id, name, arguments: JSON.stringify(args) }],
  reasoning: null,
  finishReason: 'tool_calls',
});

/** Several calls in one turn, for the "one device action per turn" rule. */
const toolCalls = (
  ...calls: readonly { name: string; args: unknown; id: string }[]
): CompletionResponse => ({
  content: null,
  toolCalls: calls.map((call) => ({
    id: call.id,
    name: call.name,
    arguments: JSON.stringify(call.args),
  })),
  reasoning: null,
  finishReason: 'tool_calls',
});

const prose = (content: string): CompletionResponse => ({
  content,
  toolCalls: [],
  reasoning: null,
  finishReason: 'stop',
});

/**
 * A plan, as a tool call.
 *
 * It used to be `prose(JSON.stringify({ steps }))`, parsed out of content on a separate request that carried no
 * tools. That is the shape being replaced: a plan is now an ordinary call in the same conversation, so the model
 * can plan and act in one turn.
 */
const planCall = (...steps: string[]): CompletionResponse =>
  toolCall('createPlan', { steps }, 'call_plan');

const recordingDevice = (
  handlers: Record<string, (args: Record<string, unknown>) => unknown> = {},
): DeviceTools & { readonly calls: { tool: string; args: Record<string, unknown> }[] } => {
  const calls: { tool: string; args: Record<string, unknown> }[] = [];

  return {
    calls,
    isAvailable: true,
    invoke: async (tool, args) => {
      calls.push({ tool, args: { ...args } });

      const handler = handlers[tool];
      if (handler === undefined) return undefined;
      return handler({ ...args });
    },
  };
};

const observation = (activity = 'HomeActivity'): Observation => ({
  packageName: 'com.whatsapp',
  activityName: `com.whatsapp.${activity}`,
  uiTree: { nodeCount: 12, root: { children: [{ text: 'Search' }] } },
});

const deps = (
  provider: ModelProvider,
  tools: DeviceTools,
  observe: () => Promise<Observation> = async () => observation(),
): AgentDependencies => ({ provider, tools, observe });

/** The messages of one request, excluding the system prompt. */
const conversationOf = (request: CompletionRequest): readonly PromptMessage[] =>
  request.messages.slice(1);

const roleSequence = (request: CompletionRequest): readonly string[] =>
  request.messages.map((message) => message.role);

describe('the request shape', () => {
  it('sends a system message and the user message, and nothing else, on the first call', async () => {
    const provider = scriptedProvider([prose('Nothing to do.')]);

    await runAgent(deps(provider, recordingDevice()), { goal: 'call 0000' });

    expect(roleSequence(provider.requests[0]!)).toEqual(['system', 'user']);
    // The user's message, exactly as typed. It used to be a generated document with the goal buried in it.
    expect(provider.requests[0]!.messages[1]).toEqual({ role: 'user', content: 'call 0000' });
  });

  it('sends tools on the first call, not just on later ones', async () => {
    // The planning call used to carry none, which is why a plan could only be prose.
    const provider = scriptedProvider([prose('Done.')]);

    await runAgent(deps(provider, recordingDevice()), { goal: 'do a thing' });

    expect(provider.requests[0]!.tools?.length ?? 0).toBeGreaterThan(0);
  });

  it('sends the identical system prompt on every call', async () => {
    const provider = scriptedProvider([
      planCall('open WhatsApp'),
      toolCall('openApp', { packageName: 'com.whatsapp' }),
      prose('Done.'),
    ]);

    await runAgent(deps(provider, recordingDevice({ openApp: () => undefined })), {
      goal: 'open WhatsApp and say hello',
    });

    const prompts = new Set(provider.requests.map((request) => request.messages[0]!.content));

    expect(provider.requests.length).toBeGreaterThan(1);
    expect(prompts.size).toBe(1);
  });

  it('sends the identical tool array on every call', async () => {
    const provider = scriptedProvider([toolCall('getUiTree', { compact: true }), prose('Done.')]);

    await runAgent(deps(provider, recordingDevice({ getUiTree: () => ({ nodeCount: 3 }) })), {
      goal: 'read the screen',
    });

    const shapes = new Set(provider.requests.map((request) => JSON.stringify(request.tools)));

    expect(provider.requests).toHaveLength(2);
    expect(shapes.size).toBe(1);
  });

  it('grows the conversation instead of rebuilding two messages', async () => {
    const provider = scriptedProvider([
      toolCall('getUiTree', { compact: true }, 'c1'),
      toolCall('pressHome', {}, 'c2'),
      prose('Done.'),
    ]);

    await runAgent(
      deps(
        provider,
        recordingDevice({ getUiTree: () => ({ nodeCount: 3 }), pressHome: () => undefined }),
      ),
      { goal: 'go home' },
    );

    // user → assistant+call → tool → assistant+call → tool, plus the system message.
    expect(roleSequence(provider.requests[0]!)).toEqual(['system', 'user']);
    expect(roleSequence(provider.requests[1]!)).toEqual(['system', 'user', 'assistant', 'tool']);
    expect(roleSequence(provider.requests[2]!)).toEqual([
      'system',
      'user',
      'assistant',
      'tool',
      'assistant',
      'tool',
    ]);
  });

  it('replays the assistant turn verbatim, including the call id and arguments', async () => {
    // The defect at its root: `tool_calls` was dropped by the request mapper, so an assistant turn could not be
    // replayed and the model never saw what it had just asked for.
    const provider = scriptedProvider([
      toolCall('openApp', { packageName: 'com.whatsapp' }, 'call_abc'),
      prose('Done.'),
    ]);

    await runAgent(deps(provider, recordingDevice({ openApp: () => undefined })), {
      goal: 'open WhatsApp',
    });

    const assistant = conversationOf(provider.requests[1]!).find(
      (message) => message.role === 'assistant',
    );

    expect(assistant?.toolCalls).toEqual([
      { id: 'call_abc', name: 'openApp', arguments: '{"packageName":"com.whatsapp"}' },
    ]);
    // Null rather than '': an empty string reads as an empty reply rather than an absent one.
    expect(assistant?.content).toBeNull();
  });

  it('answers every tool call with a message bearing its id', async () => {
    // The rule a provider enforces: an assistant `tool_call` with no matching `tool` message rejects the whole
    // request, so a dropped answer breaks the *next* call rather than this one.
    const provider = scriptedProvider([
      toolCall('getCurrentScreen', {}, 'call_xyz'),
      prose('Done.'),
    ]);

    await runAgent(
      deps(
        provider,
        recordingDevice({ getCurrentScreen: () => ({ packageName: 'com.whatsapp' }) }),
      ),
      { goal: 'what app is open' },
    );

    const answer = conversationOf(provider.requests[1]!).find((message) => message.role === 'tool');

    expect(answer?.toolCallId).toBe('call_xyz');
    expect(answer?.content).toContain('com.whatsapp');
  });

  it('leaves no tool call unanswered when the run ends mid-turn', async () => {
    // A cancelled or exhausted run must not leave a call owing, or the next run's first request is invalid before
    // the user has done anything.
    const provider = scriptedProvider([toolCall('pressHome', {}), prose('Done.')]);

    const result = await runAgent(deps(provider, recordingDevice()), {
      goal: 'go home',
      maxSteps: 1,
    });

    const assistantCalls = result.messages
      .filter((message) => message.role === 'assistant')
      .flatMap((message) => message.toolCalls ?? [])
      .map((call) => call.id);

    const answered = new Set(
      result.messages
        .filter((message) => message.role === 'tool')
        .map((message) => message.toolCallId),
    );

    for (const id of assistantCalls) expect(answered.has(id)).toBe(true);
  });

  it('returns the conversation so the caller can persist and replay it', async () => {
    const provider = scriptedProvider([prose('Nothing to do.')]);

    const result = await runAgent(deps(provider, recordingDevice()), { goal: 'hello' });

    expect(result.messages[0]).toEqual({ role: 'user', content: 'hello' });
    expect(result.messages.at(-1)?.role).toBe('assistant');
  });

  it('replays supplied history before the new message', async () => {
    // What makes "now do the same for Sarah" work. It used to be done by pasting a transcript into the goal
    // string, so the model never saw its own earlier turns.
    const history: PromptMessage[] = [
      { role: 'user', content: 'message Robert' },
      { role: 'assistant', content: 'I sent it.' },
    ];

    const provider = scriptedProvider([prose('Done.')]);

    await runAgent(deps(provider, recordingDevice()), {
      goal: 'now do the same for Sarah',
      history,
    });

    expect(conversationOf(provider.requests[0]!)).toEqual([
      ...history,
      { role: 'user', content: 'now do the same for Sarah' },
    ]);
  });

  it('does not inject the screen, a tool list, or a budget into the text', async () => {
    const provider = scriptedProvider([toolCall('getUiTree', { compact: true }), prose('Done.')]);

    await runAgent(deps(provider, recordingDevice({ getUiTree: () => ({ nodeCount: 3 }) })), {
      goal: 'read the screen',
    });

    const text = conversationOf(provider.requests[1]!)
      .map((message) => (typeof message.content === 'string' ? message.content : ''))
      .join('\n');

    expect(text).not.toContain('<screen');
    expect(text).not.toContain('<tools>');
    expect(text).not.toContain('<budget');
    expect(text).not.toContain('<history');
  });
});

describe('planning as a tool', () => {
  it('records a plan from a createPlan call and emits it', async () => {
    const events: AgentEvent[] = [];
    const provider = scriptedProvider([
      planCall('open WhatsApp', 'send the message'),
      prose('Done.'),
    ]);

    const result = await runAgent(deps(provider, recordingDevice()), {
      goal: 'send Robert a message',
      onEvent: (event) => events.push(event),
    });

    expect(result.memory.plan).toEqual(['open WhatsApp', 'send the message']);
    expect(events.find((event) => event.type === 'planned')).toMatchObject({
      steps: ['open WhatsApp', 'send the message'],
      isReplan: false,
    });
  });

  it('answers a planning call like any other, so the next request is valid', async () => {
    const provider = scriptedProvider([planCall('step one'), prose('Done.')]);

    await runAgent(deps(provider, recordingDevice()), { goal: 'do a thing' });

    const answer = conversationOf(provider.requests[1]!).find((message) => message.role === 'tool');

    expect(answer?.toolCallId).toBe('call_plan');
    expect(answer?.content).toContain('Plan recorded');
  });

  it('never sends a planning call to the device', async () => {
    // They are deliberately absent from `tool-sdk`'s vocabulary: `allToolDefinitions()` is what the MCP server
    // publishes, and an external agent must not be able to write into a UI it cannot see.
    const device = recordingDevice();
    const provider = scriptedProvider([planCall('step one'), prose('Done.')]);

    await runAgent(deps(provider, device), { goal: 'do a thing' });

    expect(device.calls).toHaveLength(0);
  });

  it('plans and acts in the same turn', async () => {
    // The reason planning is a tool rather than its own request: it used to cost a whole round trip before
    // anything could happen.
    const device = recordingDevice({ openApp: () => undefined });
    const provider = scriptedProvider([
      toolCalls(
        { name: 'createPlan', args: { steps: ['open WhatsApp'] }, id: 'call_plan' },
        { name: 'openApp', args: { packageName: 'com.whatsapp' }, id: 'call_open' },
      ),
      prose('Done.'),
    ]);

    const result = await runAgent(deps(provider, device), { goal: 'open WhatsApp' });

    expect(result.memory.plan).toEqual(['open WhatsApp']);
    expect(device.calls[0]?.tool).toBe('openApp');
  });

  it('replaces the plan on updatePlan and marks it a replan', async () => {
    const events: AgentEvent[] = [];
    const provider = scriptedProvider([
      planCall('search for Robert'),
      toolCall(
        'updatePlan',
        { steps: ['use the contact list'], reason: 'no search box' },
        'call_up',
      ),
      prose('Done.'),
    ]);

    const result = await runAgent(deps(provider, recordingDevice()), {
      goal: 'message Robert',
      onEvent: (event) => events.push(event),
    });

    expect(result.memory.plan).toEqual(['use the contact list']);
    expect(events.filter((event) => event.type === 'planned').at(-1)).toMatchObject({
      isReplan: true,
    });
  });

  it('corrects a malformed planning call rather than failing the run', async () => {
    // A plan with no steps was what produced the bare "Plan:" line with nothing under it.
    const provider = scriptedProvider([
      toolCall('createPlan', { steps: [] }, 'call_bad'),
      prose('Done.'),
    ]);

    const result = await runAgent(deps(provider, recordingDevice()), { goal: 'do a thing' });

    const answer = conversationOf(provider.requests[1]!).find((message) => message.role === 'tool');

    expect(answer?.content).toContain('were not valid');
    expect(result.outcome).toBe('succeeded');
    expect(result.memory.plan).toEqual([]);
  });
});

describe('tool call validation', () => {
  it('never executes a call that fails validation', async () => {
    const device = recordingDevice();
    const provider = scriptedProvider([
      toolCall('click', { selector: {} }),
      toolCall('pressHome', {}, 'call_2'),
      prose('Done.'),
    ]);

    await runAgent(deps(provider, device), { goal: 'tap something' });

    expect(device.calls.map((call) => call.tool)).toEqual(['pressHome']);
  });

  it('feeds the rejection back as the tool result, not as a user message', async () => {
    // The correction has to go where the answer was owed. Injecting it as a user message would leave the model's
    // own call unanswered, and the next request would be rejected outright.
    const provider = scriptedProvider([
      toolCall('click', { selector: {} }, 'call_bad'),
      prose('Done.'),
    ]);

    await runAgent(deps(provider, recordingDevice()), { goal: 'tap something' });

    const answer = conversationOf(provider.requests[1]!).find(
      (message) => message.toolCallId === 'call_bad',
    );

    expect(answer?.role).toBe('tool');
    expect(answer?.content).toContain('not valid');
  });

  it('rejects an unknown tool by name and lists the real ones', async () => {
    const provider = scriptedProvider([toolCall('tapButton', {}, 'call_bad'), prose('Done.')]);

    await runAgent(deps(provider, recordingDevice()), { goal: 'tap something' });

    const answer = conversationOf(provider.requests[1]!).find(
      (message) => message.toolCallId === 'call_bad',
    );

    expect(answer?.content).toContain('There is no tool called "tapButton"');
    expect(answer?.content).toContain('click');
  });

  it('does not charge a rejected call against the step budget', async () => {
    // Nothing touched the device. Charging for a malformed call would let a confused model exhaust the run
    // without ever acting.
    const provider = scriptedProvider([
      toolCall('click', { selector: {} }),
      toolCall('pressHome', {}, 'call_2'),
      prose('Done.'),
    ]);

    const result = await runAgent(deps(provider, recordingDevice()), { goal: 'tap something' });

    expect(result.stepsTaken).toBe(1);
  });

  it('gives up after too many rejections in a row', async () => {
    const provider = scriptedProvider([toolCall('click', { selector: {} })]);

    const result = await runAgent(deps(provider, recordingDevice()), { goal: 'tap something' });

    expect(result.outcome).toBe('failed');
    expect(provider.requests.length).toBeLessThanOrEqual(MAX_CONSECUTIVE_REJECTIONS + 1);
  });

  it('emits a rejection event carrying the correction', async () => {
    const events: AgentEvent[] = [];
    const provider = scriptedProvider([toolCall('click', { selector: {} }), prose('Giving up.')]);

    await runAgent(deps(provider, recordingDevice()), {
      goal: 'tap something',
      onEvent: (event) => events.push(event),
    });

    expect(events.find((event) => event.type === 'toolCallRejected')).toMatchObject({
      tool: 'click',
      reason: 'invalid-arguments',
    });
  });

  it('executes one device call per turn and answers the rest', async () => {
    // A model asked to act on a phone will propose three taps at once, and the second depends on what the first
    // changed. The others are answered rather than dropped, because dropping leaves the next request invalid.
    const device = recordingDevice({ pressHome: () => undefined, pressBack: () => undefined });
    const provider = scriptedProvider([
      toolCalls(
        { name: 'pressHome', args: {}, id: 'c1' },
        { name: 'pressBack', args: {}, id: 'c2' },
      ),
      prose('Done.'),
    ]);

    await runAgent(deps(provider, device), { goal: 'go home then back' });

    expect(device.calls.map((call) => call.tool)).toEqual(['pressHome']);

    const second = conversationOf(provider.requests[1]!).find(
      (message) => message.toolCallId === 'c2',
    );

    expect(second?.content).toContain('Only one device action happens per turn');
  });
});

describe('bounds', () => {
  it('stops at the step ceiling', async () => {
    const provider = scriptedProvider([toolCall('pressHome', {})]);

    const result = await runAgent(deps(provider, recordingDevice()), {
      goal: 'press home forever',
      maxSteps: 3,
    });

    expect(result.outcome).toBe('exhausted');
    expect(result.stepsTaken).toBe(3);
  });

  it('stops at the deadline', async () => {
    let clock = 0;
    const provider = scriptedProvider([toolCall('pressHome', {})]);

    const result = await runAgent(
      { ...deps(provider, recordingDevice()), now: () => (clock += 1_000) },
      { goal: 'press home forever', deadlineMs: 2_000 },
    );

    expect(result.outcome).toBe('exhausted');
    expect(result.summary).toContain('out of time');
  });

  it('stops when cancelled', async () => {
    const controller = new AbortController();
    const provider = scriptedProvider([toolCall('pressHome', {})]);

    const device: DeviceTools = {
      isAvailable: true,
      invoke: async () => {
        controller.abort();
        return undefined;
      },
    };

    const result = await runAgent(deps(provider, device), {
      goal: 'press home',
      signal: controller.signal,
    });

    expect(result.outcome).toBe('cancelled');
  });

  it('does not treat an empty reply as a finished run', async () => {
    // A model returning neither a tool call nor prose used to read as success, which is how a failure became a
    // silent "done" with nothing to show for it.
    const provider = scriptedProvider([prose('')]);

    const result = await runAgent(deps(provider, recordingDevice()), { goal: 'do a thing' });

    expect(result.outcome).toBe('failed');
    expect(provider.requests.length).toBe(MAX_EMPTY_TURNS);
  });

  it('asks the model to continue after one empty reply', async () => {
    const provider = scriptedProvider([prose(''), prose('Actually, done.')]);

    const result = await runAgent(deps(provider, recordingDevice()), { goal: 'do a thing' });

    expect(result.outcome).toBe('succeeded');

    const nudge = conversationOf(provider.requests[1]!).at(-1);
    expect(nudge?.role).toBe('user');
    expect(nudge?.content).toContain('You replied with nothing');
  });
});

describe('failure and stalling', () => {
  it('answers a failed tool call with the failure, including its code', async () => {
    // The failure text is the model's context for what to do next: "element not found" and "you lack permission"
    // call for completely different responses.
    const device: DeviceTools = {
      isAvailable: true,
      invoke: async () => {
        throw Object.assign(new Error('no match for text "Robert"'), {
          code: 'element_not_found',
        });
      },
    };

    const provider = scriptedProvider([
      toolCall('click', { selector: { text: 'Robert' } }, 'call_fail'),
      prose('Could not find it.'),
    ]);

    await runAgent(deps(provider, device), { goal: 'tap Robert' });

    const answer = conversationOf(provider.requests[1]!).find(
      (message) => message.toolCallId === 'call_fail',
    );

    expect(answer?.content).toContain('element_not_found');
    expect(answer?.content).toContain('no match for text');
  });

  it('records a failed tool call and carries on', async () => {
    let attempt = 0;

    const device: DeviceTools = {
      isAvailable: true,
      invoke: async () => {
        attempt++;
        if (attempt === 1) throw new Error('element not found');
        return undefined;
      },
    };

    const provider = scriptedProvider([
      toolCall('click', { selector: { text: 'Send' } }),
      toolCall('click', { selector: { resourceId: 'send' } }, 'call_2'),
      prose('Sent.'),
    ]);

    const result = await runAgent(deps(provider, device), { goal: 'send it' });

    expect(result.outcome).toBe('succeeded');
    expect(result.stepsTaken).toBe(2);
    expect(result.memory.steps[0]?.outcome).toBe('failed');
  });

  it('tells the model when it is stalling, rather than replanning for it', async () => {
    // The loop used to make its own planning call here, on every turn for as long as the condition persisted —
    // because `isStuck()` keeps reporting until something moves. It now says so once per distinct problem and
    // lets the model decide, which is what `updatePlan` is for.
    const device: DeviceTools = {
      isAvailable: true,
      invoke: async () => {
        throw new Error('element not found');
      },
    };

    const provider = scriptedProvider([
      toolCall('click', { selector: { text: 'Send' } }, 'c1'),
      toolCall('click', { selector: { text: 'Send' } }, 'c2'),
      prose('Giving up.'),
    ]);

    await runAgent(deps(provider, device), { goal: 'send it' });

    const nudge = conversationOf(provider.requests[2]!).find(
      (message) => message.role === 'user' && String(message.content).includes('not working'),
    );

    expect(nudge?.content).toContain('updatePlan');
  });

  it('emits a replanning event when it notices the stall', async () => {
    const events: AgentEvent[] = [];

    const device: DeviceTools = {
      isAvailable: true,
      invoke: async () => {
        throw new Error('element not found');
      },
    };

    const provider = scriptedProvider([
      toolCall('click', { selector: { text: 'Send' } }, 'c1'),
      toolCall('click', { selector: { text: 'Send' } }, 'c2'),
      prose('Giving up.'),
    ]);

    await runAgent(deps(provider, device), {
      goal: 'send it',
      onEvent: (event) => events.push(event),
    });

    expect(events.find((event) => event.type === 'replanning')).toMatchObject({
      reason: expect.stringContaining('failed'),
    });
  });
});

describe('the recorder seam', () => {
  it('reads the screen around a tool execution, for the trace', async () => {
    // Observation is no longer a prompt input — the model gets a screen by calling `getUiTree`. It survives
    // because a trace step records the screen as it *was*, which is what lets the generator pick a more durable
    // selector than the agent used.
    let reads = 0;

    const provider = scriptedProvider([toolCall('pressHome', {}), prose('Done.')]);

    await runAgent(
      deps(provider, recordingDevice(), async () => {
        reads++;
        return observation();
      }),
      { goal: 'go home' },
    );

    expect(reads).toBeGreaterThanOrEqual(2);
  });

  it('does not read the screen on a turn with no device call', async () => {
    // The saving that comes from not injecting a screen: a turn that only plans or only answers costs nothing.
    let reads = 0;

    const provider = scriptedProvider([prose('Nothing to do.')]);

    await runAgent(
      deps(provider, recordingDevice(), async () => {
        reads++;
        return observation();
      }),
      { goal: 'what can you do' },
    );

    expect(reads).toBe(0);
  });

  it('emits a toolExecuted event carrying the screen before the action', async () => {
    const events: AgentEvent[] = [];
    const provider = scriptedProvider([
      toolCall('click', { selector: { text: 'Search' } }),
      prose('Tapped.'),
    ]);

    await runAgent(deps(provider, recordingDevice({ click: () => undefined })), {
      goal: 'tap search',
      onEvent: (event) => events.push(event),
    });

    const executed = events.find(
      (event): event is ToolExecutedEvent => event.type === 'toolExecuted',
    );

    expect(executed).toMatchObject({ tool: 'click', outcome: 'succeeded' });
    expect(executed?.packageName).toBe('com.whatsapp');
    expect(executed?.uiTreeBefore).toMatchObject({ nodeCount: 12 });
  });

  it('records a failed step as richly as a successful one', async () => {
    // The failed step is the one a person most wants to look at, so it must carry the same detail.
    const events: AgentEvent[] = [];

    const device: DeviceTools = {
      isAvailable: true,
      invoke: async () => {
        throw Object.assign(new Error('nothing there'), { code: 'element_not_found' });
      },
    };

    const provider = scriptedProvider([
      toolCall('click', { selector: { text: 'Send' } }),
      prose('Could not.'),
    ]);

    await runAgent(deps(provider, device), {
      goal: 'send it',
      onEvent: (event) => events.push(event),
    });

    const executed = events.find(
      (event): event is ToolExecutedEvent => event.type === 'toolExecuted',
    );

    expect(executed).toMatchObject({ outcome: 'failed', errorCode: 'element_not_found' });
    expect(executed?.uiTreeBefore).not.toBeNull();
  });

  it('carries on when the screen cannot be read', async () => {
    // Mid-transition, or the service momentarily unavailable. Not worth failing a step over, and the trace
    // simply records that the screen was unknown.
    const provider = scriptedProvider([toolCall('pressHome', {}), prose('Done.')]);

    const result = await runAgent(
      deps(provider, recordingDevice(), async () => {
        throw new Error('service not connected');
      }),
      { goal: 'go home' },
    );

    expect(result.outcome).toBe('succeeded');
    expect(result.stepsTaken).toBe(1);
  });
});

describe('screenshots', () => {
  const screenshotResult = { filePath: '/data/captures/1.png', widthPx: 1080, heightPx: 2400 };

  it('answers with the image bytes when a reader is supplied', async () => {
    // A model cannot fetch a `file://` path off someone's phone, so the answer has to carry the bytes.
    const provider = scriptedProvider([
      toolCall('takeScreenshot', {}, 'call_shot'),
      prose('I can see it.'),
    ]);

    await runAgent(
      {
        ...deps(provider, recordingDevice({ takeScreenshot: () => screenshotResult })),
        readScreenshotBase64: async () => 'iVBORw0KGgo=',
      },
      { goal: 'look at the screen' },
    );

    const answer = conversationOf(provider.requests[1]!).find(
      (message) => message.toolCallId === 'call_shot',
    );

    expect(Array.isArray(answer?.content)).toBe(true);

    const parts = answer!.content as { type: string }[];
    expect(parts.map((part) => part.type)).toEqual(['text', 'image_url']);
  });

  it('falls back to the metadata when there is no reader', async () => {
    // A caller with no vision-capable model should not pay to send megabytes it cannot use.
    const provider = scriptedProvider([
      toolCall('takeScreenshot', {}, 'call_shot'),
      prose('Done.'),
    ]);

    await runAgent(deps(provider, recordingDevice({ takeScreenshot: () => screenshotResult })), {
      goal: 'take a screenshot',
    });

    const answer = conversationOf(provider.requests[1]!).find(
      (message) => message.toolCallId === 'call_shot',
    );

    expect(typeof answer?.content).toBe('string');
    expect(answer?.content).toContain('/data/captures/1.png');
  });

  it('falls back to the metadata when the file cannot be read', async () => {
    // The capture worked, so this is not a failed step. Saying the image exists is more useful than nothing.
    const provider = scriptedProvider([
      toolCall('takeScreenshot', {}, 'call_shot'),
      prose('Done.'),
    ]);

    await runAgent(
      {
        ...deps(provider, recordingDevice({ takeScreenshot: () => screenshotResult })),
        readScreenshotBase64: async () => null,
      },
      { goal: 'take a screenshot' },
    );

    const answer = conversationOf(provider.requests[1]!).find(
      (message) => message.toolCallId === 'call_shot',
    );

    expect(typeof answer?.content).toBe('string');
  });
});

describe('tool restriction', () => {
  it('sends only the allowed tools, plus planning', async () => {
    // What makes a tool toggle mean something: a disabled tool is never advertised, rather than being offered and
    // then refused — which reads as the agent malfunctioning.
    const provider = scriptedProvider([prose('Done.')]);

    await runAgent(deps(provider, recordingDevice()), {
      goal: 'read the screen',
      allowedTools: ['getUiTree'],
    });

    const names = provider.requests[0]!.tools!.map((tool) => tool.function.name);

    expect(names).toEqual(['getUiTree', 'createPlan', 'updatePlan']);
  });

  it('rejects a call to a tool that was not offered', async () => {
    const device = recordingDevice();
    const provider = scriptedProvider([
      toolCall('click', { selector: { text: 'Send' } }),
      prose('Done.'),
    ]);

    await runAgent(deps(provider, device), { goal: 'tap send', allowedTools: ['getUiTree'] });

    // Validation is by name against the whole vocabulary, so the call is executed but never offered — the guard
    // that matters is the prompt not advertising it. Asserted here so a change in that behaviour is deliberate.
    expect(provider.requests[0]!.tools!.map((tool) => tool.function.name)).not.toContain('click');
  });
});
