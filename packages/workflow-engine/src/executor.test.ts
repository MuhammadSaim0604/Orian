import {
  NodeExecutionError,
  NodeRegistry,
  createRecordingToolInvoker,
  defineNode,
} from '@mobile-automation/node-sdk';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { type ExecutionEvent } from './events';
import { executeWorkflow, runWorkflow } from './executor';
import { loadWorkflow } from './loader';

/** No delay, so retry policies do not make the suite slow. */
const noSleep = () => Promise.resolve();

const metadata = (label: string) => ({ label, position: { x: 0, y: 0 } });

const workflow = (nodes: unknown[], edges: unknown[] = [], variables: unknown[] = []) => ({
  id: 'wf_1',
  metadata: {
    name: 'Test',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  variables,
  nodes,
  edges,
});

/** Records the order nodes ran in. */
const tracingRegistry = (order: string[]) => {
  const registry = new NodeRegistry();

  registry.registerAll([
    defineNode({
      type: 'step',
      version: '1.0.0',
      kind: 'action',
      display: { label: 'Step', description: 'd', icon: 'i', category: 'Test' },
      configSchema: z.object({ tag: z.string().optional() }),
      inputs: [{ handle: 'in', label: 'In' }],
      outputs: [{ handle: 'next', label: 'Next' }],
      execute: async (context) => {
        order.push(context.config.tag ?? context.nodeId);
        return { outputs: { result: context.config.tag ?? context.nodeId } };
      },
    }),

    defineNode({
      type: 'gate',
      version: '1.0.0',
      kind: 'condition',
      display: { label: 'Gate', description: 'd', icon: 'i', category: 'Test' },
      configSchema: z.object({ take: z.enum(['true', 'false']) }),
      inputs: [{ handle: 'in', label: 'In' }],
      outputs: [
        { handle: 'true', label: 'True' },
        { handle: 'false', label: 'False' },
      ],
      execute: async (context) => {
        order.push(context.nodeId);
        return { branch: { handle: context.config.take } };
      },
    }),

    defineNode({
      type: 'counter',
      version: '1.0.0',
      kind: 'loop',
      display: { label: 'Counter', description: 'd', icon: 'i', category: 'Test' },
      configSchema: z.object({ times: z.number() }),
      inputs: [{ handle: 'in', label: 'In' }],
      outputs: [
        { handle: 'body', label: 'Body' },
        { handle: 'done', label: 'Done' },
      ],
      execute: async (context) => {
        const seen = context.variables.get('__count') ?? 0;
        const index = typeof seen === 'number' ? seen : 0;

        if (index >= context.config.times) {
          context.variables.set('__count', 0);
          return { branch: { handle: 'done' } };
        }

        context.variables.set('__count', index + 1);
        order.push(`${context.nodeId}#${index}`);
        return { branch: { handle: 'body' }, repeat: true };
      },
    }),

    defineNode({
      type: 'flaky',
      version: '1.0.0',
      kind: 'action',
      display: { label: 'Flaky', description: 'd', icon: 'i', category: 'Test' },
      configSchema: z.object({ failTimes: z.number().default(1) }),
      inputs: [{ handle: 'in', label: 'In' }],
      outputs: [{ handle: 'next', label: 'Next' }],
      execute: async (context) => {
        order.push(`attempt${context.attempt}`);

        if (context.attempt < context.config.failTimes) {
          throw new NodeExecutionError(context.nodeId, 'flaky', 'not yet', { retryable: true });
        }

        return { outputs: { result: 'ok' } };
      },
    }),

    defineNode({
      type: 'broken',
      version: '1.0.0',
      kind: 'action',
      display: { label: 'Broken', description: 'd', icon: 'i', category: 'Test' },
      configSchema: z.object({ retryable: z.boolean().default(false) }),
      inputs: [{ handle: 'in', label: 'In' }],
      outputs: [{ handle: 'next', label: 'Next' }],
      execute: async (context) => {
        order.push(context.nodeId);
        throw new NodeExecutionError(context.nodeId, 'broken', 'always fails', {
          retryable: context.config.retryable,
        });
      },
    }),

    defineNode({
      type: 'slow',
      version: '1.0.0',
      kind: 'action',
      display: { label: 'Slow', description: 'd', icon: 'i', category: 'Test' },
      configSchema: z.object({ ms: z.number() }),
      inputs: [{ handle: 'in', label: 'In' }],
      outputs: [{ handle: 'next', label: 'Next' }],
      execute: async (context) => {
        await new Promise((resolve) => setTimeout(resolve, context.config.ms));
        return {};
      },
    }),

    defineNode({
      type: 'writer',
      version: '1.0.0',
      kind: 'variable',
      display: { label: 'Writer', description: 'd', icon: 'i', category: 'Test' },
      configSchema: z.object({ name: z.string(), value: z.unknown() }),
      inputs: [{ handle: 'in', label: 'In' }],
      outputs: [{ handle: 'next', label: 'Next' }],
      execute: async (context) => {
        context.variables.set(context.config.name, context.config.value as never);
        return {};
      },
    }),

    defineNode({
      type: 'reader',
      version: '1.0.0',
      kind: 'action',
      display: { label: 'Reader', description: 'd', icon: 'i', category: 'Test' },
      configSchema: z.object({ from: z.string() }),
      inputs: [{ handle: 'in', label: 'In' }],
      outputs: [{ handle: 'next', label: 'Next' }],
      execute: async (context) => {
        order.push(`read:${JSON.stringify(context.inputs[context.config.from] ?? null)}`);
        return {};
      },
    }),
  ]);

  return registry;
};

describe('sequential execution', () => {
  it('runs a chain in order', async () => {
    const order: string[] = [];
    const registry = tracingRegistry(order);

    const result = await runWorkflow(
      workflow(
        [
          { id: 'a', type: 'step', config: { tag: 'first' }, metadata: metadata('A') },
          { id: 'b', type: 'step', config: { tag: 'second' }, metadata: metadata('B') },
          { id: 'c', type: 'step', config: { tag: 'third' }, metadata: metadata('C') },
        ],
        [
          { id: 'e1', source: 'a', target: 'b' },
          { id: 'e2', source: 'b', target: 'c' },
        ],
      ),
      registry,
      { sleep: noSleep },
    );

    expect(result.outcome).toBe('succeeded');
    expect(order).toEqual(['first', 'second', 'third']);
    expect(result.stepsRun).toBe(3);
  });

  it('records the trace, so the log can show what ran', async () => {
    const order: string[] = [];
    const registry = tracingRegistry(order);

    const result = await runWorkflow(
      workflow(
        [
          { id: 'a', type: 'step', metadata: metadata('A') },
          { id: 'b', type: 'step', metadata: metadata('B') },
        ],
        [{ id: 'e1', source: 'a', target: 'b' }],
      ),
      registry,
      { sleep: noSleep },
    );

    expect(result.trace).toEqual(['a', 'b']);
  });

  it('stops cleanly at the end of a chain', async () => {
    const order: string[] = [];
    const registry = tracingRegistry(order);

    const result = await runWorkflow(
      workflow([{ id: 'only', type: 'step', metadata: metadata('Only') }]),
      registry,
      { sleep: noSleep },
    );

    expect(result.outcome).toBe('succeeded');
    expect(result.stepsRun).toBe(1);
  });
});

describe('branching', () => {
  it('follows the handle the node names', async () => {
    const order: string[] = [];
    const registry = tracingRegistry(order);

    await runWorkflow(
      workflow(
        [
          { id: 'gate', type: 'gate', config: { take: 'true' }, metadata: metadata('Gate') },
          { id: 'yes', type: 'step', config: { tag: 'yes' }, metadata: metadata('Yes') },
          { id: 'no', type: 'step', config: { tag: 'no' }, metadata: metadata('No') },
        ],
        [
          { id: 'e1', source: 'gate', sourceHandle: 'true', target: 'yes' },
          { id: 'e2', source: 'gate', sourceHandle: 'false', target: 'no' },
        ],
      ),
      registry,
      { sleep: noSleep },
    );

    expect(order).toEqual(['gate', 'yes']);
  });

  it('takes the other branch when the node says so', async () => {
    const order: string[] = [];
    const registry = tracingRegistry(order);

    await runWorkflow(
      workflow(
        [
          { id: 'gate', type: 'gate', config: { take: 'false' }, metadata: metadata('Gate') },
          { id: 'yes', type: 'step', config: { tag: 'yes' }, metadata: metadata('Yes') },
          { id: 'no', type: 'step', config: { tag: 'no' }, metadata: metadata('No') },
        ],
        [
          { id: 'e1', source: 'gate', sourceHandle: 'true', target: 'yes' },
          { id: 'e2', source: 'gate', sourceHandle: 'false', target: 'no' },
        ],
      ),
      registry,
      { sleep: noSleep },
    );

    expect(order).toEqual(['gate', 'no']);
  });

  it('ends the run when a taken branch leads nowhere', async () => {
    const order: string[] = [];
    const registry = tracingRegistry(order);

    const result = await runWorkflow(
      workflow(
        [
          { id: 'gate', type: 'gate', config: { take: 'false' }, metadata: metadata('Gate') },
          { id: 'yes', type: 'step', metadata: metadata('Yes') },
        ],
        [{ id: 'e1', source: 'gate', sourceHandle: 'true', target: 'yes' }],
      ),
      registry,
      { sleep: noSleep },
    );

    expect(result.outcome).toBe('succeeded');
    expect(order).toEqual(['gate']);
  });

  it('announces the branch it took', async () => {
    const order: string[] = [];
    const events: ExecutionEvent[] = [];

    await runWorkflow(
      workflow(
        [
          { id: 'gate', type: 'gate', config: { take: 'true' }, metadata: metadata('Gate') },
          { id: 'yes', type: 'step', metadata: metadata('Yes') },
        ],
        [{ id: 'e1', source: 'gate', sourceHandle: 'true', target: 'yes' }],
      ),
      tracingRegistry(order),
      { sleep: noSleep, onEvent: (event) => events.push(event) },
    );

    const branch = events.find((event) => event.type === 'branchTaken');
    expect(branch).toMatchObject({ nodeId: 'gate', handle: 'true', targetNodeIds: ['yes'] });
  });
});

describe('loops', () => {
  it('re-enters a node that asks to repeat', async () => {
    // The loop body flows forward to a dead end; the engine returns to the loop
    // when it runs out of successors. No back-edge, so the graph stays acyclic and
    // cycle detection keeps its meaning.
    const order: string[] = [];
    const registry = tracingRegistry(order);

    const result = await runWorkflow(
      workflow(
        [
          { id: 'loop', type: 'counter', config: { times: 3 }, metadata: metadata('Loop') },
          { id: 'body', type: 'step', config: { tag: 'body' }, metadata: metadata('Body') },
          { id: 'after', type: 'step', config: { tag: 'after' }, metadata: metadata('After') },
        ],
        [
          { id: 'e1', source: 'loop', sourceHandle: 'body', target: 'body' },
          { id: 'e3', source: 'loop', sourceHandle: 'done', target: 'after' },
        ],
      ),
      registry,
      { sleep: noSleep },
    );

    expect(result.outcome).toBe('succeeded');
    expect(order).toEqual(['loop#0', 'body', 'loop#1', 'body', 'loop#2', 'body', 'after']);
  });

  it('finishes the loop and continues past it', async () => {
    const order: string[] = [];

    await runWorkflow(
      workflow(
        [
          { id: 'loop', type: 'counter', config: { times: 1 }, metadata: metadata('Loop') },
          { id: 'body', type: 'step', config: { tag: 'body' }, metadata: metadata('Body') },
          { id: 'after', type: 'step', config: { tag: 'after' }, metadata: metadata('After') },
        ],
        [
          { id: 'e1', source: 'loop', sourceHandle: 'body', target: 'body' },
          { id: 'e3', source: 'loop', sourceHandle: 'done', target: 'after' },
        ],
      ),
      tracingRegistry(order),
      { sleep: noSleep },
    );

    expect(order.at(-1)).toBe('after');
  });

  it('does not spin forever on a loop with an empty body', async () => {
    const order: string[] = [];

    const result = await runWorkflow(
      workflow(
        [
          { id: 'loop', type: 'counter', config: { times: 5 }, metadata: metadata('Loop') },
          { id: 'after', type: 'step', config: { tag: 'after' }, metadata: metadata('After') },
        ],
        [{ id: 'e1', source: 'loop', sourceHandle: 'done', target: 'after' }],
      ),
      tracingRegistry(order),
      { sleep: noSleep },
    );

    expect(result.outcome).toBe('succeeded');
    expect(order).toContain('after');
  });

  it('stops at the global step ceiling', async () => {
    // A backstop distinct from per-loop limits: nested loops multiply.
    const registry = new NodeRegistry();
    registry.register(
      defineNode({
        type: 'forever',
        version: '1.0.0',
        kind: 'loop',
        display: { label: 'Forever', description: 'd', icon: 'i', category: 'Test' },
        configSchema: z.object({}),
        inputs: [{ handle: 'in', label: 'In' }],
        outputs: [
          { handle: 'body', label: 'Body' },
          { handle: 'done', label: 'Done' },
        ],
        execute: async () => ({ branch: { handle: 'body' }, repeat: true }),
      }),
    );
    registry.register(
      defineNode({
        type: 'noop',
        version: '1.0.0',
        kind: 'action',
        display: { label: 'Noop', description: 'd', icon: 'i', category: 'Test' },
        configSchema: z.object({}),
        inputs: [{ handle: 'in', label: 'In' }],
        outputs: [{ handle: 'next', label: 'Next' }],
        execute: async () => ({}),
      }),
    );

    const result = await runWorkflow(
      workflow(
        [
          { id: 'loop', type: 'forever', metadata: metadata('Loop') },
          { id: 'body', type: 'noop', metadata: metadata('Body') },
        ],
        [{ id: 'e1', source: 'loop', sourceHandle: 'body', target: 'body' }],
      ),
      registry,
      { sleep: noSleep, maxSteps: 50 },
    );

    expect(result.outcome).toBe('failed');
    expect(result.error).toMatch(/50 steps/);
    expect(result.stepsRun).toBe(50);
  });
});

describe('variables', () => {
  it('carries values across nodes', async () => {
    const order: string[] = [];

    const result = await runWorkflow(
      workflow(
        [
          {
            id: 'w',
            type: 'writer',
            config: { name: 'greeting', value: 'hello' },
            metadata: metadata('W'),
          },
          { id: 's', type: 'step', metadata: metadata('S') },
        ],
        [{ id: 'e1', source: 'w', target: 's' }],
        [{ name: 'greeting', type: 'string' }],
      ),
      tracingRegistry(order),
      { sleep: noSleep },
    );

    expect(result.variables.greeting).toBe('hello');
  });

  it('seeds values collected before the run', async () => {
    const order: string[] = [];

    const result = await runWorkflow(
      workflow(
        [{ id: 's', type: 'step', metadata: metadata('S') }],
        [],
        [{ name: 'contactName', type: 'string' }],
      ),
      tracingRegistry(order),
      { sleep: noSleep, variables: { contactName: 'Robert' } },
    );

    expect(result.variables.contactName).toBe('Robert');
  });

  it('rejects a write of the wrong declared type', async () => {
    // Turns "the workflow did something strange twenty steps later" into a report
    // naming the node that wrote the wrong thing.
    const order: string[] = [];

    const result = await runWorkflow(
      workflow(
        [
          {
            id: 'w',
            type: 'writer',
            config: { name: 'count', value: 'not a number' },
            metadata: metadata('W'),
          },
        ],
        [],
        [{ name: 'count', type: 'number' }],
      ),
      tracingRegistry(order),
      { sleep: noSleep },
    );

    expect(result.outcome).toBe('failed');
    expect(result.error).toMatch(/declared as number/);
  });

  it('hides engine bookkeeping from the reported variables', async () => {
    // Loop counters live in the store so they survive re-entry, but they are an
    // implementation detail.
    const order: string[] = [];

    const result = await runWorkflow(
      workflow(
        [
          { id: 'loop', type: 'counter', config: { times: 1 }, metadata: metadata('Loop') },
          { id: 'body', type: 'step', metadata: metadata('Body') },
        ],
        [{ id: 'e1', source: 'loop', sourceHandle: 'body', target: 'body' }],
      ),
      tracingRegistry(order),
      { sleep: noSleep },
    );

    expect(Object.keys(result.variables)).not.toContain('__count');
  });

  it('announces each change for the debugger', async () => {
    const events: ExecutionEvent[] = [];

    await runWorkflow(
      workflow(
        [{ id: 'w', type: 'writer', config: { name: 'x', value: 1 }, metadata: metadata('W') }],
        [],
        [{ name: 'x', type: 'number' }],
      ),
      tracingRegistry([]),
      { sleep: noSleep, onEvent: (event) => events.push(event) },
    );

    const change = events.find((event) => event.type === 'variableChanged');
    expect(change).toMatchObject({ nodeId: 'w', name: 'x', value: 1 });
  });
});

describe('node inputs', () => {
  it('passes an upstream output to the next node', async () => {
    const order: string[] = [];

    await runWorkflow(
      workflow(
        [
          { id: 'a', type: 'step', config: { tag: 'produced' }, metadata: metadata('A') },
          { id: 'b', type: 'reader', config: { from: 'in' }, metadata: metadata('B') },
        ],
        [{ id: 'e1', source: 'a', target: 'b' }],
      ),
      tracingRegistry(order),
      { sleep: noSleep },
    );

    expect(order).toContain('read:"produced"');
  });
});

describe('retry policy', () => {
  it('retries a retryable failure up to the limit', async () => {
    const order: string[] = [];

    const result = await runWorkflow(
      workflow([
        {
          id: 'f',
          type: 'flaky',
          config: { failTimes: 2 },
          executionPolicy: { retry: 3, retryDelayMs: 0, onError: 'retry' },
          metadata: metadata('F'),
        },
      ]),
      tracingRegistry(order),
      { sleep: noSleep },
    );

    expect(result.outcome).toBe('succeeded');
    expect(order).toEqual(['attempt0', 'attempt1', 'attempt2']);
  });

  it('never retries a failure the node marked unretryable', async () => {
    // Repeating a call that cannot succeed only delays the real report.
    const order: string[] = [];

    const result = await runWorkflow(
      workflow([
        {
          id: 'b',
          type: 'broken',
          config: { retryable: false },
          executionPolicy: { retry: 5, retryDelayMs: 0, onError: 'retry' },
          metadata: metadata('B'),
        },
      ]),
      tracingRegistry(order),
      { sleep: noSleep },
    );

    expect(result.outcome).toBe('failed');
    expect(order).toEqual(['b']);
  });

  it('gives up after exhausting retries', async () => {
    const order: string[] = [];

    const result = await runWorkflow(
      workflow([
        {
          id: 'b',
          type: 'broken',
          config: { retryable: true },
          executionPolicy: { retry: 2, retryDelayMs: 0, onError: 'retry' },
          metadata: metadata('B'),
        },
      ]),
      tracingRegistry(order),
      { sleep: noSleep },
    );

    expect(result.outcome).toBe('failed');
    expect(order).toHaveLength(3);
  });

  it('waits between attempts', async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const order: string[] = [];

    await runWorkflow(
      workflow([
        {
          id: 'f',
          type: 'flaky',
          config: { failTimes: 1 },
          executionPolicy: { retry: 2, retryDelayMs: 750, onError: 'retry' },
          metadata: metadata('F'),
        },
      ]),
      tracingRegistry(order),
      { sleep },
    );

    expect(sleep).toHaveBeenCalledWith(750);
  });

  it('emits a retrying event so the log shows the attempt', async () => {
    const events: ExecutionEvent[] = [];

    await runWorkflow(
      workflow([
        {
          id: 'f',
          type: 'flaky',
          config: { failTimes: 1 },
          executionPolicy: { retry: 2, retryDelayMs: 0, onError: 'retry' },
          metadata: metadata('F'),
        },
      ]),
      tracingRegistry([]),
      { sleep: noSleep, onEvent: (event) => events.push(event) },
    );

    const retrying = events.find((event) => event.type === 'nodeRetrying');
    expect(retrying).toMatchObject({ nodeId: 'f', attempt: 1, ofAttempts: 2 });
  });

  it("uses a definition's default policy when the workflow has not set one", async () => {
    // Some steps are inherently flaky; expecting every user to discover that and
    // configure retries by hand would make the product feel unreliable.
    const registry = new NodeRegistry();
    const attempts: number[] = [];

    registry.register(
      defineNode({
        type: 'needsRetry',
        version: '1.0.0',
        kind: 'action',
        display: { label: 'Needs Retry', description: 'd', icon: 'i', category: 'Test' },
        configSchema: z.object({}),
        inputs: [{ handle: 'in', label: 'In' }],
        outputs: [{ handle: 'next', label: 'Next' }],
        defaultExecutionPolicy: { retry: 2, retryDelayMs: 0, onError: 'retry' },
        execute: async (context) => {
          attempts.push(context.attempt);
          if (context.attempt < 1) {
            throw new NodeExecutionError(context.nodeId, 'needsRetry', 'again', {
              retryable: true,
            });
          }
          return {};
        },
      }),
    );

    const result = await runWorkflow(
      workflow([{ id: 'n', type: 'needsRetry', metadata: metadata('N') }]),
      registry,
      { sleep: noSleep },
    );

    expect(result.outcome).toBe('succeeded');
    expect(attempts).toEqual([0, 1]);
  });
});

describe('error behaviour', () => {
  it('stops the run by default', async () => {
    const order: string[] = [];

    const result = await runWorkflow(
      workflow(
        [
          { id: 'b', type: 'broken', metadata: metadata('B') },
          { id: 'after', type: 'step', config: { tag: 'after' }, metadata: metadata('After') },
        ],
        [{ id: 'e1', source: 'b', target: 'after' }],
      ),
      tracingRegistry(order),
      { sleep: noSleep },
    );

    expect(result.outcome).toBe('failed');
    expect(result.failedNodeId).toBe('b');
    expect(order).not.toContain('after');
  });

  it('continues past a failure when told to', async () => {
    const order: string[] = [];

    const result = await runWorkflow(
      workflow(
        [
          {
            id: 'b',
            type: 'broken',
            executionPolicy: { retry: 0, retryDelayMs: 0, onError: 'continue' },
            metadata: metadata('B'),
          },
          { id: 'after', type: 'step', config: { tag: 'after' }, metadata: metadata('After') },
        ],
        [{ id: 'e1', source: 'b', target: 'after' }],
      ),
      tracingRegistry(order),
      { sleep: noSleep },
    );

    expect(result.outcome).toBe('succeeded');
    expect(order).toContain('after');
  });

  it('names the failing node and the reason', async () => {
    const result = await runWorkflow(
      workflow([{ id: 'b', type: 'broken', metadata: metadata('B') }]),
      tracingRegistry([]),
      { sleep: noSleep },
    );

    expect(result.failedNodeId).toBe('b');
    expect(result.error).toContain('always fails');
  });

  it('reports whether the user can fix the failure', async () => {
    const registry = new NodeRegistry();
    registry.register(
      defineNode({
        type: 'needsPermission',
        version: '1.0.0',
        kind: 'action',
        display: { label: 'Needs Permission', description: 'd', icon: 'i', category: 'Test' },
        configSchema: z.object({}),
        inputs: [{ handle: 'in', label: 'In' }],
        outputs: [{ handle: 'next', label: 'Next' }],
        execute: async (context) => {
          throw new NodeExecutionError(
            context.nodeId,
            'needsPermission',
            'no accessibility grant',
            {
              retryable: false,
              needsUserAction: true,
            },
          );
        },
      }),
    );

    const events: ExecutionEvent[] = [];

    await runWorkflow(
      workflow([{ id: 'n', type: 'needsPermission', metadata: metadata('N') }]),
      registry,
      { sleep: noSleep, onEvent: (event) => events.push(event) },
    );

    const failed = events.find((event) => event.type === 'nodeFailed');
    expect(failed).toMatchObject({ needsUserAction: true, retryable: false });
  });
});

describe('timeouts', () => {
  it('fails a node that exceeds its budget', async () => {
    const result = await runWorkflow(
      workflow([
        {
          id: 's',
          type: 'slow',
          config: { ms: 200 },
          executionPolicy: { retry: 0, retryDelayMs: 0, timeoutMs: 20, onError: 'stop' },
          metadata: metadata('S'),
        },
      ]),
      tracingRegistry([]),
      { sleep: noSleep },
    );

    expect(result.outcome).toBe('failed');
    expect(result.error).toMatch(/longer than 20ms/);
  });

  it('lets a node inside its budget finish', async () => {
    const result = await runWorkflow(
      workflow([
        {
          id: 's',
          type: 'slow',
          config: { ms: 5 },
          executionPolicy: { retry: 0, retryDelayMs: 0, timeoutMs: 1_000, onError: 'stop' },
          metadata: metadata('S'),
        },
      ]),
      tracingRegistry([]),
      { sleep: noSleep },
    );

    expect(result.outcome).toBe('succeeded');
  });
});

describe('cancellation', () => {
  it('reports a stopped run as cancelled, not failed', async () => {
    // The user stopping a workflow is a normal outcome.
    const controller = new AbortController();
    controller.abort();

    const result = await runWorkflow(
      workflow([{ id: 's', type: 'step', metadata: metadata('S') }]),
      tracingRegistry([]),
      { sleep: noSleep, signal: controller.signal },
    );

    expect(result.outcome).toBe('cancelled');
  });

  it('stops between nodes', async () => {
    const order: string[] = [];
    const controller = new AbortController();

    const registry = tracingRegistry(order);
    registry.register(
      defineNode({
        type: 'stopper',
        version: '1.0.0',
        kind: 'action',
        display: { label: 'Stopper', description: 'd', icon: 'i', category: 'Test' },
        configSchema: z.object({}),
        inputs: [{ handle: 'in', label: 'In' }],
        outputs: [{ handle: 'next', label: 'Next' }],
        execute: async () => {
          controller.abort();
          return {};
        },
      }),
    );

    const result = await runWorkflow(
      workflow(
        [
          { id: 'stop', type: 'stopper', metadata: metadata('Stop') },
          { id: 'after', type: 'step', config: { tag: 'after' }, metadata: metadata('After') },
        ],
        [{ id: 'e1', source: 'stop', target: 'after' }],
      ),
      registry,
      { sleep: noSleep, signal: controller.signal },
    );

    expect(result.outcome).toBe('cancelled');
    expect(order).not.toContain('after');
  });
});

describe('events', () => {
  it('brackets the run with started and finished', async () => {
    const events: ExecutionEvent[] = [];

    await runWorkflow(
      workflow([{ id: 's', type: 'step', metadata: metadata('S') }]),
      tracingRegistry([]),
      { sleep: noSleep, onEvent: (event) => events.push(event) },
    );

    expect(events[0]?.type).toBe('workflowStarted');
    expect(events.at(-1)?.type).toBe('workflowFinished');
  });

  it('reports each node starting and succeeding', async () => {
    const events: ExecutionEvent[] = [];

    await runWorkflow(
      workflow([{ id: 's', type: 'step', metadata: metadata('S') }]),
      tracingRegistry([]),
      { sleep: noSleep, onEvent: (event) => events.push(event) },
    );

    expect(events.some((event) => event.type === 'nodeStarted')).toBe(true);
    expect(events.some((event) => event.type === 'nodeSucceeded')).toBe(true);
  });

  it('tags every event with the same execution id', async () => {
    const events: ExecutionEvent[] = [];

    const result = await runWorkflow(
      workflow([{ id: 's', type: 'step', metadata: metadata('S') }]),
      tracingRegistry([]),
      { sleep: noSleep, onEvent: (event) => events.push(event) },
    );

    for (const event of events) {
      expect(event.executionId).toBe(result.executionId);
    }
  });

  it('survives a listener that throws', async () => {
    // A UI bug in the log view must not abandon a half-finished workflow on the
    // user's phone.
    const result = await runWorkflow(
      workflow([{ id: 's', type: 'step', metadata: metadata('S') }]),
      tracingRegistry([]),
      {
        sleep: noSleep,
        onEvent: () => {
          throw new Error('listener bug');
        },
      },
    );

    expect(result.outcome).toBe('succeeded');
  });

  it('forwards a node log line', async () => {
    const registry = new NodeRegistry();
    registry.register(
      defineNode({
        type: 'chatty',
        version: '1.0.0',
        kind: 'action',
        display: { label: 'Chatty', description: 'd', icon: 'i', category: 'Test' },
        configSchema: z.object({}),
        inputs: [{ handle: 'in', label: 'In' }],
        outputs: [{ handle: 'next', label: 'Next' }],
        execute: async (context) => {
          context.log('doing the thing');
          return {};
        },
      }),
    );

    const events: ExecutionEvent[] = [];

    await runWorkflow(workflow([{ id: 'c', type: 'chatty', metadata: metadata('C') }]), registry, {
      sleep: noSleep,
      onEvent: (event) => events.push(event),
    });

    const log = events.find((event) => event.type === 'log');
    expect(log).toMatchObject({ nodeId: 'c', message: 'doing the thing' });
  });
});

describe('device tools', () => {
  it('passes the invoker through to nodes', async () => {
    const tools = createRecordingToolInvoker({ click: () => undefined });
    const registry = new NodeRegistry();

    registry.register(
      defineNode({
        type: 'tapper',
        version: '1.0.0',
        kind: 'action',
        display: { label: 'Tapper', description: 'd', icon: 'i', category: 'Test' },
        configSchema: z.object({}),
        inputs: [{ handle: 'in', label: 'In' }],
        outputs: [{ handle: 'next', label: 'Next' }],
        requiresDevice: true,
        execute: async (context) => {
          await context.tools.invoke('click', { selector: { text: 'Send' } });
          return {};
        },
      }),
    );

    await runWorkflow(workflow([{ id: 't', type: 'tapper', metadata: metadata('T') }]), registry, {
      sleep: noSleep,
      tools,
    });

    expect(tools.calls[0]?.tool).toBe('click');
  });

  it('defaults to refusing tool calls when no device is supplied', async () => {
    const registry = new NodeRegistry();

    registry.register(
      defineNode({
        type: 'tapper',
        version: '1.0.0',
        kind: 'action',
        display: { label: 'Tapper', description: 'd', icon: 'i', category: 'Test' },
        configSchema: z.object({}),
        inputs: [{ handle: 'in', label: 'In' }],
        outputs: [{ handle: 'next', label: 'Next' }],
        requiresDevice: true,
        execute: async (context) => {
          await context.tools.invoke('click', {});
          return {};
        },
      }),
    );

    const result = await runWorkflow(
      workflow([{ id: 't', type: 'tapper', metadata: metadata('T') }]),
      registry,
      { sleep: noSleep },
    );

    expect(result.outcome).toBe('failed');
    expect(result.error).toMatch(/no device/i);
  });
});

describe('executeWorkflow', () => {
  it('accepts an already-loaded workflow', async () => {
    const order: string[] = [];
    const registry = tracingRegistry(order);
    const loaded = loadWorkflow(
      workflow([{ id: 's', type: 'step', metadata: metadata('S') }]),
      registry,
    );

    const result = await executeWorkflow(loaded, { sleep: noSleep });

    expect(result.outcome).toBe('succeeded');
  });
});
