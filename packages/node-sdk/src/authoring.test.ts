import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  createRecordingToolInvoker,
  createTestContext,
  createVariableStore,
  defineNode,
  executeNode,
  unavailableToolInvoker,
} from './authoring';
import { isNodeExecutionError } from './errors';

const configSchema = z.object({ text: z.string().min(1), times: z.number().int().default(1) });

const repeatNode = defineNode({
  type: 'repeat',
  version: '1.0.0',
  kind: 'transform',
  display: { label: 'Repeat', description: 'Repeats text', icon: 'repeat', category: 'Test' },
  configSchema,
  inputs: [],
  outputs: [{ handle: 'next', label: 'Next' }],
  execute: async (context) => ({
    outputs: { result: context.config.text.repeat(context.config.times) },
  }),
});

describe('executeNode', () => {
  it('validates config before running the node', async () => {
    const result = await executeNode(repeatNode, {
      ...createTestContext({ config: {} }),
      config: { text: 'ab', times: 3 },
    });

    expect(result.outputs?.result).toBe('ababab');
  });

  it('applies schema defaults', async () => {
    const result = await executeNode(repeatNode, {
      ...createTestContext({ config: {} }),
      config: { text: 'x' },
    });

    expect(result.outputs?.result).toBe('x');
  });

  it('rejects invalid config naming the field at fault', async () => {
    await expect(
      executeNode(repeatNode, {
        ...createTestContext({ config: {} }),
        config: { text: '' },
      }),
    ).rejects.toThrow(/invalid configuration.*text/s);
  });

  it('does not call execute when config is invalid', async () => {
    const execute = vi.fn();
    const node = defineNode({ ...repeatNode, execute });

    await expect(
      executeNode(node, { ...createTestContext({ config: {} }), config: { text: 123 } }),
    ).rejects.toThrow();

    expect(execute).not.toHaveBeenCalled();
  });

  it('marks a config failure as not retryable', async () => {
    // Re-running a node with the same bad config can never succeed; retrying would
    // burn the budget and delay the real report.
    try {
      await executeNode(repeatNode, {
        ...createTestContext({ config: {} }),
        config: { text: '' },
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isNodeExecutionError(error)).toBe(true);
      if (isNodeExecutionError(error)) expect(error.retryable).toBe(false);
    }
  });

  it('names the node id in the error', async () => {
    await expect(
      executeNode(repeatNode, {
        ...createTestContext({ config: {}, nodeId: 'repeat_7' }),
        config: {},
      }),
    ).rejects.toThrow(/repeat_7/);
  });
});

describe('variable store', () => {
  it('starts from the supplied values', () => {
    const store = createVariableStore({ name: 'Robert' });

    expect(store.get('name')).toBe('Robert');
    expect(store.has('name')).toBe(true);
  });

  it('reads and writes', () => {
    const store = createVariableStore();
    store.set('count', 3);

    expect(store.get('count')).toBe(3);
  });

  it('reports an unset variable as undefined', () => {
    expect(createVariableStore().get('nope')).toBeUndefined();
  });

  it('distinguishes a null value from an unset one', () => {
    // A workflow may legitimately set a variable to null; that is not the same as
    // never having set it, and a condition might branch on the difference.
    const store = createVariableStore();
    store.set('cleared', null);

    expect(store.get('cleared')).toBeNull();
    expect(store.has('cleared')).toBe(true);
    expect(store.has('never')).toBe(false);
  });

  it('snapshots without aliasing the live store', () => {
    // The debugger holds snapshots; mutating one must not reach into a running
    // workflow.
    const store = createVariableStore({ contact: { name: 'Robert' } });
    const snapshot = store.snapshot();

    (snapshot.contact as { name: string }).name = 'Mallory';

    expect(store.get('contact')).toEqual({ name: 'Robert' });
  });
});

describe('tool invokers', () => {
  it('refuses every call when no device is attached', async () => {
    expect(unavailableToolInvoker.isAvailable).toBe(false);
    await expect(unavailableToolInvoker.invoke('click', {})).rejects.toThrow(/no device/i);
  });

  it('records what a node asked the device to do', async () => {
    const invoker = createRecordingToolInvoker({
      click: () => undefined,
    });

    await invoker.invoke('click', { selector: { text: 'Send' } });

    expect(invoker.calls).toEqual([{ tool: 'click', args: { selector: { text: 'Send' } } }]);
  });

  it('returns whatever the fake handler produces', async () => {
    const invoker = createRecordingToolInvoker({
      getCurrentScreen: () => ({ packageName: 'com.whatsapp' }),
    });

    await expect(invoker.invoke('getCurrentScreen', {})).resolves.toEqual({
      packageName: 'com.whatsapp',
    });
  });

  it('fails loudly for an unstubbed tool', async () => {
    // Silently returning undefined would let a test pass while asserting nothing.
    await expect(createRecordingToolInvoker().invoke('click', {})).rejects.toThrow(
      /No fake handler/,
    );
  });

  it('copies call arguments so later mutation cannot rewrite history', async () => {
    const invoker = createRecordingToolInvoker({ typeText: () => undefined });
    const args = { text: 'hello' };

    await invoker.invoke('typeText', args);
    args.text = 'changed';

    expect(invoker.calls[0]?.args).toEqual({ text: 'hello' });
  });
});

describe('createTestContext', () => {
  it('defaults every field so a test states only what it cares about', () => {
    const context = createTestContext({ config: { text: 'x' } });

    expect(context.nodeId).toBe('test_node');
    expect(context.inputs).toEqual({});
    expect(context.attempt).toBe(0);
    expect(context.tools.isAvailable).toBe(false);
    expect(context.signal.aborted).toBe(false);
  });

  it('accepts overrides', () => {
    const store = createVariableStore({ a: 1 });
    const context = createTestContext({
      config: {},
      nodeId: 'n1',
      inputs: { in: 'value' },
      variables: store,
      attempt: 2,
    });

    expect(context.nodeId).toBe('n1');
    expect(context.inputs.in).toBe('value');
    expect(context.variables.get('a')).toBe(1);
    expect(context.attempt).toBe(2);
  });

  it('captures log output', () => {
    const lines: string[] = [];
    const context = createTestContext({ config: {}, onLog: (line) => lines.push(line) });

    context.log('opened WhatsApp');

    expect(lines).toEqual(['opened WhatsApp']);
  });
});
