import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineNode } from './authoring';
import { type NodeDefinition } from './definition';
import {
  NodeRegistrationError,
  NodeRegistry,
  type UnknownNodeTypeError,
  isUnknownNodeTypeError,
} from './registry';

const node = (overrides: Partial<NodeDefinition<unknown>> = {}): NodeDefinition<unknown> =>
  defineNode({
    type: 'test',
    version: '1.0.0',
    kind: 'action',
    display: { label: 'Test', description: 'A test node', icon: 'dot', category: 'Test' },
    configSchema: z.unknown(),
    inputs: [{ handle: 'in', label: 'In' }],
    outputs: [{ handle: 'next', label: 'Next' }],
    execute: async () => ({}),
    ...overrides,
  });

describe('registration', () => {
  it('registers and finds a definition', () => {
    const registry = new NodeRegistry();
    registry.register(node({ type: 'click' }));

    expect(registry.has('click')).toBe(true);
    expect(registry.find('click')?.type).toBe('click');
    expect(registry.size).toBe(1);
  });

  it('refuses a duplicate type rather than overwriting it', () => {
    // Silent replacement would make a workflow's behaviour depend on package load
    // order - a bug that only shows up on someone else's device.
    const registry = new NodeRegistry();
    registry.register(node({ type: 'click' }));

    expect(() => registry.register(node({ type: 'click' }))).toThrow(NodeRegistrationError);
  });

  it('rejects a definition with no execute function', () => {
    const registry = new NodeRegistry();

    expect(() => registry.register(node({ execute: undefined as unknown as never }))).toThrow(
      /execute must be a function/,
    );
  });

  it('rejects a definition with no config schema', () => {
    const registry = new NodeRegistry();

    expect(() => registry.register(node({ configSchema: undefined as unknown as never }))).toThrow(
      /configSchema/,
    );
  });

  it('rejects a blank type', () => {
    const registry = new NodeRegistry();

    expect(() => registry.register(node({ type: '   ' }))).toThrow(/non-empty string/);
  });

  it('rejects a missing display label', () => {
    const registry = new NodeRegistry();

    expect(() =>
      registry.register(node({ display: { description: 'd', icon: 'i', category: 'c' } as never })),
    ).toThrow(/display.label/);
  });

  it('rejects duplicate output handles', () => {
    // Two ports with one handle makes edge routing ambiguous.
    const registry = new NodeRegistry();

    expect(() =>
      registry.register(
        node({
          outputs: [
            { handle: 'next', label: 'A' },
            { handle: 'next', label: 'B' },
          ],
        }),
      ),
    ).toThrow(/duplicate output handle "next"/);
  });

  it('rejects duplicate input handles', () => {
    const registry = new NodeRegistry();

    expect(() =>
      registry.register(
        node({
          inputs: [
            { handle: 'in', label: 'A' },
            { handle: 'in', label: 'B' },
          ],
        }),
      ),
    ).toThrow(/duplicate input handle "in"/);
  });
});

describe('registerAll', () => {
  it('registers a whole package at once', () => {
    const registry = new NodeRegistry();
    registry.registerAll([node({ type: 'a' }), node({ type: 'b' })]);

    expect(registry.size).toBe(2);
  });

  it('reports every problem at once', () => {
    // A package with twenty nodes and three mistakes should surface all three,
    // rather than forcing three install-fix-retry cycles.
    const registry = new NodeRegistry();

    try {
      registry.registerAll([
        node({ type: '' }),
        node({ type: 'ok' }),
        node({ type: 'bad', execute: undefined as unknown as never }),
      ]);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(NodeRegistrationError);
      if (error instanceof NodeRegistrationError) {
        expect(error.failures).toHaveLength(2);
      }
    }
  });

  it('registers nothing when any definition is invalid', () => {
    // A half-loaded package would leave some workflows working and others
    // mysteriously broken.
    const registry = new NodeRegistry();

    expect(() => registry.registerAll([node({ type: 'good' }), node({ type: '' })])).toThrow();

    expect(registry.size).toBe(0);
  });

  it('catches a duplicate within the same batch', () => {
    // Nothing is in the map yet, so this would otherwise slip past.
    const registry = new NodeRegistry();

    expect(() => registry.registerAll([node({ type: 'same' }), node({ type: 'same' })])).toThrow(
      /more than once/,
    );
  });

  it('catches a clash with an already-registered type', () => {
    const registry = new NodeRegistry();
    registry.register(node({ type: 'click' }));

    expect(() => registry.registerAll([node({ type: 'click' })])).toThrow(/already registered/);
  });
});

describe('require', () => {
  it('returns a registered definition', () => {
    const registry = new NodeRegistry();
    registry.register(node({ type: 'click' }));

    expect(registry.require('click').type).toBe('click');
  });

  it('throws for an unknown type, listing what is available', () => {
    // Turns a dead end into a typo the user can spot, and reveals when a package
    // failed to load.
    const registry = new NodeRegistry();
    registry.register(node({ type: 'click' }));
    registry.register(node({ type: 'swipe' }));

    try {
      registry.require('clik');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isUnknownNodeTypeError(error)).toBe(true);
      expect((error as UnknownNodeTypeError).message).toContain('click');
      expect((error as UnknownNodeTypeError).message).toContain('swipe');
      expect((error as UnknownNodeTypeError).nodeType).toBe('clik');
    }
  });

  it('says so plainly when nothing is registered', () => {
    expect(() => new NodeRegistry().require('click')).toThrow(/no node types are registered/);
  });
});

describe('queries', () => {
  it('groups definitions by category for the palette', () => {
    // A flat list of thirty nodes is unusable in a mobile UI.
    const registry = new NodeRegistry();
    registry.registerAll([
      node({
        type: 'click',
        display: { label: 'Click', description: 'd', icon: 'i', category: 'Device' },
      }),
      node({
        type: 'swipe',
        display: { label: 'Swipe', description: 'd', icon: 'i', category: 'Device' },
      }),
      node({
        type: 'if',
        display: { label: 'If', description: 'd', icon: 'i', category: 'Logic' },
      }),
    ]);

    const grouped = registry.byCategory();

    expect(grouped.get('Device')).toHaveLength(2);
    expect(grouped.get('Logic')).toHaveLength(1);
  });

  it('lists node types that need a device', () => {
    // Lets a workflow be checked before it starts, rather than failing at the
    // first action.
    const registry = new NodeRegistry();
    registry.registerAll([
      node({ type: 'click', requiresDevice: true }),
      node({ type: 'setVariable' }),
    ]);

    expect(registry.deviceDependentTypes()).toEqual(['click']);
  });

  it('reports every registered type', () => {
    const registry = new NodeRegistry();
    registry.registerAll([node({ type: 'a' }), node({ type: 'b' })]);

    expect(registry.types().sort()).toEqual(['a', 'b']);
  });

  it('clears every registration', () => {
    const registry = new NodeRegistry();
    registry.register(node({ type: 'a' }));
    registry.clear();

    expect(registry.size).toBe(0);
  });
});
