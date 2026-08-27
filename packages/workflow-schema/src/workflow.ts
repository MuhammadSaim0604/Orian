import { z } from 'zod';

import { ValidatedVariableSchema } from './variable';

/**
 * Node, edge, and workflow schemas: the workflow JSON format itself.
 *
 * A workflow is plain data with no React Native in sight, so the same definition
 * could execute anywhere (`architecture/Data_Models.md`). Everything here is
 * validated at load time, because a workflow may have been hand-edited, generated
 * by a model, or produced by an older version of the app.
 */

/** Semantic version, required on nodes so a definition can evolve. */
export const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export const SemverSchema = z
  .string()
  .regex(SEMVER_PATTERN, 'must be a semantic version such as 1.0.0');

/**
 * A port on a node.
 *
 * Named handles rather than positional indices, so an edge survives a node
 * definition gaining a port in a later version.
 */
export const PortSpecSchema = z.object({
  handle: z.string().min(1),
  label: z.string().min(1),
  /** Refused by the engine if nothing is connected. */
  required: z.boolean().default(false),
});

export type PortSpec = z.infer<typeof PortSpecSchema>;

/** Canvas position. Presentation only - it never affects execution order. */
export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export type Position = z.infer<typeof PositionSchema>;

export const NodeMetadataSchema = z.object({
  label: z.string().min(1),
  position: PositionSchema,
  /**
   * Package that contributed this node type, so a workflow referring to a node
   * from an uninstalled package can say which package to install.
   */
  packageName: z.string().min(1).optional(),
  notes: z.string().optional(),
});

export type NodeMetadata = z.infer<typeof NodeMetadataSchema>;

// --- execution policy ---------------------------------------------------

export const ERROR_BEHAVIOURS = ['stop', 'continue', 'retry'] as const;

export const ErrorBehaviourSchema = z.enum(ERROR_BEHAVIOURS);

export type ErrorBehaviour = z.infer<typeof ErrorBehaviourSchema>;

/** Ceiling on retries, so a failing node cannot hammer the device indefinitely. */
export const MAX_RETRY_ATTEMPTS = 10;

/** Ceiling on a single node's runtime. Ten minutes is already generous. */
export const MAX_NODE_TIMEOUT_MS = 600_000;

/**
 * What to do when a node fails.
 *
 * Per node rather than global because the right answer differs: a flaky
 * `waitForElement` should retry, while a failed `openApp` means the rest of the
 * workflow is meaningless and should stop.
 */
export const ExecutionPolicySchema = z
  .object({
    retry: z.number().int().min(0).max(MAX_RETRY_ATTEMPTS).default(0),
    /** Delay before a retry. Retrying instantly rarely helps a loading screen. */
    retryDelayMs: z.number().int().min(0).max(60_000).default(500),
    timeoutMs: z.number().int().positive().max(MAX_NODE_TIMEOUT_MS).optional(),
    onError: ErrorBehaviourSchema.default('stop'),
  })
  .refine((policy) => policy.onError !== 'retry' || policy.retry > 0, {
    // onError: 'retry' with retry: 0 reads as "retry" but behaves as "stop",
    // which is the kind of silent contradiction that wastes an afternoon.
    message: "onError 'retry' needs retry to be at least 1",
    path: ['retry'],
  });

export type ExecutionPolicy = z.infer<typeof ExecutionPolicySchema>;

export const DEFAULT_EXECUTION_POLICY: ExecutionPolicy = {
  retry: 0,
  retryDelayMs: 500,
  onError: 'stop',
};

// --- nodes --------------------------------------------------------------

/**
 * Node type identifier.
 *
 * Either a bare name (`click`) or namespaced by package
 * (`@developer/custom-nodes:scrapeTable`), which is how a third-party node avoids
 * colliding with a built-in.
 */
export const NODE_TYPE_PATTERN = /^(?:@[a-z0-9-]+\/[a-z0-9-]+:)?[A-Za-z][A-Za-z0-9_]*$/;

export const NodeTypeSchema = z
  .string()
  .min(1)
  .regex(
    NODE_TYPE_PATTERN,
    'node type must be an identifier, optionally prefixed with "@scope/package:"',
  );

/**
 * One node in the graph.
 *
 * `config` is `unknown` here on purpose: its real shape depends on `type`, and
 * only the registry knows which schema applies. The engine validates it against
 * the resolved definition when the graph is loaded, so an unregistered node type
 * is caught before anything executes.
 */
export const WorkflowNodeSchema = z.object({
  id: z.string().min(1),
  type: NodeTypeSchema,
  version: SemverSchema.default('1.0.0'),
  config: z.unknown().default({}),
  metadata: NodeMetadataSchema,
  executionPolicy: ExecutionPolicySchema.default(DEFAULT_EXECUTION_POLICY),
});

export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

// --- edges --------------------------------------------------------------

/**
 * Reserved output handles with meaning to the engine.
 *
 * A condition node's branches and a loop node's body are structural, not just
 * labels - the traversal reads them to decide where to go next.
 */
export const OUTPUT_HANDLE_TRUE = 'true';
export const OUTPUT_HANDLE_FALSE = 'false';
export const OUTPUT_HANDLE_BODY = 'body';
export const OUTPUT_HANDLE_DONE = 'done';
export const OUTPUT_HANDLE_NEXT = 'next';

export const RESERVED_OUTPUT_HANDLES = [
  OUTPUT_HANDLE_TRUE,
  OUTPUT_HANDLE_FALSE,
  OUTPUT_HANDLE_BODY,
  OUTPUT_HANDLE_DONE,
  OUTPUT_HANDLE_NEXT,
] as const;

export const INPUT_HANDLE_IN = 'in';

export const EdgeSchema = z
  .object({
    id: z.string().min(1),
    source: z.string().min(1),
    sourceHandle: z.string().min(1).default(OUTPUT_HANDLE_NEXT),
    target: z.string().min(1),
    targetHandle: z.string().min(1).default(INPUT_HANDLE_IN),
  })
  .refine((edge) => edge.source !== edge.target, {
    // A self-edge is always a cycle. Caught here so the message names the edge
    // rather than surfacing later as an opaque "cycle detected".
    message: 'an edge cannot connect a node to itself',
    path: ['target'],
  });

export type Edge = z.infer<typeof EdgeSchema>;

// --- workflow -----------------------------------------------------------

export const WorkflowMetadataSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  /** Version of the workflow document, bumped by the editor on each save. */
  version: z.number().int().positive().default(1),
  /**
   * Where this workflow came from. Worth recording: a generated workflow deserves
   * more scrutiny in the review UI than one a user built by hand.
   */
  source: z.enum(['manual', 'generated', 'imported']).default('manual'),
});

export type WorkflowMetadata = z.infer<typeof WorkflowMetadataSchema>;

/** Schema version of the workflow document format itself. */
export const WORKFLOW_SCHEMA_VERSION = 1;

/**
 * The structural workflow shape, before cross-reference checks.
 *
 * Split from `WorkflowSchema` so the referential integrity rules below can report
 * precise paths; a single monolithic refine could only say "invalid".
 */
const WorkflowShape = z.object({
  id: z.string().min(1),
  schemaVersion: z.number().int().positive().default(WORKFLOW_SCHEMA_VERSION),
  metadata: WorkflowMetadataSchema,
  variables: z.array(ValidatedVariableSchema).default([]),
  nodes: z.array(WorkflowNodeSchema),
  edges: z.array(EdgeSchema).default([]),
});

/**
 * A structurally valid workflow with consistent internal references.
 *
 * The refinements catch what per-field validation cannot: duplicate ids, and
 * edges pointing at nodes that do not exist. Both produce confusing runtime
 * behaviour rather than clean failures if allowed through - a duplicate node id
 * means the engine silently executes one node twice.
 */
export const WorkflowSchema = WorkflowShape.superRefine((workflow, ctx) => {
  const nodeIds = new Set<string>();
  for (const [index, node] of workflow.nodes.entries()) {
    if (nodeIds.has(node.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate node id "${node.id}"`,
        path: ['nodes', index, 'id'],
      });
    }
    nodeIds.add(node.id);
  }

  const edgeIds = new Set<string>();
  for (const [index, edge] of workflow.edges.entries()) {
    if (edgeIds.has(edge.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate edge id "${edge.id}"`,
        path: ['edges', index, 'id'],
      });
    }
    edgeIds.add(edge.id);

    if (!nodeIds.has(edge.source)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `edge "${edge.id}" starts at unknown node "${edge.source}"`,
        path: ['edges', index, 'source'],
      });
    }

    if (!nodeIds.has(edge.target)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `edge "${edge.id}" ends at unknown node "${edge.target}"`,
        path: ['edges', index, 'target'],
      });
    }
  }

  const variableNames = new Set<string>();
  for (const [index, variable] of workflow.variables.entries()) {
    if (variableNames.has(variable.name)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate variable name "${variable.name}"`,
        path: ['variables', index, 'name'],
      });
    }
    variableNames.add(variable.name);
  }
});

export type Workflow = z.infer<typeof WorkflowSchema>;
