import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineNode } from './authoring';
import {
  NODE_SDK_VERSION,
  NodeManifestSchema,
  isCompatibleSdkVersion,
  reconcileManifest,
} from './manifest';

const manifest = {
  sdkVersion: '1.0.0',
  nodes: [
    {
      type: 'scrapeTable',
      version: '2.1.0',
      kind: 'action' as const,
      label: 'Scrape Table',
      description: 'Reads a table from the screen',
      icon: 'table',
      category: 'Data',
      requiresDevice: true,
    },
  ],
};

const scrapeTable = defineNode({
  type: 'scrapeTable',
  version: '2.1.0',
  kind: 'action',
  display: {
    label: 'Scrape Table',
    description: 'Reads a table from the screen',
    icon: 'table',
    category: 'Data',
  },
  configSchema: z.object({}),
  inputs: [],
  outputs: [],
  requiresDevice: true,
  execute: async () => ({}),
});

describe('manifest schema', () => {
  it('accepts a well-formed manifest', () => {
    expect(NodeManifestSchema.parse(manifest).nodes).toHaveLength(1);
  });

  it('defaults requiresDevice to false', () => {
    const parsed = NodeManifestSchema.parse({
      sdkVersion: '1.0.0',
      nodes: [
        {
          type: 'x',
          version: '1.0.0',
          kind: 'transform',
          label: 'X',
          description: 'd',
          icon: 'i',
          category: 'c',
        },
      ],
    });

    expect(parsed.nodes[0]?.requiresDevice).toBe(false);
  });

  it('rejects a package declaring no nodes', () => {
    const result = NodeManifestSchema.safeParse({ sdkVersion: '1.0.0', nodes: [] });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('at least one node');
    }
  });

  it('rejects an unknown node kind', () => {
    expect(
      NodeManifestSchema.safeParse({
        sdkVersion: '1.0.0',
        nodes: [
          {
            type: 'x',
            version: '1.0.0',
            kind: 'telepathy',
            label: 'X',
            description: 'd',
            icon: 'i',
            category: 'c',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('requires an SDK version, since compatibility cannot be guessed', () => {
    expect(NodeManifestSchema.safeParse({ nodes: manifest.nodes }).success).toBe(false);
  });
});

describe('SDK compatibility', () => {
  it('accepts a matching major version', () => {
    expect(isCompatibleSdkVersion('1.0.0')).toBe(true);
    expect(isCompatibleSdkVersion('1.4.2')).toBe(true);
    expect(isCompatibleSdkVersion('1')).toBe(true);
  });

  it('refuses a future major version', () => {
    // A package built for SDK 2 may rely on context fields this app does not
    // provide; failing at load beats failing mid-run on an undefined property.
    expect(isCompatibleSdkVersion('2.0.0')).toBe(false);
  });

  it('refuses an older major version', () => {
    expect(isCompatibleSdkVersion('0.9.0')).toBe(false);
  });

  it('tolerates surrounding whitespace', () => {
    expect(isCompatibleSdkVersion(' 1.0.0 ')).toBe(true);
  });

  it('declares the current SDK major version', () => {
    expect(NODE_SDK_VERSION).toBe('1');
  });
});

describe('reconcileManifest', () => {
  it('reports nothing when manifest and exports agree', () => {
    expect(reconcileManifest(manifest, [scrapeTable])).toEqual([]);
  });

  it('catches a node declared but not exported', () => {
    // A broken package the user should hear about at install time.
    const mismatches = reconcileManifest(manifest, []);

    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]?.reason).toContain('not exported');
  });

  it('catches a node exported but not declared', () => {
    // Worse than the reverse: it would execute without appearing in the manifest
    // the user was shown.
    const extra = defineNode({ ...scrapeTable, type: 'secretNode' });

    const mismatches = reconcileManifest(manifest, [scrapeTable, extra]);

    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]?.type).toBe('secretNode');
    expect(mismatches[0]?.reason).toContain('not declared');
  });

  it('catches a version disagreement', () => {
    const mismatches = reconcileManifest(manifest, [
      defineNode({ ...scrapeTable, version: '9.9.9' }),
    ]);

    expect(mismatches[0]?.reason).toContain('version');
  });

  it('catches a kind disagreement', () => {
    const mismatches = reconcileManifest(manifest, [
      defineNode({ ...scrapeTable, kind: 'transform' }),
    ]);

    expect(mismatches[0]?.reason).toContain('kind');
  });

  it('catches a node that touches the device without declaring it', () => {
    // Such a node would bypass the pre-run capability check.
    const mismatches = reconcileManifest(manifest, [
      defineNode({ ...scrapeTable, requiresDevice: false }),
    ]);

    expect(mismatches[0]?.reason).toContain('device');
  });

  it('reports several mismatches together', () => {
    const mismatches = reconcileManifest(manifest, [
      defineNode({ ...scrapeTable, version: '9.9.9', kind: 'transform' }),
    ]);

    expect(mismatches.length).toBeGreaterThanOrEqual(2);
  });
});
