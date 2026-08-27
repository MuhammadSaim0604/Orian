import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  DEPENDS_ON,
  NODE_KINDS,
  PACKAGE_NAME,
  createTestContext,
  defineNode,
  isNodeKind,
} from './index';

describe('node-sdk', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@mobile-automation/node-sdk');
  });

  it('resolves its workspace dependency', () => {
    expect(DEPENDS_ON).toContain('@mobile-automation/shared-types');
  });

  it('declares the seven device-agnostic node kinds', () => {
    expect(NODE_KINDS).toHaveLength(7);
  });

  it('recognises a valid node kind', () => {
    expect(isNodeKind('condition')).toBe(true);
  });

  it('rejects a device capability as a node kind', () => {
    // click is an action contributed by android-nodes, not a node kind (ADR 0008).
    expect(isNodeKind('click')).toBe(false);
  });
});

describe('defineNode', () => {
  it('infers the config type from the schema', () => {
    const node = defineNode({
      type: 'greet',
      version: '1.0.0',
      kind: 'action',
      display: { label: 'Greet', description: 'Says hello', icon: 'wave', category: 'Test' },
      configSchema: z.object({ name: z.string() }),
      inputs: [],
      outputs: [{ handle: 'next', label: 'Next' }],
      execute: async (context) => ({
        // Typed: context.config.name is a string because the schema says so.
        outputs: { greeting: `Hello ${context.config.name}` },
      }),
    });

    expect(node.type).toBe('greet');
  });

  it('produces a definition whose execute receives the parsed config', async () => {
    const node = defineNode({
      type: 'double',
      version: '1.0.0',
      kind: 'transform',
      display: { label: 'Double', description: 'Doubles', icon: 'x', category: 'Test' },
      configSchema: z.object({ value: z.number() }),
      inputs: [],
      outputs: [],
      execute: async (context) => ({ outputs: { result: context.config.value * 2 } }),
    });

    const result = await node.execute(createTestContext({ config: { value: 21 } }));

    expect(result.outputs?.result).toBe(42);
  });
});
