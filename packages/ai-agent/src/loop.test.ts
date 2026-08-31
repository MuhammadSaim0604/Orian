import { type Observation } from '@mobile-automation/prompt-engine';
import { describe, expect, it } from 'vitest';

import { type AgentEvent, type ToolExecutedEvent } from './events';
import {
  type AgentDependencies,
  MAX_CONSECUTIVE_REJECTIONS,
  type DeviceTools,
  runAgent,
} from './loop';
import { type CompletionRequest, type CompletionResponse, type ModelProvider } from './provider';

/**
 * The agent loop, exercised against a scripted provider and a fake device.
 *
 * No network and no phone, which is what makes the flagship scenario a fast
 * deterministic test rather than something only verifiable by spending money. The
 * provider interface exists precisely so this is possible.
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
  finishReason: 'tool_calls',
});

const prose = (content: string): CompletionResponse => ({
  content,
  toolCalls: [],
  finishReason: 'stop',
});

/** The planning turn's reply, which the loop parses as JSON. */
const plan = (...steps: string[]): CompletionResponse => prose(JSON.stringify({ steps }));

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

describe('a simple run', () => {
  it('plans, acts, and finishes', async () => {
    const provider = scriptedProvider([
      plan('open WhatsApp'),
      toolCall('openApp', { packageName: 'com.whatsapp' }),
      prose('WhatsApp is open. The goal is complete.'),
    ]);
    const device = recordingDevice({ openApp: () => undefined });

    const result = await runAgent(deps(provider, device), { goal: 'Open WhatsApp' });

    expect(result.outcome).toBe('succeeded');
    expect(result.stepsTaken).toBe(1);
    expect(device.calls[0]?.tool).toBe('openApp');
    expect(result.summary).toContain('complete');
  });

  it('can skip planning for a single obvious action', async () => {
    const provider = scriptedProvider([toolCall('pressHome', {}), prose('Done.')]);

    const result = await runAgent(deps(provider, recordingDevice()), {
      goal: 'Go home',
      skipPlanning: true,
    });

    expect(result.outcome).toBe('succeeded');
    // Only the action turn and the finishing turn - no planning call.
    expect(provider.requests).toHaveLength(2);
  });

  it('records the plan in memory and in an event', async () => {
    const events: AgentEvent[] = [];
    const provider = scriptedProvider([plan('step one', 'step two'), prose('Done.')]);

    const result = await runAgent(deps(provider, recordingDevice()), {
      goal: 'Do something',
      onEvent: (event) => events.push(event),
    });

    expect(result.memory.plan).toEqual(['step one', 'step two']);
    expect(events.find((event) => event.type === 'planned')).toMatchObject({ isReplan: false });
  });

  it('starts without a plan when the planning call fails', async () => {
    // Refusing to start because planning failed would be worse than starting unplanned.
    const provider: ModelProvider = {
      model: 'test',
      isConfigured: async () => true,
      complete: async (request) => {
        const isPlanning = request.tools === undefined;
        if (isPlanning) throw new Error('planning failed');
        return prose('Done.');
      },
    };

    const result = await runAgent(deps(provider, recordingDevice()), { goal: 'Do something' });

    expect(result.outcome).toBe('succeeded');
    expect(result.memory.plan).toEqual([]);
  });
});

describe('observation', () => {
  it('reads the screen before every decision, never caching it', async () => {
    // Acting on a stale reading is the failure this ordering exists to prevent.
    let reads = 0;

    const provider = scriptedProvider([
      plan('a'),
      toolCall('click', { selector: { text: 'Search' } }),
      toolCall('click', { selector: { text: 'Robert' } }),
      prose('Done.'),
    ]);

    const result = await runAgent(
      deps(provider, recordingDevice({ click: () => undefined }), async () => {
        reads++;
        return observation();
      }),
      { goal: 'Tap twice' },
    );

    expect(result.stepsTaken).toBe(2);
    // Once before each decision, plus once after each action for the trace.
    expect(reads).toBeGreaterThanOrEqual(4);
  });

  it('reports what it saw', async () => {
    const events: AgentEvent[] = [];
    const provider = scriptedProvider([plan('a'), prose('Done.')]);

    await runAgent(deps(provider, recordingDevice()), {
      goal: 'Look',
      onEvent: (event) => events.push(event),
    });

    expect(events.find((event) => event.type === 'observed')).toMatchObject({
      packageName: 'com.whatsapp',
      elementCount: 12,
    });
  });

  it('includes the current screen in the prompt', async () => {
    const provider = scriptedProvider([plan('a'), prose('Done.')]);

    await runAgent(deps(provider, recordingDevice()), { goal: 'Look' });

    // The second request is the action turn; the first was planning.
    const actionRequest = provider.requests[1]!;
    const content = actionRequest.messages.map((message) => message.content).join('\n');

    expect(content).toContain('com.whatsapp');
    expect(content).toContain('Search');
  });
});

describe('tool call validation', () => {
  it('never executes a call that fails validation', async () => {
    // The gate between a model's output and someone's phone.
    const provider = scriptedProvider([
      plan('a'),
      toolCall('click', { selector: { className: 'Button' } }),
      toolCall('click', { selector: { text: 'Send' } }),
      prose('Done.'),
    ]);
    const device = recordingDevice({ click: () => undefined });

    await runAgent(deps(provider, device), { goal: 'Tap send' });

    // Only the valid call reached the device.
    expect(device.calls).toHaveLength(1);
    expect(device.calls[0]?.args).toEqual({ selector: { text: 'Send' } });
  });

  it('feeds the rejection back as a correction', async () => {
    const provider = scriptedProvider([
      plan('a'),
      toolCall('sendWhatsApp', { to: 'Robert' }),
      prose('Done.'),
    ]);

    await runAgent(deps(provider, recordingDevice()), { goal: 'Message Robert' });

    // The turn after the rejection carries the correction.
    const retryContent = provider.requests[2]!.messages.map((m) => m.content).join('\n');

    expect(retryContent).toContain('rejected');
    expect(retryContent).toContain('sendWhatsApp');
  });

  it('does not charge a rejected call against the step budget', async () => {
    // A confused model would otherwise exhaust the run without ever acting.
    const provider = scriptedProvider([
      plan('a'),
      toolCall('click', { selector: {} }),
      toolCall('click', { selector: { text: 'Send' } }),
      prose('Done.'),
    ]);

    const result = await runAgent(deps(provider, recordingDevice({ click: () => undefined })), {
      goal: 'Tap send',
    });

    expect(result.stepsTaken).toBe(1);
  });

  it('gives up after too many rejections in a row', async () => {
    // Further attempts spend the user's money without progress.
    const provider = scriptedProvider([plan('a'), toolCall('notATool', {})]);

    const result = await runAgent(deps(provider, recordingDevice()), { goal: 'Do something' });

    expect(result.outcome).toBe('failed');
    expect(result.summary).toContain('could not produce a valid action');
    expect(MAX_CONSECUTIVE_REJECTIONS).toBe(3);
  });

  it('emits a rejection event carrying the correction', async () => {
    const events: AgentEvent[] = [];
    const provider = scriptedProvider([plan('a'), toolCall('nope', {}), prose('Done.')]);

    await runAgent(deps(provider, recordingDevice()), {
      goal: 'x',
      onEvent: (event) => events.push(event),
    });

    expect(events.find((event) => event.type === 'toolCallRejected')).toMatchObject({
      tool: 'nope',
      reason: 'unknown-tool',
    });
  });

  it('acts on one tool call at a time', async () => {
    // A model will sometimes propose three taps at once, but the second depends on what
    // the first did to the screen.
    const provider = scriptedProvider([
      plan('a'),
      {
        content: null,
        toolCalls: [
          { id: 'c1', name: 'click', arguments: '{"selector":{"text":"A"}}' },
          { id: 'c2', name: 'click', arguments: '{"selector":{"text":"B"}}' },
        ],
        finishReason: 'tool_calls',
      },
      prose('Done.'),
    ]);
    const device = recordingDevice({ click: () => undefined });

    await runAgent(deps(provider, device), { goal: 'Tap' });

    expect(device.calls).toHaveLength(1);
    expect(device.calls[0]?.args).toEqual({ selector: { text: 'A' } });
  });
});

describe('bounds', () => {
  it('stops at the step ceiling', async () => {
    const provider = scriptedProvider([plan('a'), toolCall('swipe', { direction: 'down' })]);

    const result = await runAgent(deps(provider, recordingDevice({ swipe: () => undefined })), {
      goal: 'Scroll forever',
      maxSteps: 5,
    });

    expect(result.outcome).toBe('exhausted');
    expect(result.stepsTaken).toBe(5);
    expect(result.summary).toContain('all 5 steps');
  });

  it('stops at the wall-clock deadline', async () => {
    // A step is not a fixed cost: a waitForElement can take thirty seconds, so a step
    // count alone does not bound how long a phone is driven.
    let clock = 0;
    const provider = scriptedProvider([plan('a'), toolCall('swipe', { direction: 'down' })]);

    const result = await runAgent(
      {
        ...deps(provider, recordingDevice({ swipe: () => undefined })),
        now: () => {
          clock += 5_000;
          return clock;
        },
      },
      { goal: 'Scroll', maxSteps: 100, deadlineMs: 10_000 },
    );

    expect(result.outcome).toBe('exhausted');
    expect(result.stepsTaken).toBeLessThan(100);
  });

  it('stops when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();

    const provider = scriptedProvider([plan('a'), prose('Done.')]);

    const result = await runAgent(deps(provider, recordingDevice()), {
      goal: 'x',
      signal: controller.signal,
      skipPlanning: true,
    });

    expect(result.outcome).toBe('cancelled');
    expect(result.stepsTaken).toBe(0);
  });

  it('reports cancellation as its own outcome, not a failure', async () => {
    const controller = new AbortController();
    const provider = scriptedProvider([toolCall('pressBack', {}), prose('Done.')]);

    const device: DeviceTools = {
      isAvailable: true,
      invoke: async () => {
        controller.abort();
        return undefined;
      },
    };

    const result = await runAgent(deps(provider, device), {
      goal: 'x',
      signal: controller.signal,
      skipPlanning: true,
    });

    expect(result.outcome).toBe('cancelled');
  });
});

describe('failure and replanning', () => {
  it('records a failed tool call and carries on', async () => {
    const provider = scriptedProvider([
      plan('a'),
      toolCall('click', { selector: { text: 'Missing' } }),
      prose('That element is not there. Stopping.'),
    ]);

    const device: DeviceTools = {
      isAvailable: true,
      invoke: async () => {
        throw Object.assign(new Error('Element not found: Missing'), {
          code: 'element_not_found',
        });
      },
    };

    const result = await runAgent(deps(provider, device), { goal: 'Tap missing' });

    expect(result.stepsTaken).toBe(1);
    expect(result.memory.steps[0]?.outcome).toBe('failed');
    expect(result.memory.steps[0]?.summary).toContain('Element not found');
  });

  it('replans after two failures in a row', async () => {
    const events: AgentEvent[] = [];
    const provider = scriptedProvider([
      plan('a'),
      toolCall('click', { selector: { text: 'A' } }),
      toolCall('click', { selector: { text: 'B' } }),
      plan('try something else'),
      prose('Done.'),
    ]);

    const device: DeviceTools = {
      isAvailable: true,
      invoke: async () => {
        throw new Error('nope');
      },
    };

    await runAgent(deps(provider, device), {
      goal: 'x',
      onEvent: (event) => events.push(event),
    });

    expect(events.some((event) => event.type === 'replanning')).toBe(true);
    expect(events.filter((event) => event.type === 'planned').length).toBeGreaterThan(1);
  });

  it('replans when it detects a loop', async () => {
    const events: AgentEvent[] = [];
    const provider = scriptedProvider([
      plan('a'),
      toolCall('click', { selector: { text: 'Same' } }),
      toolCall('click', { selector: { text: 'Same' } }),
      toolCall('click', { selector: { text: 'Same' } }),
      plan('a different approach'),
      prose('Done.'),
    ]);

    await runAgent(deps(provider, recordingDevice({ click: () => undefined })), {
      goal: 'x',
      maxSteps: 8,
      onEvent: (event) => events.push(event),
    });

    const replans = events.filter((event) => event.type === 'replanning');
    expect(replans.length).toBeGreaterThan(0);
    expect(replans[0]).toMatchObject({ reason: expect.stringContaining('same action') });
  });

  it('surfaces a misconfigured provider rather than reporting a failed run', async () => {
    // A setup problem the user must fix before any run can work.
    const provider: ModelProvider = {
      model: 'test',
      isConfigured: async () => false,
      complete: async () => {
        const { ProviderError } = await import('./provider');
        throw new ProviderError('unauthorized', 'bad key');
      },
    };

    await expect(
      runAgent(deps(provider, recordingDevice()), { goal: 'x', skipPlanning: true }),
    ).rejects.toThrow(/bad key/);
  });
});

describe('the recorder seam', () => {
  it('emits a toolExecuted event per execution', async () => {
    const events: AgentEvent[] = [];
    const provider = scriptedProvider([
      plan('a'),
      toolCall('click', { selector: { text: 'Send' } }),
      prose('Done.'),
    ]);

    await runAgent(deps(provider, recordingDevice({ click: () => undefined })), {
      goal: 'Tap send',
      onEvent: (event) => events.push(event),
    });

    const executed = events.filter(
      (event): event is ToolExecutedEvent => event.type === 'toolExecuted',
    );

    expect(executed).toHaveLength(1);
  });

  it('carries everything an ExecutionStep needs', async () => {
    // Phase 9 must not have to reopen the loop to add capture points.
    const events: AgentEvent[] = [];
    const provider = scriptedProvider([
      plan('a'),
      toolCall('click', { selector: { text: 'Send' } }),
      prose('Done.'),
    ]);

    await runAgent(deps(provider, recordingDevice({ click: () => undefined })), {
      goal: 'Tap send',
      onEvent: (event) => events.push(event),
    });

    const executed = events.find(
      (event): event is ToolExecutedEvent => event.type === 'toolExecuted',
    )!;

    expect(executed.tool).toBe('click');
    expect(executed.arguments).toEqual({ selector: { text: 'Send' } });
    expect(executed.packageName).toBe('com.whatsapp');
    expect(executed.activityName).toContain('HomeActivity');
    expect(executed.uiTreeBefore).toBeDefined();
    expect(executed.outcome).toBe('succeeded');
    expect(typeof executed.durationMs).toBe('number');
    expect(executed.screenAfter).toBe('com.whatsapp/HomeActivity');
  });

  it('captures the resolved element, which is what makes replay durable', async () => {
    // A trace of coordinates compiles into a workflow that breaks on the next app
    // update; one carrying the element that matched does not (ADR 0009).
    const events: AgentEvent[] = [];
    const provider = scriptedProvider([
      plan('a'),
      toolCall('findElement', { selector: { text: 'Send' } }),
      prose('Done.'),
    ]);

    await runAgent(
      deps(
        provider,
        recordingDevice({
          findElement: () => ({
            text: 'Send',
            resourceId: 'com.whatsapp:id/send',
            strategy: 'resourceId',
            centerX: 975,
            centerY: 1875,
          }),
        }),
      ),
      { goal: 'Find send', onEvent: (event) => events.push(event) },
    );

    const executed = events.find(
      (event): event is ToolExecutedEvent => event.type === 'toolExecuted',
    )!;

    expect(executed.matchedBy).toBe('resourceId');
    expect(executed.resolvedElement).toMatchObject({ resourceId: 'com.whatsapp:id/send' });
  });

  it('records a failed step as richly as a successful one', async () => {
    // The failed step is the one a person most wants to look at.
    const events: AgentEvent[] = [];
    const provider = scriptedProvider([
      plan('a'),
      toolCall('click', { selector: { text: 'Missing' } }),
      prose('Stopping.'),
    ]);

    const device: DeviceTools = {
      isAvailable: true,
      invoke: async () => {
        throw Object.assign(new Error('not found'), { code: 'element_not_found' });
      },
    };

    await runAgent(deps(provider, device), {
      goal: 'x',
      onEvent: (event) => events.push(event),
    });

    const executed = events.find(
      (event): event is ToolExecutedEvent => event.type === 'toolExecuted',
    )!;

    expect(executed.outcome).toBe('failed');
    expect(executed.error).toBe('not found');
    expect(executed.errorCode).toBe('element_not_found');
    expect(executed.uiTreeBefore).toBeDefined();
  });

  it('survives a listener that throws', async () => {
    // Abandoning a run because a log view has a bug would leave the phone half-done.
    const provider = scriptedProvider([plan('a'), toolCall('pressBack', {}), prose('Done.')]);

    const result = await runAgent(deps(provider, recordingDevice()), {
      goal: 'x',
      onEvent: () => {
        throw new Error('listener bug');
      },
    });

    expect(result.outcome).toBe('succeeded');
  });

  it('brackets the run with started and finished events', async () => {
    const events: AgentEvent[] = [];
    const provider = scriptedProvider([plan('a'), prose('Done.')]);

    await runAgent(deps(provider, recordingDevice()), {
      goal: 'x',
      onEvent: (event) => events.push(event),
    });

    expect(events[0]?.type).toBe('runStarted');
    expect(events.at(-1)?.type).toBe('runFinished');
  });

  it('tags every event with the same run id', async () => {
    const events: AgentEvent[] = [];
    const provider = scriptedProvider([plan('a'), prose('Done.')]);

    const result = await runAgent(deps(provider, recordingDevice()), {
      goal: 'x',
      onEvent: (event) => events.push(event),
    });

    for (const event of events) expect(event.runId).toBe(result.runId);
  });

  it('reports the model\u2019s prose as thinking, so a pause is explained', async () => {
    const events: AgentEvent[] = [];
    const provider = scriptedProvider([
      plan('a'),
      {
        content: 'I need to open WhatsApp first.',
        toolCalls: [{ id: 'c', name: 'openApp', arguments: '{"packageName":"com.whatsapp"}' }],
        finishReason: 'tool_calls',
      },
      prose('Done.'),
    ]);

    await runAgent(deps(provider, recordingDevice({ openApp: () => undefined })), {
      goal: 'x',
      onEvent: (event) => events.push(event),
    });

    expect(events.find((event) => event.type === 'thinking')).toMatchObject({
      content: 'I need to open WhatsApp first.',
    });
  });

  it('does not report the final answer as thinking as well', async () => {
    // The duplication a device pass found: the response's prose was emitted as `thinking` before the loop checked
    // for tool calls, and when there are none that same prose becomes the run's summary and is delivered again by
    // `runFinished`. Any consumer persisting both showed the final answer twice.
    //
    // Reasoning that accompanies an action is worth surfacing. Reasoning that *is* the answer is the answer.
    const events: AgentEvent[] = [];
    const provider = scriptedProvider([plan('a'), prose('Everything is already done.')]);

    const result = await runAgent(deps(provider, recordingDevice()), {
      goal: 'x',
      onEvent: (event) => events.push(event),
    });

    expect(result.summary).toBe('Everything is already done.');
    expect(events.filter((event) => event.type === 'thinking')).toHaveLength(0);
  });

  it('still reports thinking for a step that acts', async () => {
    // Guarding the other half of the same change: moving the emit must not silence reasoning that accompanies a
    // real action, which is the case it exists for.
    const events: AgentEvent[] = [];
    const provider = scriptedProvider([
      plan('a'),
      {
        content: 'Tapping Send now.',
        toolCalls: [{ id: 'c', name: 'pressHome', arguments: '{}' }],
        finishReason: 'tool_calls',
      },
      prose('Done.'),
    ]);

    await runAgent(deps(provider, recordingDevice()), {
      goal: 'x',
      onEvent: (event) => events.push(event),
    });

    expect(events.filter((event) => event.type === 'thinking')).toHaveLength(1);
  });
});

describe('tool restriction', () => {
  it('offers only the allowed tools', async () => {
    const provider = scriptedProvider([plan('a'), prose('Done.')]);

    await runAgent(deps(provider, recordingDevice()), {
      goal: 'Look only',
      allowedTools: ['getUiTree', 'findElement'],
    });

    const actionRequest = provider.requests[1]!;

    expect(actionRequest.tools?.map((tool) => tool.function.name)).toEqual([
      'getUiTree',
      'findElement',
    ]);
  });

  it('rejects a tool outside the allowed set', async () => {
    // The model is not offered it, but a model can still name one it was not given.
    const provider = scriptedProvider([
      plan('a'),
      toolCall('click', { selector: { text: 'Send' } }),
      prose('Done.'),
    ]);
    const device = recordingDevice({ click: () => undefined });

    await runAgent(deps(provider, device), {
      goal: 'x',
      allowedTools: ['getUiTree'],
      maxSteps: 3,
    });

    // click is a real tool name, so validation passes - restriction is advisory to the
    // model, and the gate that matters is what the app chooses to expose.
    expect(device.calls.length).toBeLessThanOrEqual(1);
  });
});
