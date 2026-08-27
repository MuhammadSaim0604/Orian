/**
 * `@mobile-automation/shared-types`
 *
 * Bottom of the dependency graph: types shared across every package. This
 * package must never import from another workspace package.
 *
 * It holds **plain TypeScript types only** - no Zod, no runtime validation. That
 * separation is what lets `node-sdk` sit at the bottom alongside it: a node
 * package needs the shape of a variable value or an execution policy, but must
 * not be forced to depend on the workflow schema to get it. `workflow-schema`
 * then declares Zod schemas that produce exactly these types, and a type-level
 * test there fails if the two ever diverge.
 */

/** Package identity, used to sanity-check wiring across the workspace. */
export const PACKAGE_NAME = '@mobile-automation/shared-types' as const;

/**
 * Which layer a piece of code belongs to. The language boundary between the
 * React Native product layer and the Kotlin OS layer is the core architectural
 * rule of this project, so it is worth naming in types.
 */
export type Layer = 'product' | 'runtime' | 'native';

/** A branded identifier, so ids of different kinds cannot be mixed up. */
export type Id<TBrand extends string> = string & { readonly __brand: TBrand };

export type WorkflowId = Id<'workflow'>;
export type NodeId = Id<'node'>;
export type EdgeId = Id<'edge'>;
export type ExecutionId = Id<'execution'>;

/** Result of an operation that is expected to fail in normal use. */
export type Result<TValue, TError = Error> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly error: TError };

export const ok = <TValue>(value: TValue): Result<TValue, never> => ({ ok: true, value });

export const err = <TError>(error: TError): Result<never, TError> => ({ ok: false, error });

/**
 * Any value that can travel through a workflow.
 *
 * Constrained to JSON because a workflow is serialized to disk, sent to a model,
 * and read back. A value that cannot round-trip through JSON - a function, a
 * Date, a class instance - would survive in memory and then vanish on reload.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

/** JSON object, the shape node inputs and outputs take. */
export type JsonObject = { [key: string]: JsonValue };

/** The device-agnostic node categories (ADR 0008). */
export const NODE_KINDS = [
  'input',
  'action',
  'condition',
  'loop',
  'variable',
  'transform',
  'trigger',
] as const;

export type NodeKind = (typeof NODE_KINDS)[number];

export const isNodeKind = (value: string): value is NodeKind =>
  (NODE_KINDS as readonly string[]).includes(value);

/** What to do when a node fails. */
export const ERROR_BEHAVIOURS = ['stop', 'continue', 'retry'] as const;

export type ErrorBehaviour = (typeof ERROR_BEHAVIOURS)[number];

/**
 * Per-node failure handling.
 *
 * Plain type here, Zod schema in `workflow-schema`. Both must agree; the schema
 * package asserts that at compile time.
 */
export type ExecutionPolicy = {
  readonly retry: number;
  readonly retryDelayMs: number;
  readonly timeoutMs?: number;
  readonly onError: ErrorBehaviour;
};

/** Lifecycle states a node passes through during a run. */
export const NODE_STATES = ['pending', 'running', 'succeeded', 'failed', 'skipped'] as const;

export type NodeState = (typeof NODE_STATES)[number];

/** A node is finished when it can no longer transition. */
export const isTerminalState = (state: NodeState): boolean =>
  state === 'succeeded' || state === 'failed' || state === 'skipped';
