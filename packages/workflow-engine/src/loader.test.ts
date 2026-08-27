import { NodeRegistry, defineNode } from '@mobile-automation/node-sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { WorkflowLoadError, loadWorkflow, nextNodeIds } from './loader';

const simpleNode = (type: string, outputs = [{ handle: 'next', label: 'Next' }]) =>
  defineNode({
    type,
    version: '1.0.0',
    kind: 'action',
    display: { label: type, description: 'd', icon: 'i', category: 'Test' },
    configSchema: z.object({ value: z.string().optional() }),
    inputs: [{ handle: 'in', label: 'In' }],
    outputs,
    execute: async () => ({}),
  });

const branchingNode = defineNode({
  type: 'branch',
  version: '1.0.0',
  kind: 'condition',
  display: { label: 'Branch', description: 'd', icon: 'i', category: 'Test' },
  configSchema: z.object({}),
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [
    { handle: 'true', label: 'True' },
    { handle: 'false', label: 'False' },
  ],
  execute: async () => ({ branch: { handle: 'true' } }),
});

const registry = () => {
  const reg = new NodeRegistry();
  reg.registerAll([
    simpleNode('start', [{ handle: 'next', label: 'Next' }]),
    simpleNode('step'),
    branchingNode,
  ]);
  return reg;
};

const metadata = (label: string) => ({ label, position: { x: 0, y: 0 } });

const workflow = (overrides: Record<string, unknown> = {}) => ({
  id: 'wf_1',
  metadata: {
    name: 'Test',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  nodes: [
    { id: 'a', type: 'start', metadata: metadata('A') },
    { id: 'b', type: 'step', metadata: metadata('B') },
  ],
  edges: [{ id: 'e1', source: 'a', target: 'b' }],
  ...overrides,
});

describe('loading', () => {
  it('resolves every node against the registry', () => {
    const loaded = loadWorkflow(workflow(), registry());

    expect(loaded.nodes.size).toBe(2);
    expect(loaded.nodes.get('a')?.definition.type).toBe('start');
  });

  it('finds the entry node', () => {
    expect(loadWorkflow(workflow(), registry()).entryNodeId).toBe('a');
  });

  it('precomputes adjacency by handle', () => {
    const loaded = loadWorkflow(workflow(), registry());

    expect(nextNodeIds(loaded, 'a', 'next')).toEqual(['b']);
    expect(nextNodeIds(loaded, 'b', 'next')).toEqual([]);
  });

  it('reports which node types need a device', () => {
    const reg = registry();
    reg.register(simpleNode('deviceStep'));
    const withDevice = new NodeRegistry();
    withDevice.registerAll([
      simpleNode('start'),
      defineNode({ ...simpleNode('step'), requiresDevice: true }),
    ]);

    const loaded = loadWorkflow(workflow(), withDevice);

    expect(loaded.deviceDependentTypes).toEqual(['step']);
  });

  it('rejects a workflow whose JSON is malformed', () => {
    expect(() => loadWorkflow({ id: '' }, registry())).toThrow(WorkflowLoadError);
  });

  it('names an unregistered node type and lists what is available', () => {
    // Left to run time, this would strand the phone mid-task.
    try {
      loadWorkflow(
        workflow({
          nodes: [{ id: 'a', type: 'nonexistent', metadata: metadata('A') }],
          edges: [],
        }),
        registry(),
      );
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(WorkflowLoadError);
      expect((error as WorkflowLoadError).message).toContain('nonexistent');
      expect((error as WorkflowLoadError).message).toContain('start');
    }
  });

  it('validates each node config at load time, naming the field', () => {
    try {
      loadWorkflow(
        workflow({
          nodes: [{ id: 'a', type: 'start', config: { value: 42 }, metadata: metadata('A') }],
          edges: [],
        }),
        registry(),
      );
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as WorkflowLoadError).issues[0]?.path).toContain('nodes[0].config.value');
    }
  });

  it('reports several problems at once', () => {
    // A generated workflow often has more than one mistake, and fixing them one
    // round trip at a time is miserable.
    try {
      loadWorkflow(
        workflow({
          nodes: [
            { id: 'a', type: 'ghost1', metadata: metadata('A') },
            { id: 'b', type: 'ghost2', metadata: metadata('B') },
          ],
          edges: [{ id: 'e1', source: 'a', target: 'b' }],
        }),
        registry(),
      );
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as WorkflowLoadError).issues.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('entry point', () => {
  it('rejects a workflow with no start', () => {
    expect(() =>
      loadWorkflow(
        workflow({
          edges: [
            { id: 'e1', source: 'a', target: 'b' },
            { id: 'e2', source: 'b', target: 'a' },
          ],
        }),
        registry(),
      ),
    ).toThrow(/no place to start/);
  });

  it('rejects two possible starting points', () => {
    // Two entries would mean the engine picks an order the canvas does not show.
    expect(() =>
      loadWorkflow(
        workflow({
          nodes: [
            { id: 'a', type: 'start', metadata: metadata('A') },
            { id: 'b', type: 'step', metadata: metadata('B') },
            { id: 'c', type: 'step', metadata: metadata('C') },
          ],
          edges: [{ id: 'e1', source: 'a', target: 'b' }],
        }),
        registry(),
      ),
    ).toThrow(/2 possible starting points/);
  });

  it('accepts a single-node workflow', () => {
    const loaded = loadWorkflow(
      workflow({
        nodes: [{ id: 'only', type: 'start', metadata: metadata('Only') }],
        edges: [],
      }),
      registry(),
    );

    expect(loaded.entryNodeId).toBe('only');
  });
});

describe('handle validation', () => {
  it('rejects an edge from an output the node does not have', () => {
    // Otherwise the edge is silently unreachable, which presents as "the workflow
    // stopped early for no reason" while the canvas looks correct.
    expect(() =>
      loadWorkflow(
        workflow({
          edges: [{ id: 'e1', source: 'a', sourceHandle: 'nope', target: 'b' }],
        }),
        registry(),
      ),
    ).toThrow(/has no output "nope"/);
  });

  it('lists the handles a node does have', () => {
    try {
      loadWorkflow(
        workflow({
          nodes: [
            { id: 'a', type: 'branch', metadata: metadata('A') },
            { id: 'b', type: 'step', metadata: metadata('B') },
          ],
          edges: [{ id: 'e1', source: 'a', sourceHandle: 'maybe', target: 'b' }],
        }),
        registry(),
      );
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as WorkflowLoadError).message).toContain('true, false');
    }
  });

  it('rejects an edge into an input the node does not have', () => {
    expect(() =>
      loadWorkflow(
        workflow({
          edges: [{ id: 'e1', source: 'a', target: 'b', targetHandle: 'nope' }],
        }),
        registry(),
      ),
    ).toThrow(/has no input "nope"/);
  });

  it('accepts a branch handle on a condition node', () => {
    const loaded = loadWorkflow(
      workflow({
        nodes: [
          { id: 'a', type: 'branch', metadata: metadata('A') },
          { id: 'b', type: 'step', metadata: metadata('B') },
        ],
        edges: [{ id: 'e1', source: 'a', sourceHandle: 'true', target: 'b' }],
      }),
      registry(),
    );

    expect(nextNodeIds(loaded, 'a', 'true')).toEqual(['b']);
  });
});

describe('cycle detection', () => {
  it('names the nodes that form the loop', () => {
    // Naming the loop is the difference between a fixable report and a puzzle.
    try {
      loadWorkflow(
        workflow({
          nodes: [
            { id: 'a', type: 'start', metadata: metadata('A') },
            { id: 'b', type: 'step', metadata: metadata('B') },
            { id: 'c', type: 'step', metadata: metadata('C') },
          ],
          edges: [
            { id: 'e1', source: 'a', target: 'b' },
            { id: 'e2', source: 'b', target: 'c' },
            { id: 'e3', source: 'c', target: 'b' },
          ],
        }),
        registry(),
      );
      expect.unreachable('should have thrown');
    } catch (error) {
      const message = (error as WorkflowLoadError).message;
      expect(message).toContain('loops forever');
      expect(message).toContain('b -> c -> b');
    }
  });

  it('suggests a Loop node instead', () => {
    try {
      loadWorkflow(
        workflow({
          edges: [
            { id: 'e1', source: 'a', target: 'b' },
            { id: 'e2', source: 'b', target: 'a' },
          ],
        }),
        registry(),
      );
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as WorkflowLoadError).message).toMatch(/Loop node|no place to start/);
    }
  });

  it('accepts a diamond, which is not a cycle', () => {
    const loaded = loadWorkflow(
      workflow({
        nodes: [
          { id: 'a', type: 'branch', metadata: metadata('A') },
          { id: 'b', type: 'step', metadata: metadata('B') },
          { id: 'c', type: 'step', metadata: metadata('C') },
          { id: 'd', type: 'step', metadata: metadata('D') },
        ],
        edges: [
          { id: 'e1', source: 'a', sourceHandle: 'true', target: 'b' },
          { id: 'e2', source: 'a', sourceHandle: 'false', target: 'c' },
          { id: 'e3', source: 'b', target: 'd' },
          { id: 'e4', source: 'c', target: 'd' },
        ],
      }),
      registry(),
    );

    expect(loaded.nodes.size).toBe(4);
  });

  it('handles a long chain without blowing the stack', () => {
    // Iterative DFS rather than recursion: a generated workflow can be long, and a
    // stack overflow would present as a crash rather than a validation error.
    const nodes = [{ id: 'n0', type: 'start', metadata: metadata('n0') }];
    const edges = [];

    for (let index = 1; index < 2_000; index++) {
      nodes.push({ id: `n${index}`, type: 'step', metadata: metadata(`n${index}`) });
      edges.push({ id: `e${index}`, source: `n${index - 1}`, target: `n${index}` });
    }

    expect(() => loadWorkflow(workflow({ nodes, edges }), registry())).not.toThrow();
  });
});
