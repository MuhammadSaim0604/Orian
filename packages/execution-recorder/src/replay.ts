import { type Workflow } from '@mobile-automation/workflow-schema';

import { type GenerationResult } from './generator';
import { type ExecutionTrace, isObservationTool } from './schema';

/**
 * Replay validation.
 *
 * The Phase 9 definition of done asks that a generated workflow "reproduces the outcome",
 * and the honest answer is that only a device can confirm that. What can be checked
 * beforehand is whether the workflow *could* reproduce it: does it act on the same screens,
 * in the same order, with selectors that will resolve.
 *
 * That distinction is the point of this module. It is a **pre-flight check**, not a
 * simulation - claiming to have verified a replay without running it would be worse than
 * not checking at all, because the user would trust the result.
 */

export const REPLAY_ISSUE_KINDS = [
  'no-actions',
  'fragile-selector',
  'missing-wait',
  'screen-mismatch',
  'unresolvable-selector',
  'lost-step',
] as const;

export type ReplayIssueKind = (typeof REPLAY_ISSUE_KINDS)[number];

export type ReplayIssue = {
  readonly kind: ReplayIssueKind;
  /** The node it concerns, when it concerns one. */
  readonly nodeId?: string;
  readonly message: string;
  /**
   * Whether this would stop the workflow running at all.
   *
   * Separated from a warning because the two demand different things: a blocker must be
   * fixed before saving is worthwhile, while a warning is a judgement the user makes.
   */
  readonly blocking: boolean;
};

export type ReplayCheck = {
  readonly ok: boolean;
  readonly issues: readonly ReplayIssue[];
  /** Steps in the trace that became nodes, over steps that could have. */
  readonly coverage: { readonly generated: number; readonly actionable: number };
};

/**
 * Checks a generated workflow against the trace it came from.
 *
 * Deliberately conservative about what it claims. Everything here is derivable from the two
 * documents; nothing pretends to know what the device will do.
 */
export const checkReplay = (trace: ExecutionTrace, generation: GenerationResult): ReplayCheck => {
  const issues: ReplayIssue[] = [];
  const { workflow, origins } = generation;

  const actionable = trace.steps.filter(
    (step) => step.outcome === 'succeeded' && !isObservationTool(step.tool),
  );

  if (workflow.nodes.length === 0) {
    issues.push({
      kind: 'no-actions',
      message:
        actionable.length === 0
          ? 'The run did not complete any repeatable actions, so there is nothing to replay.'
          : 'None of the run’s actions could be turned into workflow steps.',
      blocking: true,
    });
  }

  // A step that was actionable but produced no node is a real loss rather than a collapse,
  // and the user should be told before they save a workflow that skips it.
  const generatedFrom = new Set(origins.flatMap((origin) => origin.fromSteps));

  for (const step of actionable) {
    if (!generatedFrom.has(step.index)) {
      issues.push({
        kind: 'lost-step',
        message: `Step ${step.index} (${step.tool}) succeeded during the run but is not in the workflow.`,
        blocking: false,
      });
    }
  }

  for (const origin of origins) {
    if (!origin.fragile) continue;

    issues.push({
      kind: 'fragile-selector',
      nodeId: origin.nodeId,
      // Not blocking: it will run, and it may well work. The user needs to know it is the
      // step most likely to break later.
      message: `${origin.nodeId} matches by position, so it will break if the app’s layout changes.`,
      blocking: false,
    });
  }

  issues.push(...selectorIssues(workflow));
  issues.push(...waitIssues(workflow, trace));
  issues.push(...screenIssues(workflow, trace));

  return {
    ok: !issues.some((issue) => issue.blocking),
    issues,
    coverage: { generated: workflow.nodes.length, actionable: actionable.length },
  };
};

/**
 * Selectors that cannot locate anything.
 *
 * Blocking, because the workflow will fail at that step with "element not found" - and the
 * user will look at their phone rather than at their workflow, which is exactly the
 * confusion the selector schema exists to prevent.
 */
const selectorIssues = (workflow: Workflow): readonly ReplayIssue[] => {
  const issues: ReplayIssue[] = [];

  for (const node of workflow.nodes) {
    const config = node.config as { selector?: Record<string, unknown> } | undefined;
    const selector = config?.selector;

    if (selector === undefined) continue;

    const locating = [
      'resourceId',
      'contentDescription',
      'text',
      'structuralPath',
      'bounds',
      'coordinates',
    ];

    if (!locating.some((field) => selector[field] !== undefined)) {
      issues.push({
        kind: 'unresolvable-selector',
        nodeId: node.id,
        message: `${node.id} has nothing to identify its target, so it cannot find the element.`,
        blocking: true,
      });
    }
  }

  return issues;
};

/**
 * Screen transitions with no wait.
 *
 * The commonest reason a generated workflow fails on a cold start while working when
 * replayed slowly. The agent was slow enough not to need a wait - it was thinking between
 * steps - and a workflow is not.
 */
const waitIssues = (workflow: Workflow, trace: ExecutionTrace): readonly ReplayIssue[] => {
  const issues: ReplayIssue[] = [];

  const stepsByIndex = new Map(trace.steps.map((step) => [step.index, step]));

  for (const [position, node] of workflow.nodes.entries()) {
    const next = workflow.nodes[position + 1];
    if (next === undefined) continue;

    // Only a step that changed screen matters: a tap that stays put needs no wait.
    const changedScreen = didChangeScreen(node, next, stepsByIndex, trace);

    if (changedScreen && next.type !== 'waitForElement') {
      issues.push({
        kind: 'missing-wait',
        nodeId: next.id,
        message:
          `${node.id} moves to a new screen, and ${next.id} acts immediately. ` +
          'Add a wait step if the workflow fails on a slow device.',
        blocking: false,
      });
    }
  }

  return issues;
};

/**
 * Whether the transition between two generated nodes crossed a screen boundary.
 *
 * Read from the trace rather than guessed from node types, because whether a tap opens a new
 * screen is a fact about the app, not about the tool.
 */
const didChangeScreen = (
  node: Workflow['nodes'][number],
  next: Workflow['nodes'][number],
  stepsByIndex: Map<number, ExecutionTrace['steps'][number]>,
  trace: ExecutionTrace,
): boolean => {
  const nodeStep = findStepFor(node.id, trace, stepsByIndex);
  const nextStep = findStepFor(next.id, trace, stepsByIndex);

  if (nodeStep === undefined || nextStep === undefined) return false;

  return (
    nodeStep.screen.activityName !== nextStep.screen.activityName ||
    nodeStep.screen.packageName !== nextStep.screen.packageName
  );
};

/**
 * Matches a generated node back to its trace step by ordinal.
 *
 * Node ids carry their position (`click_3`), which is enough here and avoids threading
 * origins through every check.
 */
const findStepFor = (
  nodeId: string,
  trace: ExecutionTrace,
  stepsByIndex: Map<number, ExecutionTrace['steps'][number]>,
): ExecutionTrace['steps'][number] | undefined => {
  const ordinal = Number.parseInt(nodeId.split('_').pop() ?? '', 10);
  if (!Number.isFinite(ordinal)) return undefined;

  const actionable = trace.steps.filter(
    (step) => step.outcome === 'succeeded' && !isObservationTool(step.tool),
  );

  return actionable[ordinal - 1] ?? stepsByIndex.get(ordinal);
};

/**
 * Steps whose selector is scoped to a screen the workflow never reaches.
 *
 * A selector carrying an activity it will never be on resolves to nothing, and the failure
 * reads as "the element is missing" rather than "you are on the wrong screen".
 */
const screenIssues = (workflow: Workflow, trace: ExecutionTrace): readonly ReplayIssue[] => {
  const issues: ReplayIssue[] = [];

  const visited = new Set(
    trace.steps
      .map((step) => step.screen.activityName)
      .filter((activity): activity is string => activity !== null),
  );

  for (const node of workflow.nodes) {
    const config = node.config as { selector?: { activityName?: unknown } } | undefined;
    const activity = config?.selector?.activityName;

    if (typeof activity === 'string' && !visited.has(activity)) {
      issues.push({
        kind: 'screen-mismatch',
        nodeId: node.id,
        message: `${node.id} expects a screen the run never visited (${activity}).`,
        blocking: false,
      });
    }
  }

  return issues;
};

/** A one-line verdict for the review screen. */
export const describeReplayCheck = (check: ReplayCheck): string => {
  const blocking = check.issues.filter((issue) => issue.blocking).length;

  if (blocking > 0) {
    return `${blocking} problem${blocking === 1 ? '' : 's'} would stop this workflow running.`;
  }

  const warnings = check.issues.length;

  if (warnings === 0) {
    return `All ${check.coverage.generated} steps look ready to replay.`;
  }

  return `Ready to run, with ${warnings} thing${warnings === 1 ? '' : 's'} worth checking.`;
};
