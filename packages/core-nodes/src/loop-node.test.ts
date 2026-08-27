import {
  createRecordingToolInvoker,
  createTestContext,
  createVariableStore,
  executeNode,
} from '@mobile-automation/node-sdk';
import { describe, expect, it } from 'vitest';

import { loopNode, iterationVariableName } from './loop-node';

const run = (config: unknown, options: Parameters<typeof createTestContext>[0] = { config: {} }) =>
  executeNode(loopNode, { ...createTestContext(options), config });

describe('count loop', () => {
  it('enters the body on the first call', async () => {
    const store = createVariableStore();

    const result = await run({ kind: 'count', iterations: 3 }, { config: {}, variables: store });

    expect(result.branch?.handle).toBe('body');
    expect(result.repeat).toBe(true);
    expect(result.outputs?.index).toBe(0);
  });

  it('advances the counter in the variable store, not in the node', async () => {
    // A node holding a private counter would be wrong the moment an outer loop
    // re-entered it, or the workflow was paused and resumed.
    const store = createVariableStore();
    const counter = iterationVariableName('test_node');

    await run({ kind: 'count', iterations: 3 }, { config: {}, variables: store });

    expect(store.get(counter)).toBe(1);
  });

  it('finishes after the requested number of iterations', async () => {
    const store = createVariableStore();
    const config = { kind: 'count', iterations: 2 };

    const first = await run(config, { config: {}, variables: store });
    const second = await run(config, { config: {}, variables: store });
    const third = await run(config, { config: {}, variables: store });

    expect(first.branch?.handle).toBe('body');
    expect(second.branch?.handle).toBe('body');
    expect(third.branch?.handle).toBe('done');
    expect(third.outputs?.iterations).toBe(2);
  });

  it('resets its counter when finished so it can be re-entered', async () => {
    const store = createVariableStore();
    const counter = iterationVariableName('test_node');
    const config = { kind: 'count', iterations: 1 };

    await run(config, { config: {}, variables: store });
    await run(config, { config: {}, variables: store });

    expect(store.get(counter)).toBe(0);
  });

  it('exposes the index in a named variable when asked', async () => {
    const store = createVariableStore();

    await run(
      { kind: 'count', iterations: 3, indexVariable: 'i' },
      { config: {}, variables: store },
    );

    expect(store.get('i')).toBe(0);
  });
});

describe('forEach loop', () => {
  it('exposes each item in turn', async () => {
    const store = createVariableStore({ contacts: ['Robert', 'Alice'] });
    const config = {
      kind: 'forEach',
      items: { from: 'variable', name: 'contacts' },
      itemVariable: 'contact',
    };

    await run(config, { config: {}, variables: store });
    expect(store.get('contact')).toBe('Robert');

    await run(config, { config: {}, variables: store });
    expect(store.get('contact')).toBe('Alice');

    const done = await run(config, { config: {}, variables: store });
    expect(done.branch?.handle).toBe('done');
  });

  it('publishes the item on its output too', async () => {
    const store = createVariableStore({ items: [{ id: 1 }] });

    const result = await run(
      { kind: 'forEach', items: { from: 'variable', name: 'items' }, itemVariable: 'item' },
      { config: {}, variables: store },
    );

    expect(result.outputs?.item).toEqual({ id: 1 });
  });

  it('finishes immediately on an empty list', async () => {
    const store = createVariableStore({ items: [] });

    const result = await run(
      { kind: 'forEach', items: { from: 'variable', name: 'items' }, itemVariable: 'item' },
      { config: {}, variables: store },
    );

    expect(result.branch?.handle).toBe('done');
    expect(result.outputs?.iterations).toBe(0);
  });

  it('honours a lower maxIterations than the list length', async () => {
    const store = createVariableStore({ items: [1, 2, 3, 4, 5] });
    const config = {
      kind: 'forEach',
      items: { from: 'variable', name: 'items' },
      itemVariable: 'item',
      maxIterations: 2,
    };

    await run(config, { config: {}, variables: store });
    await run(config, { config: {}, variables: store });
    const done = await run(config, { config: {}, variables: store });

    expect(done.branch?.handle).toBe('done');
    expect(done.summary).toContain('2');
  });

  it('fails clearly when the value is not a list', async () => {
    const store = createVariableStore({ items: 'not a list' });

    await expect(
      run(
        { kind: 'forEach', items: { from: 'variable', name: 'items' }, itemVariable: 'item' },
        { config: {}, variables: store },
      ),
    ).rejects.toThrow(/needs a list but received string/);
  });
});

describe('while loop', () => {
  it('continues while the condition holds', async () => {
    const store = createVariableStore({ keepGoing: true });
    const config = {
      kind: 'while',
      condition: {
        type: 'comparison',
        left: { from: 'variable', name: 'keepGoing' },
        operator: 'equals',
        right: { from: 'literal', value: true },
      },
      maxIterations: 10,
    };

    const first = await run(config, { config: {}, variables: store });
    expect(first.branch?.handle).toBe('body');

    store.set('keepGoing', false);

    const second = await run(config, { config: {}, variables: store });
    expect(second.branch?.handle).toBe('done');
    expect(second.summary).toBeDefined();
  });

  it('stops at the safety limit even if the condition still holds', async () => {
    // A workflow that taps forever is worse than one that stops early, so the
    // ceiling wins.
    const store = createVariableStore();
    const config = {
      kind: 'while',
      condition: {
        type: 'comparison',
        left: { from: 'literal', value: true },
        operator: 'isNotEmpty',
      },
      maxIterations: 3,
    };

    let iterations = 0;
    for (let call = 0; call < 10; call++) {
      const result = await run(config, { config: {}, variables: store });
      if (result.branch?.handle === 'done') break;
      iterations++;
    }

    expect(iterations).toBe(3);
  });

  it('can test the screen through the tool invoker', async () => {
    const tools = createRecordingToolInvoker({
      findElement: () => {
        throw new Error('element_not_found');
      },
    });

    const result = await run(
      {
        kind: 'while',
        condition: { type: 'element_exists', selector: { text: 'Next' } },
        maxIterations: 5,
      },
      { config: {}, tools, variables: createVariableStore() },
    );

    expect(result.branch?.handle).toBe('done');
  });
});

describe('nested loops', () => {
  it('keeps separate counters per node id', async () => {
    // Namespacing by node id is what stops an inner loop clobbering an outer one.
    const store = createVariableStore();
    const config = { kind: 'count', iterations: 2 };

    await executeNode(loopNode, {
      ...createTestContext({ config: {}, nodeId: 'outer', variables: store }),
      config,
    });
    await executeNode(loopNode, {
      ...createTestContext({ config: {}, nodeId: 'inner', variables: store }),
      config,
    });

    expect(store.get(iterationVariableName('outer'))).toBe(1);
    expect(store.get(iterationVariableName('inner'))).toBe(1);
  });
});
