import { type AnyNodeDefinition, NodeRegistry, defineNode } from '@mobile-automation/node-sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  type DiscoverablePackage,
  discoverNodePackages,
  isBuiltInPackage,
  qualifyNodeType,
  readManifest,
  registerBuiltInNodes,
} from './discovery';

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
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [{ handle: 'next', label: 'Next' }],
  requiresDevice: true,
  execute: async () => ({}),
});

const validManifest = {
  sdkVersion: '1.0.0',
  nodes: [
    {
      type: 'scrapeTable',
      version: '2.1.0',
      kind: 'action',
      label: 'Scrape Table',
      description: 'Reads a table from the screen',
      icon: 'table',
      category: 'Data',
      requiresDevice: true,
    },
  ],
};

const candidate = (overrides: Partial<DiscoverablePackage> = {}): DiscoverablePackage => ({
  name: '@developer/custom-nodes',
  version: '1.0.0',
  manifest: validManifest,
  load: async () => [scrapeTable],
  ...overrides,
});

describe('readManifest', () => {
  it('accepts a well-formed manifest', () => {
    const result = readManifest(validManifest);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.manifest.nodes).toHaveLength(1);
  });

  it('explains what is wrong with a malformed one', () => {
    const result = readManifest({ sdkVersion: '1.0.0', nodes: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail).toContain('at least one node');
  });
});

describe('discovery', () => {
  it('registers a valid package', async () => {
    const registry = new NodeRegistry();

    const result = await discoverNodePackages([candidate()], registry);

    expect(result.rejected).toEqual([]);
    expect(result.accepted).toHaveLength(1);
    expect(registry.has('@developer/custom-nodes:scrapeTable')).toBe(true);
  });

  it('namespaces third-party nodes so they cannot shadow a built-in', async () => {
    // Otherwise a community package could replace `click` and the AI would call it
    // without anyone noticing.
    const registry = new NodeRegistry();
    const shadowing = defineNode({ ...scrapeTable, type: 'click' });

    await discoverNodePackages(
      [
        candidate({
          manifest: {
            sdkVersion: '1.0.0',
            nodes: [{ ...validManifest.nodes[0], type: 'click' }],
          },
          load: async () => [shadowing],
        }),
      ],
      registry,
    );

    expect(registry.has('click')).toBe(false);
    expect(registry.has('@developer/custom-nodes:click')).toBe(true);
  });

  it('ignores a package with no manifest without calling it an error', async () => {
    // Most installed packages have nothing to do with this app.
    const result = await discoverNodePackages(
      [candidate({ name: 'lodash', manifest: undefined })],
      new NodeRegistry(),
    );

    expect(result.rejected[0]?.reason).toBe('no-manifest');
  });

  it('rejects an invalid manifest', async () => {
    const result = await discoverNodePackages(
      [candidate({ manifest: { sdkVersion: '1.0.0' } })],
      new NodeRegistry(),
    );

    expect(result.rejected[0]?.reason).toBe('invalid-manifest');
  });

  it('refuses a future SDK version without loading the code', async () => {
    // The order matters: a node package can tap on someone's banking app, so an
    // incompatible one must never execute.
    let loaded = false;

    const result = await discoverNodePackages(
      [
        candidate({
          manifest: { ...validManifest, sdkVersion: '99.0.0' },
          load: async () => {
            loaded = true;
            return [scrapeTable];
          },
        }),
      ],
      new NodeRegistry(),
    );

    expect(result.rejected[0]?.reason).toBe('incompatible-sdk');
    expect(loaded).toBe(false);
  });

  it('reports a package that fails to load', async () => {
    const result = await discoverNodePackages(
      [
        candidate({
          load: async () => {
            throw new Error('module not found');
          },
        }),
      ],
      new NodeRegistry(),
    );

    expect(result.rejected[0]?.reason).toBe('load-failed');
    expect(result.rejected[0]?.detail).toContain('module not found');
  });

  it('rejects a package exporting a node it never declared', async () => {
    // Such a node would execute without appearing in the manifest the user was
    // shown, which defeats the purpose of having one.
    const undeclared = defineNode({ ...scrapeTable, type: 'secretNode' });

    const result = await discoverNodePackages(
      [candidate({ load: async () => [scrapeTable, undeclared] })],
      new NodeRegistry(),
    );

    expect(result.rejected[0]?.reason).toBe('manifest-mismatch');
    expect(result.rejected[0]?.detail).toContain('secretNode');
  });

  it('rejects a package that declares a node it does not export', async () => {
    const result = await discoverNodePackages(
      [candidate({ load: async () => [] })],
      new NodeRegistry(),
    );

    expect(result.rejected[0]?.reason).toBe('manifest-mismatch');
  });

  it('keeps going when one package is broken', async () => {
    // A user with five packages installed should not lose all of them because one
    // is broken.
    const registry = new NodeRegistry();

    const good = candidate({ name: '@good/nodes' });
    const bad = candidate({
      name: '@bad/nodes',
      manifest: { ...validManifest, sdkVersion: '99.0.0' },
    });

    const result = await discoverNodePackages([bad, good], registry);

    expect(result.accepted.map((entry) => entry.packageName)).toEqual(['@good/nodes']);
    expect(result.rejected.map((entry) => entry.packageName)).toEqual(['@bad/nodes']);
    expect(registry.has('@good/nodes:scrapeTable')).toBe(true);
  });

  it('reports the node types a package contributed', async () => {
    const result = await discoverNodePackages([candidate()], new NodeRegistry());

    expect(result.accepted[0]?.nodeTypes).toEqual(['@developer/custom-nodes:scrapeTable']);
  });

  it('rejects a second package claiming the same namespaced type', async () => {
    const registry = new NodeRegistry();

    await discoverNodePackages([candidate()], registry);
    const second = await discoverNodePackages([candidate()], registry);

    expect(second.rejected[0]?.reason).toBe('registration-failed');
  });
});

describe('qualifyNodeType', () => {
  it('namespaces a third-party type', () => {
    expect(qualifyNodeType('@developer/custom-nodes', 'scrape')).toBe(
      '@developer/custom-nodes:scrape',
    );
  });

  it('leaves built-in types bare', () => {
    // Workflows and the AI refer to `click` and `openApp` by name.
    expect(qualifyNodeType('@mobile-automation/android-nodes', 'click')).toBe('click');
    expect(qualifyNodeType('@mobile-automation/core-nodes', 'condition')).toBe('condition');
  });

  it('does not double-namespace', () => {
    expect(qualifyNodeType('@dev/pkg', '@dev/pkg:node')).toBe('@dev/pkg:node');
  });

  it('knows which packages are built in', () => {
    expect(isBuiltInPackage('@mobile-automation/core-nodes')).toBe(true);
    expect(isBuiltInPackage('@developer/custom-nodes')).toBe(false);
  });
});

describe('registerBuiltInNodes', () => {
  it('registers the shipped packages without namespacing', () => {
    const registry = new NodeRegistry();
    const nodes: readonly AnyNodeDefinition[] = [scrapeTable];

    registerBuiltInNodes(registry, [{ name: '@mobile-automation/core-nodes', nodes }]);

    expect(registry.has('scrapeTable')).toBe(true);
  });

  it('throws rather than collecting a failure, since this is a bug in our code', () => {
    const registry = new NodeRegistry();
    registry.register(scrapeTable);

    expect(() =>
      registerBuiltInNodes(registry, [
        { name: '@mobile-automation/core-nodes', nodes: [scrapeTable] },
      ]),
    ).toThrow();
  });
});
