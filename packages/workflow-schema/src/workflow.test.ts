import { describe, expect, it } from 'vitest';

import {
  DEFAULT_EXECUTION_POLICY,
  EdgeSchema,
  ExecutionPolicySchema,
  MAX_NODE_TIMEOUT_MS,
  MAX_RETRY_ATTEMPTS,
  OUTPUT_HANDLE_NEXT,
  SemverSchema,
  WORKFLOW_SCHEMA_VERSION,
  WorkflowNodeSchema,
  WorkflowSchema,
} from './workflow';

const nodeMetadata = (label: string) => ({ label, position: { x: 0, y: 0 } });

const minimalWorkflow = {
  id: 'wf_1',
  metadata: {
    name: 'Message Robert',
    createdAt: '2026-01-01T09:00:00.000Z',
    updatedAt: '2026-01-01T09:00:00.000Z',
  },
  nodes: [
    { id: 'trigger_1', type: 'trigger', metadata: nodeMetadata('Start') },
    { id: 'open_1', type: 'openApp', metadata: nodeMetadata('Open WhatsApp') },
  ],
  edges: [{ id: 'e1', source: 'trigger_1', target: 'open_1' }],
};

describe('semver', () => {
  it('accepts a release version', () => {
    expect(SemverSchema.parse('1.0.0')).toBe('1.0.0');
  });

  it('accepts a prerelease', () => {
    expect(SemverSchema.safeParse('2.1.0-beta.3').success).toBe(true);
  });

  it('rejects a partial version', () => {
    expect(SemverSchema.safeParse('1.0').success).toBe(false);
    expect(SemverSchema.safeParse('v1.0.0').success).toBe(false);
  });
});

describe('execution policy', () => {
  it('defaults to stopping without retries', () => {
    // The safe default: a workflow drives someone's phone, so repeating an action
    // has to be asked for rather than assumed.
    const policy = ExecutionPolicySchema.parse({});

    expect(policy).toEqual(DEFAULT_EXECUTION_POLICY);
  });

  it('accepts a retry policy', () => {
    const policy = ExecutionPolicySchema.parse({
      retry: 3,
      retryDelayMs: 1_000,
      timeoutMs: 15_000,
      onError: 'retry',
    });

    expect(policy).toMatchObject({ retry: 3, onError: 'retry' });
  });

  it("rejects onError 'retry' with no retries, which reads as retry but behaves as stop", () => {
    const result = ExecutionPolicySchema.safeParse({ retry: 0, onError: 'retry' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('at least 1');
    }
  });

  it('allows continuing past a failure', () => {
    expect(ExecutionPolicySchema.safeParse({ onError: 'continue' }).success).toBe(true);
  });

  it('caps retries so a failing node cannot hammer the device', () => {
    expect(ExecutionPolicySchema.safeParse({ retry: MAX_RETRY_ATTEMPTS + 1 }).success).toBe(false);
  });

  it('caps the per-node timeout', () => {
    expect(ExecutionPolicySchema.safeParse({ timeoutMs: MAX_NODE_TIMEOUT_MS + 1 }).success).toBe(
      false,
    );
  });

  it('rejects a zero timeout', () => {
    expect(ExecutionPolicySchema.safeParse({ timeoutMs: 0 }).success).toBe(false);
  });
});

describe('workflow node', () => {
  it('defaults version, config, and policy', () => {
    const node = WorkflowNodeSchema.parse({
      id: 'click_1',
      type: 'click',
      metadata: nodeMetadata('Tap Send'),
    });

    expect(node.version).toBe('1.0.0');
    expect(node.config).toEqual({});
    expect(node.executionPolicy).toEqual(DEFAULT_EXECUTION_POLICY);
  });

  it('accepts a namespaced third-party node type', () => {
    // How a community package avoids colliding with a built-in.
    expect(
      WorkflowNodeSchema.safeParse({
        id: 'x',
        type: '@developer/custom-nodes:scrapeTable',
        metadata: nodeMetadata('Scrape'),
      }).success,
    ).toBe(true);
  });

  it('rejects a node type with invalid characters', () => {
    expect(
      WorkflowNodeSchema.safeParse({
        id: 'x',
        type: 'click me!',
        metadata: nodeMetadata('Tap'),
      }).success,
    ).toBe(false);
  });

  it('leaves config unvalidated, since only the registry knows its shape', () => {
    // The engine validates it against the resolved definition at load time.
    const node = WorkflowNodeSchema.parse({
      id: 'x',
      type: 'click',
      config: { anything: [1, 2, 3] },
      metadata: nodeMetadata('Tap'),
    });

    expect(node.config).toEqual({ anything: [1, 2, 3] });
  });

  it('requires a label, so a canvas node is never nameless', () => {
    expect(
      WorkflowNodeSchema.safeParse({
        id: 'x',
        type: 'click',
        metadata: { label: '', position: { x: 0, y: 0 } },
      }).success,
    ).toBe(false);
  });
});

describe('edge', () => {
  it('defaults the handles to the primary flow', () => {
    const edge = EdgeSchema.parse({ id: 'e1', source: 'a', target: 'b' });

    expect(edge.sourceHandle).toBe(OUTPUT_HANDLE_NEXT);
    expect(edge.targetHandle).toBe('in');
  });

  it('accepts an explicit branch handle', () => {
    const edge = EdgeSchema.parse({
      id: 'e1',
      source: 'if_1',
      sourceHandle: 'true',
      target: 'click_1',
    });

    expect(edge.sourceHandle).toBe('true');
  });

  it('rejects a self-edge, which is always a cycle', () => {
    const result = EdgeSchema.safeParse({ id: 'e1', source: 'a', target: 'a' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('itself');
    }
  });
});

describe('workflow', () => {
  it('accepts a minimal valid workflow', () => {
    const workflow = WorkflowSchema.parse(minimalWorkflow);

    expect(workflow.nodes).toHaveLength(2);
    expect(workflow.schemaVersion).toBe(WORKFLOW_SCHEMA_VERSION);
    expect(workflow.variables).toEqual([]);
    expect(workflow.metadata.source).toBe('manual');
    expect(workflow.metadata.version).toBe(1);
  });

  it('records where a workflow came from', () => {
    // A generated workflow deserves more scrutiny in the review UI than one built
    // by hand.
    const workflow = WorkflowSchema.parse({
      ...minimalWorkflow,
      metadata: { ...minimalWorkflow.metadata, source: 'generated' },
    });

    expect(workflow.metadata.source).toBe('generated');
  });

  it('accepts declared variables', () => {
    const workflow = WorkflowSchema.parse({
      ...minimalWorkflow,
      variables: [{ name: 'contactName', type: 'string', defaultValue: 'Robert' }],
    });

    expect(workflow.variables[0]?.name).toBe('contactName');
  });

  it('rejects a variable whose default does not match its type', () => {
    expect(
      WorkflowSchema.safeParse({
        ...minimalWorkflow,
        variables: [{ name: 'count', type: 'number', defaultValue: 'three' }],
      }).success,
    ).toBe(false);
  });

  it('rejects a duplicate node id and names it', () => {
    // Left through, the engine silently executes one node twice.
    const result = WorkflowSchema.safeParse({
      ...minimalWorkflow,
      nodes: [
        { id: 'same', type: 'trigger', metadata: nodeMetadata('A') },
        { id: 'same', type: 'click', metadata: nodeMetadata('B') },
      ],
      edges: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('duplicate node id "same"');
      expect(result.error.issues[0]?.path).toEqual(['nodes', 1, 'id']);
    }
  });

  it('rejects a duplicate variable name', () => {
    const result = WorkflowSchema.safeParse({
      ...minimalWorkflow,
      variables: [
        { name: 'dup', type: 'string' },
        { name: 'dup', type: 'number' },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('duplicate variable name');
    }
  });

  it('rejects an edge pointing at a node that does not exist', () => {
    const result = WorkflowSchema.safeParse({
      ...minimalWorkflow,
      edges: [{ id: 'e1', source: 'trigger_1', target: 'ghost' }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('unknown node "ghost"');
    }
  });

  it('rejects an edge starting from a node that does not exist', () => {
    const result = WorkflowSchema.safeParse({
      ...minimalWorkflow,
      edges: [{ id: 'e1', source: 'ghost', target: 'open_1' }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('unknown node "ghost"');
    }
  });

  it('reports several problems at once rather than stopping at the first', () => {
    // A hand-edited or model-generated workflow often has more than one mistake;
    // fixing them one round trip at a time would be tedious.
    const result = WorkflowSchema.safeParse({
      ...minimalWorkflow,
      edges: [
        { id: 'e1', source: 'ghost1', target: 'open_1' },
        { id: 'e2', source: 'trigger_1', target: 'ghost2' },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('rejects a non-ISO timestamp', () => {
    expect(
      WorkflowSchema.safeParse({
        ...minimalWorkflow,
        metadata: { ...minimalWorkflow.metadata, createdAt: 'yesterday' },
      }).success,
    ).toBe(false);
  });

  it('accepts a workflow with no edges, since a single-node workflow is valid', () => {
    expect(
      WorkflowSchema.safeParse({
        ...minimalWorkflow,
        nodes: [{ id: 'only', type: 'trigger', metadata: nodeMetadata('Start') }],
        edges: [],
      }).success,
    ).toBe(true);
  });
});
