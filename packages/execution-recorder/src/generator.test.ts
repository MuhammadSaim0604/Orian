import { WorkflowSchema, isFragileStrategy } from '@mobile-automation/workflow-schema';
import { describe, expect, it } from 'vitest';

import { TOOL_TO_NODE, durabilityOf, generateWorkflow } from './generator';
import { type ExecutionStep, type ExecutionTrace } from './schema';

/**
 * The generator.
 *
 * The behaviours worth protecting are the ones that make a generated workflow *durable*
 * rather than merely valid: choosing the resolved element's resourceId over the text the
 * agent happened to tap by, keeping waits while collapsing observations, and turning typed
 * text into a variable so the workflow can be reused.
 */

const step = (overrides: Partial<ExecutionStep> = {}): ExecutionStep => ({
  index: 1,
  tool: 'click',
  arguments: { selector: { text: 'Send' } },
  screen: { packageName: 'com.whatsapp', activityName: 'com.whatsapp.Conversation' },
  outcome: 'succeeded',
  timestampEpochMs: 1_700_000_000_000,
  durationMs: 40,
  ...overrides,
});

const trace = (steps: readonly ExecutionStep[]): ExecutionTrace => ({
  id: 'trace_1',
  runId: 'run_1',
  goal: "Send Robert a WhatsApp message that I'll be late tomorrow",
  outcome: 'succeeded',
  steps: steps.map((entry, index) => ({ ...entry, index: index + 1 })),
  startedAtEpochMs: 1_700_000_000_000,
  finishedAtEpochMs: 1_700_000_030_000,
});

describe('a generated workflow', () => {
  it('is valid against the workflow schema', () => {
    // It goes straight onto the canvas and into the engine, so anything else is unusable.
    const result = generateWorkflow(
      trace([step({ tool: 'openApp', arguments: { packageName: 'com.whatsapp' } })]),
    );

    expect(WorkflowSchema.safeParse(result.workflow).success).toBe(true);
  });

  it('is marked as generated, so the review UI can treat it with more scrutiny', () => {
    const result = generateWorkflow(trace([step()]));

    expect(result.workflow.metadata.source).toBe('generated');
  });

  it('names itself from the goal', () => {
    const result = generateWorkflow(trace([step()]));

    expect(result.workflow.metadata.name).toContain('Robert');
  });

  it('chains steps in the order they ran', () => {
    const result = generateWorkflow(
      trace([
        step({ tool: 'openApp', arguments: { packageName: 'com.whatsapp' } }),
        step({ tool: 'click', arguments: { selector: { text: 'Robert' } } }),
        step({ tool: 'click', arguments: { selector: { text: 'Send' } } }),
      ]),
    );

    expect(result.workflow.nodes).toHaveLength(3);
    expect(result.workflow.edges).toHaveLength(2);
    expect(result.workflow.edges[0]?.source).toBe(result.workflow.nodes[0]?.id);
  });

  it('lays nodes out in a grid rather than one endless line', () => {
    const result = generateWorkflow(trace(Array.from({ length: 6 }, () => step())));

    const rows = new Set(result.workflow.nodes.map((node) => node.metadata.position.y));

    expect(rows.size).toBeGreaterThan(1);
  });

  it('labels a node by what it does, not which tool it called', () => {
    const result = generateWorkflow(
      trace([
        step({
          tool: 'click',
          resolvedElement: { text: 'Send', resourceId: 'com.whatsapp:id/send' },
        }),
      ]),
    );

    expect(result.workflow.nodes[0]?.metadata.label).toBe('Tap Send');
  });
});

describe('collapsing the trace', () => {
  it('drops observation steps the workflow does not need to repeat', () => {
    // Left in, they triple the node count and make the canvas unreadable.
    const result = generateWorkflow(
      trace([
        step({ tool: 'getUiTree', arguments: {} }),
        step({ tool: 'findElement', arguments: { selector: { text: 'Send' } } }),
        step({ tool: 'click' }),
      ]),
    );

    expect(result.workflow.nodes).toHaveLength(1);
    expect(result.workflow.nodes[0]?.type).toBe('click');
  });

  it('says which steps were dropped and why, rather than silently losing them', () => {
    const result = generateWorkflow(
      trace([step({ tool: 'getUiTree', arguments: {} }), step({ tool: 'click' })]),
    );

    expect(result.omitted).toHaveLength(1);
    expect(result.omitted[0]?.tool).toBe('getUiTree');
    expect(result.omitted[0]?.reason).toContain('read the screen');
  });

  it('keeps waits, which are load-bearing rather than observational', () => {
    // Removing them produces a workflow that works replayed slowly and fails on a cold
    // start - the worst kind of intermittent.
    const result = generateWorkflow(
      trace([
        step({ tool: 'openApp', arguments: { packageName: 'com.whatsapp' } }),
        step({ tool: 'waitForElement', arguments: { selector: { text: 'Robert' } } }),
        step({ tool: 'click' }),
      ]),
    );

    expect(result.workflow.nodes.map((node) => node.type)).toEqual([
      'openApp',
      'waitForElement',
      'click',
    ]);
  });

  it('drops a failed step and explains it', () => {
    // Replaying it would reproduce the failure rather than the outcome.
    const result = generateWorkflow(
      trace([step({ outcome: 'failed', error: 'not found' }), step({ tool: 'click' })]),
    );

    expect(result.workflow.nodes).toHaveLength(1);
    expect(result.omitted[0]?.reason).toContain('failed');
  });

  it('reports a tool with no node as a gap rather than dropping it quietly', () => {
    const result = generateWorkflow(trace([step({ tool: 'requestScreenCapture', arguments: {} })]));

    expect(result.omitted[0]?.reason).toContain('no workflow step exists');
  });

  it('produces an empty workflow from a trace of nothing but observations', () => {
    const result = generateWorkflow(trace([step({ tool: 'getUiTree', arguments: {} })]));

    expect(result.workflow.nodes).toEqual([]);
  });
});

describe('durable selectors', () => {
  it('prefers the resolved resourceId over the text the agent tapped by', () => {
    // The whole point: a trace of text matches compiles into a workflow that breaks on
    // translation, while the resolved id survives (ADR 0009).
    const result = generateWorkflow(
      trace([
        step({
          arguments: { selector: { text: 'Send' } },
          resolvedElement: { resourceId: 'com.whatsapp:id/send', text: 'Send' },
          matchedBy: 'resourceId',
        }),
      ]),
    );

    const selector = (result.workflow.nodes[0]?.config as { selector: { resourceId?: string } })
      .selector;

    expect(selector.resourceId).toBe('com.whatsapp:id/send');
    expect(result.origins[0]?.strategy).toBe('resourceId');
  });

  it('falls back to the accessibility label when there is no id', () => {
    const result = generateWorkflow(
      trace([step({ resolvedElement: { contentDescription: 'Send message' } })]),
    );

    expect(result.origins[0]?.strategy).toBe('accessibilitySemantics');
  });

  it('uses visible text when neither id nor label exists, and says it may break', () => {
    const result = generateWorkflow(trace([step({ resolvedElement: { text: 'Send' } })]));

    expect(result.origins[0]?.strategy).toBe('text');
    expect(result.origins[0]?.rationale).toContain('translated');
  });

  it('falls back to position when the element has no identity at all', () => {
    const result = generateWorkflow(
      trace([
        step({
          resolvedElement: { bounds: { left: 900, top: 1_800, right: 1_050, bottom: 1_950 } },
        }),
      ]),
    );

    expect(result.origins[0]?.strategy).toBe('relativePosition');
    expect(result.origins[0]?.rationale).toContain('screen inspector');
  });

  it('keeps bounds alongside a strong selector, as the resolver fallback', () => {
    // What makes the chain resolvable when an app update removes the id.
    const result = generateWorkflow(
      trace([
        step({
          resolvedElement: {
            resourceId: 'com.whatsapp:id/send',
            bounds: { left: 900, top: 1_800, right: 1_050, bottom: 1_950 },
          },
        }),
      ]),
    );

    const selector = (result.workflow.nodes[0]?.config as { selector: { bounds?: unknown } })
      .selector;

    expect(selector.bounds).toBeDefined();
  });

  it('scopes a selector to the screen it was recorded on', () => {
    // One package renders many screens; a "Send" selector from a conversation must not
    // resolve against the chat list.
    const result = generateWorkflow(trace([step({ resolvedElement: { text: 'Send' } })]));

    const selector = (
      result.workflow.nodes[0]?.config as {
        selector: { packageName?: string; activityName?: string };
      }
    ).selector;

    expect(selector.packageName).toBe('com.whatsapp');
    expect(selector.activityName).toBe('com.whatsapp.Conversation');
  });

  it('reports honestly when nothing was captured to improve on', () => {
    const result = generateWorkflow(trace([step({ resolvedElement: undefined })]));

    expect(result.origins[0]?.rationale).toContain('no element details were captured');
  });

  it('marks a coordinate or position match as fragile', () => {
    const result = generateWorkflow(
      trace([step({ resolvedElement: { bounds: { left: 1, top: 1, right: 2, bottom: 2 } } })]),
    );

    expect(result.origins[0]?.fragile).toBe(true);
    expect(isFragileStrategy('coordinates')).toBe(true);
  });

  it('prefers the package name for openApp, even when opened by label', () => {
    // A generated workflow should not depend on a label match when it knows the package.
    const result = generateWorkflow(
      trace([step({ tool: 'openAppByName', arguments: { name: 'WhatsApp' } })]),
    );

    expect(result.workflow.nodes[0]?.config).toEqual({ packageName: 'com.whatsapp' });
  });
});

describe('variables', () => {
  it('turns typed text into a variable, so the workflow is reusable', () => {
    // Hardcoded to one message, a workflow can be replayed but not reused - and reuse is the
    // point of generating one.
    const result = generateWorkflow(
      trace([
        step({
          tool: 'typeText',
          arguments: { selector: { resourceId: 'com.whatsapp:id/entry' }, text: "I'll be late" },
          resolvedElement: { resourceId: 'com.whatsapp:id/entry' },
        }),
      ]),
    );

    expect(result.variableCount).toBe(1);
    expect(result.workflow.variables[0]?.defaultValue).toBe("I'll be late");
  });

  it('keeps the recorded value as the default, so running it unchanged reproduces the run', () => {
    const result = generateWorkflow(
      trace([step({ tool: 'typeText', arguments: { selector: { text: 'x' }, text: 'hello' } })]),
    );

    expect(result.workflow.variables[0]?.defaultValue).toBe('hello');
  });

  it('references the variable with the engine’s interpolation syntax', () => {
    const result = generateWorkflow(
      trace([
        step({
          tool: 'typeText',
          arguments: { selector: { text: 'x' }, text: 'hello' },
          resolvedElement: { resourceId: 'com.whatsapp:id/entry' },
        }),
      ]),
    );

    const config = result.workflow.nodes[0]?.config as { text: string };

    expect(config.text).toBe('{{ entry }}');
  });

  it('names variables after the field, not by number', () => {
    // `message` and `searchTerm` rather than `text1` and `text2` - the difference between a
    // reusable workflow and a puzzle.
    const result = generateWorkflow(
      trace([
        step({
          tool: 'typeText',
          arguments: { selector: { text: 'x' }, text: 'Robert' },
          resolvedElement: { resourceId: 'com.whatsapp:id/search_input' },
        }),
      ]),
    );

    expect(result.workflow.variables[0]?.name).toBe('searchInput');
  });

  it('produces a name the variable schema accepts', () => {
    const result = generateWorkflow(
      trace([
        step({
          tool: 'typeText',
          arguments: { selector: { text: 'x' }, text: 'y' },
          resolvedElement: { text: 'Type a message…' },
        }),
      ]),
    );

    expect(WorkflowSchema.safeParse(result.workflow).success).toBe(true);
  });

  it('suffixes on collision rather than reusing one variable for two fields', () => {
    const result = generateWorkflow(
      trace([
        step({
          tool: 'typeText',
          arguments: { selector: { text: 'a' }, text: 'one' },
          resolvedElement: { resourceId: 'com.app:id/field' },
        }),
        step({
          tool: 'typeText',
          arguments: { selector: { text: 'b' }, text: 'two' },
          resolvedElement: { resourceId: 'com.app:id/field' },
        }),
      ]),
    );

    expect(result.workflow.variables.map((variable) => variable.name)).toEqual(['field', 'field2']);
  });

  it('can be turned off, for a workflow meant to replay exactly', () => {
    const result = generateWorkflow(
      trace([step({ tool: 'typeText', arguments: { selector: { text: 'x' }, text: 'hello' } })]),
      { extractVariables: false },
    );

    expect(result.variableCount).toBe(0);
    expect((result.workflow.nodes[0]?.config as { text: string }).text).toBe('hello');
  });
});

describe('execution policy', () => {
  it('gives a wait retries, since a slow screen is the commonest replay failure', () => {
    const result = generateWorkflow(
      trace([step({ tool: 'waitForElement', arguments: { selector: { text: 'Send' } } })]),
    );

    expect(result.workflow.nodes[0]?.executionPolicy.retry).toBeGreaterThan(0);
  });

  it('does not retry a tap, which could submit a form twice', () => {
    const result = generateWorkflow(trace([step({ tool: 'click' })]));

    expect(result.workflow.nodes[0]?.executionPolicy.retry).toBe(0);
  });
});

describe('tool to node mapping', () => {
  it('maps the actions a generated workflow needs', () => {
    expect(TOOL_TO_NODE.click).toBe('click');
    expect(TOOL_TO_NODE.typeText).toBe('typeText');
    expect(TOOL_TO_NODE.openApp).toBe('openApp');
    expect(TOOL_TO_NODE.waitForElement).toBe('waitForElement');
  });

  it('maps both ways of opening an app to the same node', () => {
    expect(TOOL_TO_NODE.openAppByName).toBe('openApp');
  });
});

describe('durabilityOf', () => {
  it('scores a workflow of id matches highest', () => {
    const result = generateWorkflow(
      trace([step({ resolvedElement: { resourceId: 'com.app:id/send' } })]),
    );

    const durability = durabilityOf(result.origins);

    expect(durability.score).toBe(1);
    expect(durability.fragileCount).toBe(0);
    expect(durability.summary).toContain('keep working');
  });

  it('scores a workflow of position matches lower and counts them', () => {
    const result = generateWorkflow(
      trace([step({ resolvedElement: { bounds: { left: 1, top: 1, right: 2, bottom: 2 } } })]),
    );

    const durability = durabilityOf(result.origins);

    expect(durability.score).toBeLessThan(0.5);
    expect(durability.fragileCount).toBe(1);
    expect(durability.summary).toContain('layout changes');
  });

  it('handles a workflow with no targeted steps', () => {
    const result = generateWorkflow(trace([step({ tool: 'pressBack', arguments: {} })]));

    expect(durabilityOf(result.origins).summary).toContain('No steps target');
  });
});
