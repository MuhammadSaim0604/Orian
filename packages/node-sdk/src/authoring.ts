import { type JsonObject, type JsonValue } from './contracts';
import {
  type AnyNodeDefinition,
  type ExecutionContext,
  type NodeDefinition,
  type NodeResult,
  type ToolInvoker,
  type VariableStore,
} from './definition';
import { NodeExecutionError } from './errors';

/**
 * Helpers for authoring and testing nodes.
 *
 * These exist so a node author is not obliged to reimplement config validation or
 * build an `ExecutionContext` by hand, and so the failure modes are consistent:
 * every node that receives bad config fails the same way, with the node id and the
 * offending field named.
 */

/**
 * Validates config against a definition's schema and runs it.
 *
 * The single place config crosses from `unknown` into a node's typed config, which
 * is why the registry's type erasure is safe: nothing reaches `execute` without
 * passing that node's own schema first.
 */
export const executeNode = async (
  definition: AnyNodeDefinition,
  context: Omit<ExecutionContext, 'config'> & { readonly config: unknown },
): Promise<NodeResult> => {
  const parsed = definition.configSchema.safeParse(context.config);

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => {
        const path = issue.path.join('.');
        return path === '' ? issue.message : `${path}: ${issue.message}`;
      })
      .join('; ');

    throw new NodeExecutionError(
      context.nodeId,
      definition.type,
      `invalid configuration - ${detail}`,
      { retryable: false },
    );
  }

  return definition.execute({ ...context, config: parsed.data } as ExecutionContext<never>);
};

/**
 * An in-memory variable store.
 *
 * Used by the engine for a run, and by tests. Values are cloned on snapshot so a
 * debugger holding a snapshot cannot mutate the live run.
 */
export const createVariableStore = (initial: Readonly<JsonObject> = {}): VariableStore => {
  const values = new Map<string, JsonValue>(Object.entries(initial));

  return {
    get: (name) => values.get(name),
    set: (name, value) => {
      values.set(name, value);
    },
    has: (name) => values.has(name),
    snapshot: () => structuredClone(Object.fromEntries(values)) as JsonObject,
  };
};

/** A tool invoker that refuses every call, for workflows run with no device. */
export const unavailableToolInvoker: ToolInvoker = {
  isAvailable: false,
  invoke: (tool) =>
    Promise.reject(
      new Error(
        `Cannot run "${tool}": no device is attached. ` +
          'Connect a device, or run only the nodes that do not need one.',
      ),
    ),
};

/**
 * A tool invoker backed by a plain map, for tests.
 *
 * Records every call so a test can assert what a node asked the device to do -
 * which is usually the only observable behaviour a device node has.
 */
export const createRecordingToolInvoker = (
  handlers: Readonly<Record<string, (args: Record<string, unknown>) => unknown>> = {},
): ToolInvoker & { readonly calls: { tool: string; args: Record<string, unknown> }[] } => {
  const calls: { tool: string; args: Record<string, unknown> }[] = [];

  return {
    calls,
    isAvailable: true,
    invoke: async (tool, args) => {
      calls.push({ tool, args: { ...args } });

      const handler = handlers[tool];
      if (handler === undefined) {
        throw new Error(`No fake handler registered for tool "${tool}"`);
      }

      return handler({ ...args });
    },
  };
};

/** Options for {@link createTestContext}. */
export type TestContextOptions = {
  readonly nodeId?: string;
  readonly config?: unknown;
  readonly inputs?: JsonObject;
  readonly variables?: VariableStore;
  readonly tools?: ToolInvoker;
  readonly signal?: AbortSignal;
  readonly attempt?: number;
  readonly onLog?: (message: string) => void;
};

/**
 * Builds an `ExecutionContext` for a unit test.
 *
 * Every field defaulted, so a test states only what it cares about. Without this,
 * each node test would carry a dozen lines of irrelevant setup and the actual
 * assertion would be hard to find.
 */
export const createTestContext = <TConfig>(
  options: TestContextOptions & { readonly config: TConfig },
): ExecutionContext<TConfig> => ({
  nodeId: options.nodeId ?? 'test_node',
  config: options.config,
  inputs: options.inputs ?? {},
  variables: options.variables ?? createVariableStore(),
  tools: options.tools ?? unavailableToolInvoker,
  signal: options.signal ?? new AbortController().signal,
  log: options.onLog ?? (() => {}),
  attempt: options.attempt ?? 0,
});

/**
 * Defines a node with its config type inferred from its schema.
 *
 * Sugar, but the useful kind: it stops a node author having to write the config
 * type twice and keeps `execute`'s parameter tied to `configSchema`, so a schema
 * change surfaces as a type error inside the node rather than at a call site.
 */
export const defineNode = <TConfig>(definition: NodeDefinition<TConfig>): NodeDefinition<TConfig> =>
  definition;
