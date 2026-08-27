import { type z } from 'zod';

import { type ExecutionPolicy, type JsonValue, type NodeKind } from './contracts';

/**
 * What a node can reach while it runs.
 *
 * A deliberately narrow surface. A node receives its validated config, whatever
 * upstream nodes produced, the variable store, and a way to invoke device tools -
 * nothing else. It cannot see the graph, reach other nodes directly, or decide
 * what runs next, because that is the engine's job and a node that could do it
 * would make execution order impossible to reason about.
 */
export type ExecutionContext<TConfig = unknown> = {
  /** Id of the node being executed, for error messages and events. */
  readonly nodeId: string;

  /** Config already validated against this node's schema. */
  readonly config: TConfig;

  /** Values arriving on this node's input handles. */
  readonly inputs: Readonly<Record<string, JsonValue>>;

  /** The run's variable store, shared across nodes. */
  readonly variables: VariableStore;

  /** Device tools. Absent when running a workflow with no device attached. */
  readonly tools: ToolInvoker;

  /**
   * Cancellation signal.
   *
   * A workflow can be stopped by the user mid-run, and a long `waitForElement`
   * must abandon its wait rather than finish and then discover nobody cares.
   */
  readonly signal: AbortSignal;

  /** Progress reporting, surfaced in the execution log. */
  readonly log: (message: string) => void;

  /** How many times this node has already been attempted, starting at 0. */
  readonly attempt: number;
};

/**
 * Read/write access to the run's variables.
 *
 * An interface rather than a plain object so the engine can enforce declared
 * types on write and record which nodes touched what.
 */
export type VariableStore = {
  get: (name: string) => JsonValue | undefined;
  set: (name: string, value: JsonValue) => void;
  has: (name: string) => boolean;
  /** Snapshot for the debugger. Mutating it must not affect the store. */
  snapshot: () => Record<string, JsonValue>;
};

/**
 * Invokes a device tool by name.
 *
 * An interface, not an import of the native bridge. Keeping it abstract is what
 * lets `android-nodes` stay pure TypeScript and unit-testable off-device: the app
 * supplies an implementation backed by `@mobile-automation/native-automation`,
 * while tests supply a fake. It is also the seam the recorder hooks into, since
 * every device action passes through here.
 */
export type ToolInvoker = {
  /** True when a device is attached and tools can actually run. */
  readonly isAvailable: boolean;

  /**
   * Runs a tool.
   *
   * Rejects on failure - callers should let the error propagate so the engine can
   * apply the node's retry policy, rather than swallowing it into a null.
   */
  invoke: (tool: string, args: Readonly<Record<string, unknown>>) => Promise<unknown>;
};

/**
 * Which output a node wants execution to continue along.
 *
 * Returned rather than inferred, because only the node knows: a condition picks
 * `true` or `false`, a loop alternates between `body` and `done`. The engine
 * follows the named handle instead of guessing from the result value.
 */
export type BranchDecision = {
  readonly handle: string;
};

/** What a node produces when it finishes. */
export type NodeResult = {
  /** Values published on this node's output handles. */
  readonly outputs?: Readonly<Record<string, JsonValue>>;

  /** Which output handle to follow. Defaults to the node's primary output. */
  readonly branch?: BranchDecision;

  /**
   * Ask the engine to re-enter this node.
   *
   * How a loop iterates without the node keeping hidden state across calls: it
   * says "come back to me" and the engine does, incrementing the iteration.
   */
  readonly repeat?: boolean;

  /** Human-readable summary for the execution log. */
  readonly summary?: string;
};

/** Presentation details, used by the builder UI's node palette. */
export type NodeDisplay = {
  readonly label: string;
  readonly description: string;
  /** Icon name from the shared icon set, not a path or a data URI. */
  readonly icon: string;
  readonly category: string;
};

/**
 * Everything the engine and the UI need to know about a node type.
 *
 * A plain object rather than a class to implement, so a third-party package can
 * export one without inheriting from anything - the same reason n8n nodes are
 * descriptions rather than subclasses.
 */
export type NodeDefinition<TConfig = unknown> = {
  /** Unique identifier, e.g. `click` or `@developer/custom-nodes:scrapeTable`. */
  readonly type: string;

  readonly version: string;

  /** Which generic category this node behaves as. */
  readonly kind: NodeKind;

  readonly display: NodeDisplay;

  /** Validates and types this node's config. */
  readonly configSchema: z.ZodType<TConfig>;

  readonly inputs: readonly PortSpec[];
  readonly outputs: readonly PortSpec[];

  /** Policy applied when the workflow does not override it. */
  readonly defaultExecutionPolicy?: Partial<ExecutionPolicy>;

  /**
   * True when this node touches the device, so a workflow can be checked for
   * device requirements before it starts rather than failing at the first action.
   */
  readonly requiresDevice?: boolean;

  execute: (context: ExecutionContext<TConfig>) => Promise<NodeResult>;
};

/** A port on a node. Handles are named so edges survive a definition gaining ports. */
export type PortSpec = {
  readonly handle: string;
  readonly label: string;
  readonly required?: boolean;
};

/**
 * A definition whose config type has been erased, for storing heterogeneous nodes
 * in one registry.
 *
 * Spelled out structurally rather than as `NodeDefinition<never>`, because
 * `z.ZodType<never>` accepts nothing and no real definition would satisfy it. This
 * shape keeps every `NodeDefinition<T>` assignable with no cast: the schema widens
 * to `ZodTypeAny`, and `execute` is safe by contravariance since `never` is
 * assignable to any config type.
 */
export type AnyNodeDefinition = Omit<NodeDefinition<unknown>, 'configSchema' | 'execute'> & {
  readonly configSchema: z.ZodTypeAny;
  execute: (context: ExecutionContext<never>) => Promise<NodeResult>;
};

/**
 * Erases a definition's config type so it can live in the registry.
 *
 * No cast is involved. Type safety is preserved where it matters - inside
 * `execute`, which receives the config its own schema produced - and the registry
 * validates config against `configSchema` before calling it.
 */
export const asAnyDefinition = <TConfig>(definition: NodeDefinition<TConfig>): AnyNodeDefinition =>
  definition;
