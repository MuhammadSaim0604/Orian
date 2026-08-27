import {
  createRecordingToolInvoker,
  createTestContext,
  createVariableStore,
  executeNode,
} from '@mobile-automation/node-sdk';
import { describe, expect, it } from 'vitest';

import { compare, conditionNode } from './condition-node';

const run = (config: unknown, options: Parameters<typeof createTestContext>[0] = { config: {} }) =>
  executeNode(conditionNode, { ...createTestContext(options), config });

describe('comparison operators', () => {
  it('compares equality', () => {
    expect(compare('a', 'equals', 'a')).toBe(true);
    expect(compare('a', 'equals', 'b')).toBe(false);
    expect(compare('a', 'notEquals', 'b')).toBe(true);
  });

  it('does not distinguish 5 from "5"', () => {
    // Values from a text input are strings even when the user typed a number, and
    // requiring exact types would fail for a reason invisible on the canvas.
    expect(compare(5, 'equals', '5')).toBe(true);
    expect(compare('5', 'equals', 5)).toBe(true);
  });

  it('compares objects structurally', () => {
    expect(compare({ a: 1 }, 'equals', { a: 1 })).toBe(true);
    expect(compare({ a: 1 }, 'equals', { a: 2 })).toBe(false);
  });

  it('finds a substring', () => {
    expect(compare('Robert Smith', 'contains', 'Smith')).toBe(true);
    expect(compare('Robert Smith', 'notContains', 'Jones')).toBe(true);
  });

  it('finds membership in a list', () => {
    expect(compare(['a', 'b'], 'contains', 'b')).toBe(true);
    expect(compare(['a', 'b'], 'contains', 'z')).toBe(false);
  });

  it('finds a key in an object', () => {
    expect(compare({ name: 'x' }, 'contains', 'name')).toBe(true);
    expect(compare({ name: 'x' }, 'contains', 'age')).toBe(false);
  });

  it('compares numbers, coercing strings', () => {
    expect(compare(5, 'greaterThan', 3)).toBe(true);
    expect(compare('5', 'greaterThan', 3)).toBe(true);
    expect(compare(3, 'lessThan', 5)).toBe(true);
  });

  it('refuses to compare non-numbers numerically', () => {
    // Returning false would let a workflow branch on nonsense.
    expect(() => compare('hello', 'greaterThan', 3)).toThrow(/numerically/);
  });

  it('tests emptiness', () => {
    expect(compare('', 'isEmpty', undefined)).toBe(true);
    expect(compare([], 'isEmpty', undefined)).toBe(true);
    expect(compare('x', 'isNotEmpty', undefined)).toBe(true);
    expect(compare(0, 'isEmpty', undefined)).toBe(true);
  });
});

describe('condition node', () => {
  it('takes the true branch when a comparison holds', async () => {
    const result = await run(
      {
        condition: {
          type: 'comparison',
          left: { from: 'variable', name: 'count' },
          operator: 'greaterThan',
          right: { from: 'literal', value: 3 },
        },
      },
      { config: {}, variables: createVariableStore({ count: 5 }) },
    );

    expect(result.branch?.handle).toBe('true');
    expect(result.outputs?.result).toBe(true);
  });

  it('takes the false branch when it does not', async () => {
    const result = await run(
      {
        condition: {
          type: 'comparison',
          left: { from: 'variable', name: 'count' },
          operator: 'greaterThan',
          right: { from: 'literal', value: 10 },
        },
      },
      { config: {}, variables: createVariableStore({ count: 5 }) },
    );

    expect(result.branch?.handle).toBe('false');
  });

  it('inverts the result when negate is set', async () => {
    const result = await run({
      condition: {
        type: 'comparison',
        left: { from: 'literal', value: 'x' },
        operator: 'isEmpty',
      },
      negate: true,
    });

    // 'x' is not empty, so isEmpty is false, and negate makes it true.
    expect(result.branch?.handle).toBe('true');
  });

  it('reports which branch it took, so the log shows the decision', async () => {
    const lines: string[] = [];

    const result = await run(
      {
        condition: {
          type: 'comparison',
          left: { from: 'literal', value: 1 },
          operator: 'isNotEmpty',
        },
      },
      { config: {}, onLog: (line) => lines.push(line) },
    );

    expect(result.summary).toContain('true branch');
    expect(lines.join(' ')).toContain('true');
  });
});

describe('element_exists', () => {
  it('is true when the element resolves', async () => {
    const tools = createRecordingToolInvoker({ findElement: () => ({ text: 'Send' }) });

    const result = await run(
      { condition: { type: 'element_exists', selector: { text: 'Send' } } },
      { config: {}, tools },
    );

    expect(result.branch?.handle).toBe('true');
    expect(tools.calls[0]?.tool).toBe('findElement');
  });

  it('is false when it does not, rather than failing the node', async () => {
    // The whole point of the condition is to ask whether something is present, so
    // "not found" is an answer, not an error.
    const tools = createRecordingToolInvoker({
      findElement: () => {
        throw new Error('element_not_found');
      },
    });

    const result = await run(
      { condition: { type: 'element_exists', selector: { text: 'Send' } } },
      { config: {}, tools },
    );

    expect(result.branch?.handle).toBe('false');
  });

  it('waits when a timeout is given, since a loading screen is the usual cause', async () => {
    const tools = createRecordingToolInvoker({ waitForElement: () => ({ text: 'Send' }) });

    await run(
      { condition: { type: 'element_exists', selector: { text: 'Send' }, timeoutMs: 3000 } },
      { config: {}, tools },
    );

    expect(tools.calls[0]?.tool).toBe('waitForElement');
    expect(tools.calls[0]?.args.timeoutMs).toBe(3000);
  });

  it('says a device is needed rather than reporting the element absent', async () => {
    // A different problem with a different fix: the user can attach a device.
    await expect(
      run({ condition: { type: 'element_exists', selector: { text: 'Send' } } }),
    ).rejects.toThrow(/no device is attached/);
  });
});

describe('current_app', () => {
  it('is true when the foreground package matches', async () => {
    const tools = createRecordingToolInvoker({
      getCurrentScreen: () => ({ packageName: 'com.whatsapp' }),
    });

    const result = await run(
      { condition: { type: 'current_app', packageName: 'com.whatsapp' } },
      { config: {}, tools },
    );

    expect(result.branch?.handle).toBe('true');
  });

  it('is false when a different app is in front', async () => {
    const tools = createRecordingToolInvoker({
      getCurrentScreen: () => ({ packageName: 'com.telegram' }),
    });

    const result = await run(
      { condition: { type: 'current_app', packageName: 'com.whatsapp' } },
      { config: {}, tools },
    );

    expect(result.branch?.handle).toBe('false');
  });
});

describe('config validation', () => {
  it('rejects a binary comparison with no right-hand value', async () => {
    await expect(
      run({
        condition: {
          type: 'comparison',
          left: { from: 'literal', value: 1 },
          operator: 'greaterThan',
        },
      }),
    ).rejects.toThrow(/invalid configuration/);
  });

  it('rejects a selector that cannot locate anything', async () => {
    await expect(
      run({ condition: { type: 'element_exists', selector: { className: 'Button' } } }),
    ).rejects.toThrow(/invalid configuration/);
  });
});
