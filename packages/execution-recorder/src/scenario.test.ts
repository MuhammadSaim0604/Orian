import { WorkflowSchema } from '@mobile-automation/workflow-schema';
import { describe, expect, it } from 'vitest';

import { generateWorkflow } from './generator';
import { ExecutionRecorder, type ToolExecutedLike } from './recorder';
import { checkReplay } from './replay';

/**
 * The flagship scenario, end to end through the recorder.
 *
 * "Send Robert a WhatsApp message that I'll be late tomorrow" — recorded as the agent would
 * emit it, compiled into a workflow, and checked. This is the Phase 9 definition of done
 * minus the device: it proves the trace carries enough to generate a durable workflow, which
 * is the part that can be proven offline.
 *
 * The events below are shaped exactly as `ai-agent`'s `toolExecuted` emits them, so if that
 * event ever loses a field this test fails rather than the recorder silently producing a
 * poorer trace.
 */

const AT = 1_700_000_000_000;

/** The run the agent actually performs, observations and all. */
const whatsAppRun: readonly ToolExecutedLike[] = [
  {
    runId: 'run_1',
    step: 1,
    tool: 'openApp',
    arguments: { packageName: 'com.whatsapp' },
    outcome: 'succeeded',
    durationMs: 900,
    packageName: 'com.whatsapp',
    activityName: 'com.whatsapp.HomeActivity',
    uiTreeBefore: { root: { children: [] } },
    screenAfter: 'com.whatsapp/HomeActivity',
    timestampEpochMs: AT,
  },
  {
    runId: 'run_1',
    step: 2,
    tool: 'getUiTree',
    arguments: { compact: true },
    outcome: 'succeeded',
    durationMs: 60,
    packageName: 'com.whatsapp',
    activityName: 'com.whatsapp.HomeActivity',
    uiTreeBefore: { root: { children: [] } },
    result: { nodeCount: 40 },
    timestampEpochMs: AT + 1_000,
  },
  {
    runId: 'run_1',
    step: 3,
    tool: 'click',
    arguments: { selector: { contentDescription: 'Search' } },
    outcome: 'succeeded',
    durationMs: 120,
    packageName: 'com.whatsapp',
    activityName: 'com.whatsapp.HomeActivity',
    uiTreeBefore: { root: { children: [] } },
    resolvedElement: {
      resourceId: 'com.whatsapp:id/menuitem_search',
      contentDescription: 'Search',
      strategy: 'resourceId',
      bounds: { left: 900, top: 100, right: 1_000, bottom: 200 },
      clickable: true,
    },
    matchedBy: 'resourceId',
    screenAfter: 'com.whatsapp/HomeActivity',
    timestampEpochMs: AT + 2_000,
  },
  {
    runId: 'run_1',
    step: 4,
    tool: 'typeText',
    arguments: { selector: { resourceId: 'com.whatsapp:id/search_input' }, text: 'Robert' },
    outcome: 'succeeded',
    durationMs: 300,
    packageName: 'com.whatsapp',
    activityName: 'com.whatsapp.HomeActivity',
    uiTreeBefore: { root: { children: [] } },
    resolvedElement: {
      resourceId: 'com.whatsapp:id/search_input',
      className: 'android.widget.EditText',
      strategy: 'resourceId',
      editable: true,
    },
    matchedBy: 'resourceId',
    timestampEpochMs: AT + 3_000,
  },
  {
    runId: 'run_1',
    step: 5,
    // A step the agent needed and a workflow does not: it was deciding whether Robert
    // appeared in the results.
    tool: 'findElement',
    arguments: { selector: { text: 'Robert' } },
    outcome: 'succeeded',
    durationMs: 80,
    packageName: 'com.whatsapp',
    activityName: 'com.whatsapp.HomeActivity',
    uiTreeBefore: { root: { children: [] } },
    result: { text: 'Robert', strategy: 'text' },
    timestampEpochMs: AT + 4_000,
  },
  {
    runId: 'run_1',
    step: 6,
    tool: 'click',
    arguments: { selector: { text: 'Robert' } },
    outcome: 'succeeded',
    durationMs: 140,
    packageName: 'com.whatsapp',
    activityName: 'com.whatsapp.HomeActivity',
    uiTreeBefore: { root: { children: [] } },
    resolvedElement: {
      text: 'Robert',
      className: 'android.widget.TextView',
      strategy: 'text',
      bounds: { left: 0, top: 400, right: 1_080, bottom: 550 },
      clickable: true,
    },
    matchedBy: 'text',
    screenAfter: 'com.whatsapp/Conversation',
    timestampEpochMs: AT + 5_000,
  },
  {
    runId: 'run_1',
    step: 7,
    // The agent tried to send before typing, and recovered. The failure stays in the trace
    // because it explains why step 8 looks like a repeat.
    tool: 'click',
    arguments: { selector: { resourceId: 'com.whatsapp:id/send' } },
    outcome: 'failed',
    durationMs: 60,
    packageName: 'com.whatsapp',
    activityName: 'com.whatsapp.Conversation',
    uiTreeBefore: { root: { children: [] } },
    error: 'Element not found: send',
    errorCode: 'element_not_found',
    timestampEpochMs: AT + 6_000,
  },
  {
    runId: 'run_1',
    step: 8,
    tool: 'typeText',
    arguments: {
      selector: { resourceId: 'com.whatsapp:id/entry' },
      text: "I'll be late tomorrow",
    },
    outcome: 'succeeded',
    durationMs: 400,
    packageName: 'com.whatsapp',
    activityName: 'com.whatsapp.Conversation',
    uiTreeBefore: { root: { children: [] } },
    resolvedElement: {
      resourceId: 'com.whatsapp:id/entry',
      className: 'android.widget.EditText',
      strategy: 'resourceId',
      editable: true,
    },
    matchedBy: 'resourceId',
    timestampEpochMs: AT + 7_000,
  },
  {
    runId: 'run_1',
    step: 9,
    tool: 'click',
    arguments: { selector: { resourceId: 'com.whatsapp:id/send' } },
    outcome: 'succeeded',
    durationMs: 130,
    packageName: 'com.whatsapp',
    activityName: 'com.whatsapp.Conversation',
    uiTreeBefore: { root: { children: [] } },
    resolvedElement: {
      resourceId: 'com.whatsapp:id/send',
      contentDescription: 'Send',
      strategy: 'resourceId',
      bounds: { left: 950, top: 1_800, right: 1_060, bottom: 1_910 },
      clickable: true,
    },
    matchedBy: 'resourceId',
    screenAfter: 'com.whatsapp/Conversation',
    timestampEpochMs: AT + 8_000,
  },
];

const recordRun = () => {
  const recorder = new ExecutionRecorder();

  recorder.start({
    runId: 'run_1',
    goal: "Send Robert a WhatsApp message that I'll be late tomorrow",
    model: 'gpt-4o-mini',
    timestampEpochMs: AT,
  });

  for (const event of whatsAppRun) recorder.record(event);

  return recorder.finish({
    outcome: 'succeeded',
    summary: 'The message has been sent to Robert.',
    timestampEpochMs: AT + 9_000,
  })!;
};

describe('recording the WhatsApp run', () => {
  it('captures every executed tool, including the failure', () => {
    const trace = recordRun();

    expect(trace.steps).toHaveLength(9);
    expect(trace.steps.filter((step) => step.outcome === 'failed')).toHaveLength(1);
  });

  it('keeps the screen each step happened on', () => {
    const trace = recordRun();

    expect(trace.steps[0]?.screen.activityName).toContain('HomeActivity');
    expect(trace.steps[8]?.screen.activityName).toContain('Conversation');
  });

  it('keeps the resolved element for every targeted step', () => {
    // Without this the whole generation path degrades to coordinates.
    const trace = recordRun();

    const targeted = trace.steps.filter(
      (step) => ['click', 'typeText'].includes(step.tool) && step.outcome === 'succeeded',
    );

    for (const step of targeted) {
      expect(step.resolvedElement).toBeDefined();
    }
  });
});

describe('generating a workflow from it', () => {
  it('produces a valid workflow', () => {
    const result = generateWorkflow(recordRun());

    expect(WorkflowSchema.safeParse(result.workflow).success).toBe(true);
  });

  it('collapses the observations and drops the failure', () => {
    // Nine recorded steps become six: two observations and one failure are left out.
    const result = generateWorkflow(recordRun());

    expect(result.workflow.nodes.map((node) => node.type)).toEqual([
      'openApp',
      'click',
      'typeText',
      'click',
      'typeText',
      'click',
    ]);
  });

  it('explains each omission', () => {
    const result = generateWorkflow(recordRun());

    expect(result.omitted).toHaveLength(3);
    expect(result.omitted.map((entry) => entry.tool).sort()).toEqual([
      'click',
      'findElement',
      'getUiTree',
    ]);
  });

  it('uses the resolved resourceId even where the agent tapped by label', () => {
    // Step 3 tapped by contentDescription; the resolver matched a resourceId, and that is
    // what a durable workflow should carry (ADR 0009).
    const result = generateWorkflow(recordRun());

    const search = result.workflow.nodes[1]!;
    const selector = (search.config as { selector: { resourceId?: string } }).selector;

    expect(selector.resourceId).toBe('com.whatsapp:id/menuitem_search');
  });

  it('keeps the one text match as text, since that element has no id', () => {
    // Reported honestly rather than upgraded to something it is not.
    const result = generateWorkflow(recordRun());

    const robert = result.origins.find((origin) => origin.strategy === 'text');

    expect(robert).toBeDefined();
    expect(robert?.rationale).toContain('translated');
  });

  it('turns both typed values into named variables, so the workflow is reusable', () => {
    const result = generateWorkflow(recordRun());

    expect(result.workflow.variables.map((variable) => variable.name)).toEqual([
      'searchInput',
      'entry',
    ]);
    expect(result.workflow.variables[1]?.defaultValue).toBe("I'll be late tomorrow");
  });

  it('names the workflow after the goal', () => {
    const result = generateWorkflow(recordRun());

    expect(result.workflow.metadata.name).toContain('Robert');
    expect(result.workflow.metadata.source).toBe('generated');
  });

  it('chains every node in run order', () => {
    const result = generateWorkflow(recordRun());

    expect(result.workflow.edges).toHaveLength(result.workflow.nodes.length - 1);
  });

  it('records no coordinates anywhere in the generated selectors', () => {
    // The single most important property of the output: the run tapped pixels, the workflow
    // does not.
    const result = generateWorkflow(recordRun());

    for (const node of result.workflow.nodes) {
      const selector = (node.config as { selector?: { coordinates?: unknown } }).selector;
      expect(selector?.coordinates).toBeUndefined();
    }
  });
});

describe('checking the generated workflow', () => {
  it('finds nothing that would stop it running', () => {
    const trace = recordRun();
    const result = checkReplay(trace, generateWorkflow(trace));

    expect(result.ok).toBe(true);
  });

  it('accounts for every actionable step', () => {
    const trace = recordRun();
    const result = checkReplay(trace, generateWorkflow(trace));

    expect(result.coverage.generated).toBe(result.coverage.actionable);
  });

  it('flags the screen change into the conversation as wanting a wait', () => {
    // Genuinely useful advice: this workflow would be the one to fail on a cold start.
    const trace = recordRun();
    const result = checkReplay(trace, generateWorkflow(trace));

    expect(result.issues.some((issue) => issue.kind === 'missing-wait')).toBe(true);
  });

  it('does not warn about fragile selectors, since only one step matched by text', () => {
    const trace = recordRun();
    const result = checkReplay(trace, generateWorkflow(trace));

    expect(result.issues.some((issue) => issue.kind === 'fragile-selector')).toBe(false);
  });
});
