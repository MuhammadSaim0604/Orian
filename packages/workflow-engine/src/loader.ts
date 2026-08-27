import {
  type AnyNodeDefinition,
  type NodeRegistry,
  UnknownNodeTypeError,
} from '@mobile-automation/node-sdk';
import {
  type Edge,
  INPUT_HANDLE_IN,
  OUTPUT_HANDLE_NEXT,
  type Workflow,
  type WorkflowNode,
  WorkflowSchema,
  validate,
  type ValidationIssue,
} from '@mobile-automation/workflow-schema';

/**
 * Loading a workflow into something executable.
 *
 * Everything that can be checked before touching the device is checked here: the
 * JSON shape, that every node type is registered, that each node's config satisfies
 * its own schema, that the graph has one entry point, and that it contains no cycle.
 *
 * The reason for doing all of it up front is that a workflow drives someone's phone.
 * Discovering on step nine that step ten refers to a node type nobody registered
 * leaves the user's phone half-way through a task, in a state no one designed.
 */

export class WorkflowLoadError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(
      `Workflow cannot be run:\n` +
        issues
          .map((issue) =>
            issue.path === '' ? `  - ${issue.message}` : `  - ${issue.path}: ${issue.message}`,
          )
          .join('\n'),
    );
    this.name = 'WorkflowLoadError';
    this.issues = issues;
    Object.setPrototypeOf(this, WorkflowLoadError.prototype);
  }
}

export const isWorkflowLoadError = (value: unknown): value is WorkflowLoadError =>
  value instanceof WorkflowLoadError;

/** A node paired with the definition that will execute it. */
export type ResolvedNode = {
  readonly node: WorkflowNode;
  readonly definition: AnyNodeDefinition;
  /** Config already validated against the definition's schema. */
  readonly config: unknown;
};

/**
 * A workflow ready to execute.
 *
 * Adjacency is precomputed rather than searched per step: the executor asks "what
 * follows this node on this handle" on every transition, and scanning the edge list
 * each time turns traversal quadratic on a large workflow.
 */
export type LoadedWorkflow = {
  readonly workflow: Workflow;
  readonly nodes: ReadonlyMap<string, ResolvedNode>;
  /** Node id -> output handle -> target node ids, in declaration order. */
  readonly outgoing: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;
  readonly incoming: ReadonlyMap<string, readonly Edge[]>;
  /** Where execution begins. */
  readonly entryNodeId: string;
  /** Node types in this workflow that need a device attached. */
  readonly deviceDependentTypes: readonly string[];
};

/**
 * Validates a workflow and resolves it against the registry.
 *
 * @throws WorkflowLoadError listing every problem found, not just the first. A
 *   generated or hand-edited workflow often has several, and fixing them one round
 *   trip at a time is miserable.
 */
export const loadWorkflow = (raw: unknown, registry: NodeRegistry): LoadedWorkflow => {
  const parsed = validate(WorkflowSchema, raw);
  if (!parsed.ok) throw new WorkflowLoadError(parsed.issues);

  const workflow = parsed.value;
  const issues: ValidationIssue[] = [];

  const nodes = new Map<string, ResolvedNode>();
  const deviceDependentTypes = new Set<string>();

  for (const [index, node] of workflow.nodes.entries()) {
    let definition: AnyNodeDefinition;

    try {
      definition = registry.require(node.type);
    } catch (error) {
      issues.push({
        path: `nodes[${index}].type`,
        message:
          error instanceof UnknownNodeTypeError
            ? error.message
            : `node type "${node.type}" could not be resolved`,
      });
      continue;
    }

    // Config is validated here, at load time, rather than when the node runs. A
    // typo in step ten should not be discovered after step nine has already sent a
    // message.
    const configResult = definition.configSchema.safeParse(node.config);
    if (!configResult.success) {
      for (const issue of configResult.error.issues) {
        const suffix = issue.path.length > 0 ? `.${issue.path.join('.')}` : '';
        issues.push({
          path: `nodes[${index}].config${suffix}`,
          message: issue.message,
        });
      }
      continue;
    }

    if (definition.requiresDevice === true) deviceDependentTypes.add(node.type);

    nodes.set(node.id, { node, definition, config: configResult.data });
  }

  const { outgoing, incoming } = buildAdjacency(workflow.edges);

  validateHandles(workflow, nodes, issues);

  const entryNodeId = findEntryNode(workflow, issues);

  const cycle = findCycle(workflow, outgoing);
  if (cycle !== null) {
    issues.push({
      path: 'edges',
      // Naming the loop is the difference between a fixable report and a puzzle.
      message: `the workflow loops forever: ${cycle.join(' -> ')}. Use a Loop node to repeat steps.`,
    });
  }

  if (issues.length > 0) throw new WorkflowLoadError(issues);

  return {
    workflow,
    nodes,
    outgoing,
    incoming,
    entryNodeId: entryNodeId!,
    deviceDependentTypes: [...deviceDependentTypes],
  };
};

/** Builds the outgoing and incoming edge indexes. */
const buildAdjacency = (
  edges: readonly Edge[],
): {
  outgoing: Map<string, Map<string, string[]>>;
  incoming: Map<string, Edge[]>;
} => {
  const outgoing = new Map<string, Map<string, string[]>>();
  const incoming = new Map<string, Edge[]>();

  for (const edge of edges) {
    let byHandle = outgoing.get(edge.source);
    if (byHandle === undefined) {
      byHandle = new Map<string, string[]>();
      outgoing.set(edge.source, byHandle);
    }

    const targets = byHandle.get(edge.sourceHandle);
    if (targets === undefined) {
      byHandle.set(edge.sourceHandle, [edge.target]);
    } else {
      targets.push(edge.target);
    }

    const arriving = incoming.get(edge.target);
    if (arriving === undefined) {
      incoming.set(edge.target, [edge]);
    } else {
      arriving.push(edge);
    }
  }

  return { outgoing, incoming };
};

/**
 * Checks every edge refers to a handle its node actually has.
 *
 * An edge on a handle that does not exist is silently unreachable, which presents as
 * "the workflow stopped early for no reason" - one of the hardest things to debug on
 * a canvas, because the edge is drawn and looks fine.
 */
const validateHandles = (
  workflow: Workflow,
  nodes: ReadonlyMap<string, ResolvedNode>,
  issues: ValidationIssue[],
): void => {
  for (const [index, edge] of workflow.edges.entries()) {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);

    // A missing node was already reported; do not pile on.
    if (source !== undefined) {
      const handles = source.definition.outputs.map((port) => port.handle);
      if (!handles.includes(edge.sourceHandle)) {
        issues.push({
          path: `edges[${index}].sourceHandle`,
          message:
            `node "${edge.source}" has no output "${edge.sourceHandle}"` +
            (handles.length > 0 ? ` (it has: ${handles.join(', ')})` : ''),
        });
      }
    }

    if (target !== undefined) {
      const handles = target.definition.inputs.map((port) => port.handle);
      if (!handles.includes(edge.targetHandle)) {
        issues.push({
          path: `edges[${index}].targetHandle`,
          message:
            `node "${edge.target}" has no input "${edge.targetHandle}"` +
            (handles.length > 0 ? ` (it has: ${handles.join(', ')})` : ''),
        });
      }
    }
  }
};

/**
 * Finds the single node execution starts from.
 *
 * A node with no incoming edges. Requiring exactly one is a deliberate constraint:
 * two entry points would mean the engine picks an order the canvas does not show,
 * and a workflow whose behaviour depends on an invisible choice is not debuggable.
 */
const findEntryNode = (workflow: Workflow, issues: ValidationIssue[]): string | undefined => {
  const hasIncoming = new Set(workflow.edges.map((edge) => edge.target));
  const roots = workflow.nodes.filter((node) => !hasIncoming.has(node.id));

  if (roots.length === 0) {
    issues.push({
      path: 'nodes',
      message: 'every node has something leading into it, so there is no place to start',
    });
    return undefined;
  }

  if (roots.length > 1) {
    issues.push({
      path: 'nodes',
      message:
        `this workflow has ${roots.length} possible starting points ` +
        `(${roots.map((node) => node.id).join(', ')}). Connect them so there is exactly one.`,
    });
    return undefined;
  }

  return roots[0]!.id;
};

/**
 * Finds a cycle, returning the node ids that form it.
 *
 * Iterative depth-first search with an explicit stack rather than recursion: a
 * generated workflow can be long, and blowing the JS stack while validating would
 * present as a crash rather than a validation error.
 *
 * Loop nodes do **not** create cycles in the graph - a loop repeats by asking the
 * engine to re-enter it, so its body still flows forward.
 */
const findCycle = (
  workflow: Workflow,
  outgoing: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>,
): string[] | null => {
  const VISITING = 1;
  const DONE = 2;
  const state = new Map<string, number>();

  const successors = (nodeId: string): string[] => {
    const byHandle = outgoing.get(nodeId);
    if (byHandle === undefined) return [];
    return [...byHandle.values()].flat();
  };

  for (const node of workflow.nodes) {
    if (state.get(node.id) === DONE) continue;

    const path: string[] = [];
    const stack: { id: string; nextIndex: number }[] = [{ id: node.id, nextIndex: 0 }];
    state.set(node.id, VISITING);
    path.push(node.id);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const children = successors(frame.id);

      if (frame.nextIndex >= children.length) {
        state.set(frame.id, DONE);
        stack.pop();
        path.pop();
        continue;
      }

      const child = children[frame.nextIndex]!;
      frame.nextIndex++;

      if (state.get(child) === VISITING) {
        // Trim the path to start at the repeated node so the report shows the loop
        // itself, not how execution reached it.
        const start = path.indexOf(child);
        return [...path.slice(start), child];
      }

      if (state.get(child) === DONE) continue;

      state.set(child, VISITING);
      path.push(child);
      stack.push({ id: child, nextIndex: 0 });
    }
  }

  return null;
};

/** The nodes reached by following one output handle, in declaration order. */
export const nextNodeIds = (
  loaded: LoadedWorkflow,
  nodeId: string,
  handle: string,
): readonly string[] => loaded.outgoing.get(nodeId)?.get(handle) ?? [];

/**
 * The handle a node's result says to follow.
 *
 * Defaults to `next` when a node expresses no preference, which is what an ordinary
 * action wants; only conditions and loops choose.
 */
export const branchHandle = (branch: { handle: string } | undefined): string =>
  branch?.handle ?? OUTPUT_HANDLE_NEXT;

export const DEFAULT_INPUT_HANDLE = INPUT_HANDLE_IN;
