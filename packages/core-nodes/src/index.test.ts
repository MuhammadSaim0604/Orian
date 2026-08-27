import {
  createRecordingToolInvoker,
  createTestContext,
  createVariableStore,
} from '@mobile-automation/node-sdk';
import { describe, expect, it } from 'vitest';

import {
  PACKAGE_NAME,
  PROVIDED_KINDS,
  coreNodes,
  interpolate,
  isTruthy,
  providesKind,
  resolveValue,
  stringify,
} from './index';

describe('core-nodes', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@mobile-automation/core-nodes');
  });

  it('provides every device-agnostic kind', () => {
    expect(PROVIDED_KINDS).toHaveLength(7);
    expect(providesKind('condition')).toBe(true);
  });

  it('exports one definition per kind', () => {
    expect(coreNodes).toHaveLength(7);

    const kinds = coreNodes.map((node) => node.kind).sort();
    expect(kinds).toEqual([
      'action',
      'condition',
      'input',
      'loop',
      'transform',
      'trigger',
      'variable',
    ]);
  });

  it('gives every node a unique type', () => {
    const types = coreNodes.map((node) => node.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('marks only the device-touching nodes as requiring a device', () => {
    // condition can inspect the screen but also works on pure comparisons, so it
    // is not unconditionally device-dependent.
    const requiring = coreNodes.filter((node) => node.requiresDevice === true).map((n) => n.type);
    expect(requiring).toEqual(['action']);
  });

  it('gives every node a label, icon, and category for the palette', () => {
    for (const node of coreNodes) {
      expect(node.display.label.length).toBeGreaterThan(0);
      expect(node.display.icon.length).toBeGreaterThan(0);
      expect(node.display.category.length).toBeGreaterThan(0);
    }
  });
});

describe('resolveValue', () => {
  it('reads a literal', () => {
    const context = createTestContext({ config: {} });
    expect(resolveValue({ from: 'literal', value: 42 }, context, 'test')).toBe(42);
  });

  it('reads a variable', () => {
    const context = createTestContext({
      config: {},
      variables: createVariableStore({ name: 'Robert' }),
    });

    expect(resolveValue({ from: 'variable', name: 'name' }, context, 'test')).toBe('Robert');
  });

  it('reads a null variable rather than treating it as missing', () => {
    const store = createVariableStore();
    store.set('cleared', null);
    const context = createTestContext({ config: {}, variables: store });

    expect(resolveValue({ from: 'variable', name: 'cleared' }, context, 'test')).toBeNull();
  });

  it('fails loudly for an unset variable', () => {
    // Silently treating it as undefined would make a condition quietly false, and
    // the user would see a branch not taken with no indication why.
    const context = createTestContext({ config: {} });

    expect(() => resolveValue({ from: 'variable', name: 'nope' }, context, 'test')).toThrow(
      /has not been set/,
    );
  });

  it('reads an upstream node output from its inputs', () => {
    const context = createTestContext({ config: {}, inputs: { element: { text: 'Send' } } });

    expect(
      resolveValue({ from: 'nodeOutput', nodeId: 'find_1', handle: 'element' }, context, 'test'),
    ).toEqual({ text: 'Send' });
  });

  it('defaults the output handle to result', () => {
    const context = createTestContext({ config: {}, inputs: { result: 7 } });

    expect(resolveValue({ from: 'nodeOutput', nodeId: 'n' }, context, 'test')).toBe(7);
  });

  it('names the upstream node when nothing arrived', () => {
    const context = createTestContext({ config: {} });

    expect(() =>
      resolveValue({ from: 'nodeOutput', nodeId: 'find_1', handle: 'element' }, context, 'test'),
    ).toThrow(/find_1/);
  });
});

describe('interpolate', () => {
  it('substitutes a variable', () => {
    const context = createTestContext({
      config: {},
      variables: createVariableStore({ name: 'Robert' }),
    });

    expect(interpolate('Hi {{ name }}, I will be late', context, 'test')).toBe(
      'Hi Robert, I will be late',
    );
  });

  it('tolerates missing whitespace', () => {
    const context = createTestContext({
      config: {},
      variables: createVariableStore({ n: 'x' }),
    });

    expect(interpolate('{{n}}', context, 'test')).toBe('x');
  });

  it('substitutes the same variable more than once', () => {
    const context = createTestContext({
      config: {},
      variables: createVariableStore({ n: 'a' }),
    });

    expect(interpolate('{{n}}-{{n}}', context, 'test')).toBe('a-a');
  });

  it('fails on a reference to an unset variable', () => {
    const context = createTestContext({ config: {} });

    expect(() => interpolate('Hi {{ nope }}', context, 'test')).toThrow(/has not been set/);
  });

  it('leaves text with no references untouched', () => {
    const context = createTestContext({ config: {} });

    expect(interpolate('nothing to do here', context, 'test')).toBe('nothing to do here');
  });
});

describe('stringify', () => {
  it('renders primitives', () => {
    expect(stringify('x')).toBe('x');
    expect(stringify(3)).toBe('3');
    expect(stringify(true)).toBe('true');
  });

  it('renders null as empty rather than the word null', () => {
    // This ends up typed into someone's message box.
    expect(stringify(null)).toBe('');
  });

  it('JSON-encodes objects rather than producing [object Object]', () => {
    expect(stringify({ a: 1 })).toBe('{"a":1}');
    expect(stringify([1, 2])).toBe('[1,2]');
  });
});

describe('isTruthy', () => {
  it('follows the obvious rules for primitives', () => {
    expect(isTruthy(true)).toBe(true);
    expect(isTruthy(false)).toBe(false);
    expect(isTruthy(1)).toBe(true);
    expect(isTruthy(0)).toBe(false);
    expect(isTruthy('x')).toBe(true);
    expect(isTruthy('')).toBe(false);
  });

  it('treats null and undefined as false', () => {
    expect(isTruthy(null)).toBe(false);
    expect(isTruthy(undefined)).toBe(false);
  });

  it('treats an empty list as false, unlike JavaScript', () => {
    // [] is truthy in JS, which surprises everyone: a "while items remain" loop
    // written against a list would never terminate.
    expect(isTruthy([])).toBe(false);
    expect(isTruthy([1])).toBe(true);
  });

  it('treats an empty object as false', () => {
    expect(isTruthy({})).toBe(false);
    expect(isTruthy({ a: 1 })).toBe(true);
  });

  it('treats NaN as false', () => {
    expect(isTruthy(Number.NaN)).toBe(false);
  });
});

describe('tool invoker wiring', () => {
  it('reaches tools by name without importing anything Android-specific', async () => {
    // The whole reason this package stays device-agnostic while still being able to
    // inspect the screen.
    const tools = createRecordingToolInvoker({ findElement: () => ({ text: 'Send' }) });

    await expect(tools.invoke('findElement', { selector: { text: 'Send' } })).resolves.toEqual({
      text: 'Send',
    });
  });
});
