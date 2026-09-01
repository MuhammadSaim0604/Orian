import {
  DEFAULT_EXECUTION_POLICY,
  type Edge,
  INPUT_HANDLE_IN,
  OUTPUT_HANDLE_NEXT,
  SELECTOR_STRATEGIES,
  type Selector,
  WORKFLOW_SCHEMA_VERSION,
  type Workflow,
  type WorkflowNode,
  isFragileStrategy,
  strategyRank,
} from '@mobile-automation/workflow-schema';

import {
  type ExecutionStep,
  type ExecutionTrace,
  isGeneratableStep,
  isObservationTool,
} from './schema';

/**
 * The generator: `ExecutionTrace → Workflow`.
 *
 * The whole value of generation is producing something **durable**. A trace is full of
 * coordinates because that is where taps landed; a workflow built from those coordinates
 * breaks on the next app update. So most of the work here is choosing a better selector
 * than the agent used, from the element the resolver actually matched (ADR 0009).
 *
 * Purely deterministic. A model is not involved: the trace already says exactly what
 * happened, and asking a model to restate it would introduce a chance of it saying
 * something else. Model-assisted generation from a *goal* is a separate path
 * (`Create by AI`); this one compiles a recording.
 */

/** How a step became a node, so the review screen can explain the workflow. */
export type GeneratedNodeOrigin = {
  readonly nodeId: string;
  /** Trace step indices this node came from. */
  readonly fromSteps: readonly number[];
  /** The selector strategy the generated node will use. */
  readonly strategy: string | null;
  /** True when the node had to fall back to coordinates or vision. */
  readonly fragile: boolean;
  /** Why the selector is what it is, in plain language. */
  readonly rationale: string;
};

export type GenerationResult = {
  readonly workflow: Workflow;
  /** Per-node provenance, for the review UI. */
  readonly origins: readonly GeneratedNodeOrigin[];
  /** Steps deliberately left out, and why - so nothing is silently dropped. */
  readonly omitted: readonly {
    readonly index: number;
    readonly tool: string;
    readonly reason: string;
  }[];
  /** Variables extracted from the run, so the workflow is reusable. */
  readonly variableCount: number;
};

/**
 * Node type for a recorded tool.
 *
 * Inverts `android-nodes`' `NODE_TO_TOOL` rather than restating it. Several node types map
 * to the same tool, so the inverse is ambiguous - the entries here name the one a generated
 * workflow should use, which is always the direct action rather than a variant.
 */
export const TOOL_TO_NODE: Readonly<Record<string, string>> = {
  openApp: 'openApp',
  openAppByName: 'openApp',
  click: 'click',
  longPress: 'longPress',
  swipe: 'swipe',
  typeText: 'typeText',
  waitForElement: 'waitForElement',
  pressBack: 'pressBack',
  pressHome: 'pressHome',
  sendNotification: 'notification',
  getContacts: 'contact',
  findContacts: 'contact',
  readClipboard: 'clipboardRead',
  writeClipboard: 'clipboardWrite',
  createAlarm: 'alarm',
  controlMedia: 'media',
  adjustVolume: 'volume',
  launchIntent: 'launchIntent',
  getSystemSetting: 'systemSetting',
  getUiTree: 'readScreen',
  takeScreenshot: 'takeScreenshot',
  // Both OCR tools compile to the one node, which owns the with-text / without-text distinction in its config.
  // A trace that used findTextOnScreen becomes an `ocr` node with `text` set.
  runOcr: 'ocr',
  findTextOnScreen: 'ocr',
  getCurrentScreen: 'currentScreen',
  findElement: 'findElement',
};

/** Horizontal spacing between generated nodes. Matches the canvas's node width plus a gap. */
const NODE_SPACING_X = 220;
const NODE_ROW_Y = 160;
/** Nodes per row before wrapping, so a long workflow does not become one enormous line. */
const NODES_PER_ROW = 4;

/**
 * Whether a strategy will break when the app's layout changes.
 *
 * Broader than `isFragileStrategy`, deliberately. That function marks the two strategies
 * that abandon meaning entirely (coordinates and vision); this one also counts
 * `relativePosition`, because a bounds match is still pixels and the review screen's job is
 * to warn about anything that an app update could silently break.
 */
const isPositionBased = (strategy: string): boolean =>
  isFragileStrategy(strategy as never) ||
  strategyRank(strategy as never) >= strategyRank('relativePosition');

export type GenerateOptions = {
  /** Name for the workflow. Defaults to the goal. */
  readonly name?: string;
  /**
   * Turn recorded text into variables.
   *
   * On by default: a workflow hardcoded to "I'll be late tomorrow" can be replayed but not
   * reused, and reuse is the point of generating one.
   */
  readonly extractVariables?: boolean;
  readonly now?: () => Date;
};

export const generateWorkflow = (
  trace: ExecutionTrace,
  options: GenerateOptions = {},
): GenerationResult => {
  const now = options.now ?? (() => new Date());
  const extractVariables = options.extractVariables ?? true;

  const omitted: { index: number; tool: string; reason: string }[] = [];
  const origins: GeneratedNodeOrigin[] = [];
  const nodes: WorkflowNode[] = [];
  const edges: Edge[] = [];
  const variables: Workflow['variables'] = [];

  for (const step of trace.steps) {
    if (isObservationTool(step.tool)) {
      omitted.push({
        index: step.index,
        tool: step.tool,
        // Stated rather than silent: a user comparing the trace to the workflow needs to
        // know these were dropped deliberately.
        reason: 'only read the screen — the workflow does not need to repeat it',
      });
      continue;
    }

    if (step.outcome === 'failed') {
      omitted.push({
        index: step.index,
        tool: step.tool,
        // Replaying a failure would reproduce the failure rather than the outcome.
        reason: 'failed during the run',
      });
      continue;
    }

    if (!isGeneratableStep(step)) {
      omitted.push({ index: step.index, tool: step.tool, reason: 'not a repeatable action' });
      continue;
    }

    const nodeType = TOOL_TO_NODE[step.tool];

    if (nodeType === undefined) {
      // A tool with no node is a real gap rather than a decision, so it is reported as one.
      omitted.push({
        index: step.index,
        tool: step.tool,
        reason: 'no workflow step exists for this action yet',
      });
      continue;
    }

    const position = layoutPosition(nodes.length);
    const nodeId = `${nodeType}_${nodes.length + 1}`;

    const built = buildConfig(step, nodeType, extractVariables, variables);

    nodes.push({
      id: nodeId,
      type: nodeType,
      version: '1.0.0',
      config: built.config,
      metadata: { label: labelFor(step, nodeType), position },
      executionPolicy: policyFor(nodeType),
    });

    origins.push({
      nodeId,
      fromSteps: [step.index],
      strategy: built.strategy,
      fragile: built.strategy !== null && isPositionBased(built.strategy),
      rationale: built.rationale,
    });

    // A straight chain. The trace is a sequence, and inventing branches from a linear
    // recording would produce a workflow whose shape the user never demonstrated.
    const previous = nodes[nodes.length - 2];
    if (previous !== undefined) {
      edges.push({
        id: `e_${edges.length + 1}`,
        source: previous.id,
        sourceHandle: OUTPUT_HANDLE_NEXT,
        target: nodeId,
        targetHandle: INPUT_HANDLE_IN,
      });
    }
  }

  const timestamp = now().toISOString();

  return {
    workflow: {
      id: `wf_${trace.id}`,
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      metadata: {
        name: options.name ?? trace.goal.slice(0, 80),
        description: `Generated from a recorded run: ${trace.goal}`,
        createdAt: timestamp,
        updatedAt: timestamp,
        version: 1,
        // Marked as generated, because the review UI gives a generated workflow more
        // scrutiny than one a user built by hand.
        source: 'generated',
      },
      variables,
      nodes,
      edges,
    },
    origins,
    omitted,
    variableCount: variables.length,
  };
};

/** Grid layout, wrapping so a twelve-step workflow is not one long horizontal line. */
const layoutPosition = (index: number): { x: number; y: number } => ({
  x: (index % NODES_PER_ROW) * NODE_SPACING_X,
  y: Math.floor(index / NODES_PER_ROW) * NODE_ROW_Y,
});

/**
 * Builds a node's config from a recorded step.
 *
 * Where the durability decision happens. The step's own arguments are the *starting* point,
 * not the answer: the agent may have tapped by text while the resolver matched a
 * resourceId, and the resourceId is what should end up in the workflow.
 */
const buildConfig = (
  step: ExecutionStep,
  nodeType: string,
  extractVariables: boolean,
  variables: Workflow['variables'],
): { config: Record<string, unknown>; strategy: string | null; rationale: string } => {
  const args = { ...step.arguments };

  // openApp: prefer the package name, which the recorder always knows even when the agent
  // opened the app by its human label. A generated workflow should not depend on a label
  // match when it has the exact package.
  if (nodeType === 'openApp') {
    const packageName =
      (typeof args.packageName === 'string' ? args.packageName : undefined) ??
      step.screen.packageName ??
      undefined;

    return {
      config: packageName === undefined ? args : { packageName },
      strategy: null,
      rationale:
        packageName === undefined
          ? 'Opens the app by name.'
          : 'Opens the app by package name, which does not change when the app is updated.',
    };
  }

  if (typeof args.selector === 'object' && args.selector !== null) {
    const improved = improveSelector(args.selector as Selector, step);

    const config: Record<string, unknown> = { ...args, selector: improved.selector };

    if (nodeType === 'typeText' && extractVariables && typeof args.text === 'string') {
      const variableName = declareVariable(variables, step, args.text);
      // `{{ name }}` is the engine's interpolation syntax, so the workflow reads the
      // variable at run time rather than the recorded literal.
      config.text = `{{ ${variableName} }}`;
    }

    return { config, strategy: improved.strategy, rationale: improved.rationale };
  }

  return { config: args, strategy: null, rationale: 'Takes no target.' };
};

/**
 * Chooses the most durable selector the trace supports.
 *
 * Walks the resolved element strongest-first, exactly as the runtime resolver does, so the
 * generated selector is one the device will match by the strategy this claims. Bounds are
 * kept alongside as the fallback, which is what makes the chain resolvable when an app
 * update removes the id.
 */
const improveSelector = (
  recorded: Selector,
  step: ExecutionStep,
): { selector: Selector; strategy: string | null; rationale: string } => {
  const element = step.resolvedElement;

  const scope = {
    packageName: step.screen.packageName ?? undefined,
    activityName: step.screen.activityName ?? undefined,
  };

  if (element === undefined) {
    // Nothing resolved, so the agent's own selector is all there is. Reported honestly
    // rather than dressed up.
    return {
      selector: { ...recorded, ...scope },
      strategy: recorded.resourceId !== undefined ? 'resourceId' : null,
      rationale: 'Uses the selector the run used; no element details were captured.',
    };
  }

  const bounds = element.bounds;

  if (typeof element.resourceId === 'string' && element.resourceId !== '') {
    return {
      selector: { resourceId: element.resourceId, bounds, ...scope },
      strategy: 'resourceId',
      rationale: "Matched by the app's own id, which survives updates and translation.",
    };
  }

  if (typeof element.contentDescription === 'string' && element.contentDescription !== '') {
    return {
      selector: { contentDescription: element.contentDescription, bounds, ...scope },
      strategy: 'accessibilitySemantics',
      rationale: 'Matched by accessibility label, which is stable across layout changes.',
    };
  }

  if (typeof element.text === 'string' && element.text !== '') {
    return {
      selector: {
        text: element.text,
        className: element.className ?? undefined,
        bounds,
        ...scope,
      },
      strategy: 'text',
      rationale: 'Matched by visible text. This may break if the app is translated.',
    };
  }

  if (bounds !== undefined) {
    return {
      selector: { bounds, className: element.className ?? undefined, ...scope },
      strategy: 'relativePosition',
      rationale:
        'No id or text was available, so this matches by position. Consider replacing it ' +
        'using the screen inspector.',
    };
  }

  return {
    selector: { ...recorded, ...scope },
    strategy: recorded.coordinates !== undefined ? 'coordinates' : null,
    rationale: 'Falls back to the recorded coordinates, which will break if the layout changes.',
  };
};

/**
 * Declares a variable for a recorded text value.
 *
 * What turns a replay into a reusable workflow: the run typed one particular message, and a
 * workflow hardcoded to it can only ever send that message. The recorded value becomes the
 * default, so running it unchanged reproduces the original.
 */
const declareVariable = (
  variables: Workflow['variables'],
  step: ExecutionStep,
  value: string,
): string => {
  const base = variableNameFor(step);

  // Suffixed on collision, since a workflow that types into two fields would otherwise
  // declare one variable and use it for both.
  let name = base;
  let suffix = 2;

  while (variables.some((variable) => variable.name === name)) {
    name = `${base}${suffix}`;
    suffix++;
  }

  variables.push({
    name,
    type: 'string',
    defaultValue: value,
    description: 'Text typed during the recorded run',
  });

  return name;
};

/**
 * A readable variable name from the field that was typed into.
 *
 * Derived from the element rather than numbered, so a workflow's variables are `message`
 * and `searchTerm` rather than `text1` and `text2` - which is the difference between a
 * reusable workflow and a puzzle.
 */
const variableNameFor = (step: ExecutionStep): string => {
  const element = step.resolvedElement;

  const source =
    element?.resourceId?.split('/').pop() ?? element?.contentDescription ?? element?.text ?? 'text';

  const cleaned = source
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((word, index) =>
      index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join('');

  return cleaned === '' ? 'text' : cleaned;
};

/** A label describing what the step does, not which tool it called. */
const labelFor = (step: ExecutionStep, nodeType: string): string => {
  const element = step.resolvedElement;

  const target =
    element?.text ??
    element?.contentDescription ??
    element?.resourceId?.split('/').pop() ??
    undefined;

  switch (nodeType) {
    case 'openApp':
      return `Open ${step.screen.packageName?.split('.').pop() ?? 'the app'}`;
    case 'click':
      return target === undefined ? 'Tap' : `Tap ${truncate(target, 18)}`;
    case 'longPress':
      return target === undefined ? 'Long press' : `Long press ${truncate(target, 14)}`;
    case 'typeText':
      return target === undefined ? 'Type text' : `Type into ${truncate(target, 14)}`;
    case 'swipe':
      return `Swipe ${String(step.arguments.direction ?? '')}`.trim();
    case 'waitForElement':
      return target === undefined ? 'Wait for the screen' : `Wait for ${truncate(target, 14)}`;
    default:
      return nodeType;
  }
};

/**
 * Execution policy for a generated node.
 *
 * A wait gets retries because a slow screen is the commonest cause of a replay failing, and
 * retrying costs nothing when it succeeds. An action does not: retrying a tap could submit a
 * form twice, and the recorded run only ever tapped once.
 */
const policyFor = (nodeType: string): WorkflowNode['executionPolicy'] =>
  nodeType === 'waitForElement'
    ? { ...DEFAULT_EXECUTION_POLICY, retry: 2, retryDelayMs: 1_000, onError: 'retry' }
    : DEFAULT_EXECUTION_POLICY;

const truncate = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;

/**
 * How durable the generated workflow is overall.
 *
 * Worth stating on the review screen: a workflow whose every step matched by id will
 * probably still work next month, and one full of coordinate matches probably will not. The
 * user can only judge that if they are told.
 */
export const durabilityOf = (
  origins: readonly GeneratedNodeOrigin[],
): {
  readonly score: number;
  readonly fragileCount: number;
  readonly summary: string;
} => {
  const targeted = origins.filter((origin) => origin.strategy !== null);

  if (targeted.length === 0) {
    return { score: 1, fragileCount: 0, summary: 'No steps target a specific element.' };
  }

  const fragileCount = targeted.filter((origin) => origin.fragile).length;

  // Averaged over the strategy ranks, normalised so 1 is "every step matched by id". The
  // divisor is the worst rank rather than the count, so adding a durable step to a fragile
  // workflow raises the score rather than diluting it.
  const worstRank = SELECTOR_STRATEGIES.length - 1;
  const averageRank =
    targeted.reduce((total, origin) => total + strategyRank(origin.strategy as never), 0) /
    targeted.length;

  const score = Math.max(0, 1 - averageRank / worstRank);

  return {
    score,
    fragileCount,
    summary:
      fragileCount === 0
        ? 'Every step targets an element by id or label, so this should keep working after app updates.'
        : `${fragileCount} of ${targeted.length} steps match by position, which will break if the app's layout changes.`,
  };
};
