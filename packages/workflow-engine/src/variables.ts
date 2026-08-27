import { type JsonObject, type JsonValue, type VariableStore } from '@mobile-automation/node-sdk';
import {
  type Variable,
  initialValueOf,
  matchesVariableType,
} from '@mobile-automation/workflow-schema';

import { type ExecutionEventBus } from './events';

/**
 * The run's variable store.
 *
 * Wraps a plain map with two things the engine needs and a node should not have to
 * think about: writes are checked against the type the workflow declared, and every
 * change is announced so the debugger can show variables updating live.
 *
 * Type checking on write is what turns "the workflow did something strange twenty
 * steps later" into "this node wrote a string into a number variable".
 */
export class RunVariableStore implements VariableStore {
  private readonly values = new Map<string, JsonValue>();
  private readonly declared = new Map<string, Variable>();
  private currentNodeId = '';

  constructor(
    declarations: readonly Variable[],
    private readonly events?: ExecutionEventBus,
    private readonly executionId = '',
  ) {
    for (const variable of declarations) {
      this.declared.set(variable.name, variable);
      this.values.set(variable.name, initialValueOf(variable));
    }
  }

  /**
   * Names the node about to run, so a variable change can be attributed.
   *
   * Set by the executor rather than passed to `set`, because `VariableStore` is the
   * interface nodes see and threading a node id through every write would put engine
   * bookkeeping into the node API.
   */
  enterNode(nodeId: string): void {
    this.currentNodeId = nodeId;
  }

  get(name: string): JsonValue | undefined {
    return this.values.get(name);
  }

  has(name: string): boolean {
    return this.values.has(name);
  }

  set(name: string, value: JsonValue): void {
    const declaration = this.declared.get(name);

    if (
      declaration !== undefined &&
      value !== null &&
      !matchesVariableType(value, declaration.type)
    ) {
      throw new TypeError(
        `variable "${name}" is declared as ${declaration.type} but received ${describe(value)}`,
      );
    }

    this.values.set(name, value);

    this.events?.emit({
      type: 'variableChanged',
      executionId: this.executionId,
      timestampEpochMs: Date.now(),
      nodeId: this.currentNodeId,
      name,
      value,
    });
  }

  /**
   * Seeds values collected before the run, such as answers to Input nodes.
   *
   * Bypasses change events on purpose: these are not something a node did, and
   * showing them in the log as changes would be misleading.
   */
  seed(values: Readonly<JsonObject>): void {
    for (const [name, value] of Object.entries(values)) {
      const declaration = this.declared.get(name);

      if (
        declaration !== undefined &&
        value !== null &&
        !matchesVariableType(value, declaration.type)
      ) {
        throw new TypeError(
          `supplied value for "${name}" is not a ${declaration.type} (received ${describe(value)})`,
        );
      }

      this.values.set(name, value);
    }
  }

  /** Cloned so a debugger holding a snapshot cannot mutate a running workflow. */
  snapshot(): JsonObject {
    return structuredClone(Object.fromEntries(this.values)) as JsonObject;
  }

  /**
   * Variables the workflow declared, excluding the engine's own bookkeeping.
   *
   * Loop counters are stored as `__loop_<id>_index` so they survive re-entry, but
   * they are an implementation detail and showing them in the debugger would be
   * noise.
   */
  publicSnapshot(): JsonObject {
    const visible: JsonObject = {};

    for (const [name, value] of this.values) {
      if (name.startsWith('__')) continue;
      visible[name] = value;
    }

    return structuredClone(visible);
  }
}

const describe = (value: JsonValue): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  if (typeof value === 'object') return 'an object';
  return `a ${typeof value}`;
};
