import { type AnyNodeDefinition, type NodeDefinition, asAnyDefinition } from './definition';

/**
 * The node registry: what maps a workflow's `type` string to something runnable.
 *
 * Registration is explicit rather than magic. A workflow referencing a node type
 * nobody registered must fail at load time with the type name, not at the moment
 * that node would have run - by then the workflow has already touched the device
 * and half-completed a task.
 */

/** Why a registration was refused. */
export type RegistrationError = {
  readonly type: string;
  readonly reason: string;
};

export class NodeRegistrationError extends Error {
  readonly failures: readonly RegistrationError[];

  constructor(failures: readonly RegistrationError[]) {
    super(
      `Could not register ${failures.length} node type(s): ` +
        failures.map((failure) => `${failure.type} (${failure.reason})`).join('; '),
    );
    this.name = 'NodeRegistrationError';
    this.failures = failures;
    Object.setPrototypeOf(this, NodeRegistrationError.prototype);
  }
}

export class UnknownNodeTypeError extends Error {
  readonly nodeType: string;

  constructor(nodeType: string, known: readonly string[]) {
    // Listing what *is* available turns "unknown node type" from a dead end into
    // a typo the user can spot, and reveals when a package failed to load.
    const suggestion =
      known.length === 0
        ? 'no node types are registered'
        : `registered types: ${[...known].sort().join(', ')}`;

    super(`Unknown node type "${nodeType}". ${suggestion}`);
    this.name = 'UnknownNodeTypeError';
    this.nodeType = nodeType;
    Object.setPrototypeOf(this, UnknownNodeTypeError.prototype);
  }
}

/**
 * Holds the node definitions available to the engine.
 *
 * Mutable by design: packages register into it at startup, and third-party
 * packages may be installed while the app is running.
 */
export class NodeRegistry {
  private readonly definitions = new Map<string, AnyNodeDefinition>();

  /**
   * Registers one definition.
   *
   * Refuses a duplicate type rather than overwriting. Silent replacement would
   * mean the behaviour of a workflow depends on package load order, which is
   * exactly the sort of bug that only appears on someone else's device.
   */
  register<TConfig>(definition: NodeDefinition<TConfig>): void {
    const failure = this.validate(definition);
    if (failure !== null) throw new NodeRegistrationError([failure]);

    this.definitions.set(definition.type, asAnyDefinition(definition));
  }

  /**
   * Registers many definitions, reporting every problem at once.
   *
   * A package that contributes twenty nodes with three mistakes should surface all
   * three, not force three install-fix-retry cycles. Nothing is registered unless
   * every definition is valid, so a partially-loaded package cannot leave the
   * registry in a state where some workflows work and others mysteriously do not.
   */
  registerAll(definitions: readonly AnyNodeDefinition[]): void {
    const failures: RegistrationError[] = [];
    const seen = new Set<string>();

    for (const definition of definitions) {
      const failure = this.validate(definition);
      if (failure !== null) {
        failures.push(failure);
        continue;
      }

      // Duplicates within the same batch would otherwise slip past, since nothing
      // is in the map yet.
      if (seen.has(definition.type)) {
        failures.push({
          type: definition.type,
          reason: 'declared more than once in the same package',
        });
        continue;
      }

      seen.add(definition.type);
    }

    if (failures.length > 0) throw new NodeRegistrationError(failures);

    for (const definition of definitions) {
      this.definitions.set(definition.type, definition);
    }
  }

  /** The definition for a type, or undefined when it is not registered. */
  find(type: string): AnyNodeDefinition | undefined {
    return this.definitions.get(type);
  }

  /**
   * The definition for a type, throwing when absent.
   *
   * Used by the engine while loading a graph, so an unresolvable node stops the
   * run before it starts.
   */
  require(type: string): AnyNodeDefinition {
    const definition = this.definitions.get(type);
    if (definition === undefined) {
      throw new UnknownNodeTypeError(type, this.types());
    }
    return definition;
  }

  has(type: string): boolean {
    return this.definitions.has(type);
  }

  types(): string[] {
    return [...this.definitions.keys()];
  }

  /** Every definition, for the builder UI's node palette. */
  all(): AnyNodeDefinition[] {
    return [...this.definitions.values()];
  }

  /** Definitions grouped for display, since a flat list of 30 nodes is unusable. */
  byCategory(): Map<string, AnyNodeDefinition[]> {
    const grouped = new Map<string, AnyNodeDefinition[]>();

    for (const definition of this.definitions.values()) {
      const category = definition.display.category;
      const existing = grouped.get(category);
      if (existing === undefined) {
        grouped.set(category, [definition]);
      } else {
        existing.push(definition);
      }
    }

    return grouped;
  }

  /** Node types that need a device, so a workflow can be checked before it runs. */
  deviceDependentTypes(): string[] {
    return this.all()
      .filter((definition) => definition.requiresDevice === true)
      .map((definition) => definition.type);
  }

  get size(): number {
    return this.definitions.size;
  }

  /** Drops every registration. Test seam; not used in the app. */
  clear(): void {
    this.definitions.clear();
  }

  /**
   * Checks a definition is usable, returning the first problem found.
   *
   * Deliberately strict. A definition missing `execute` or a config schema fails
   * far from its cause otherwise - a `TypeError: not a function` in the middle of
   * a run tells the user nothing about which package is at fault.
   */
  private validate(definition: AnyNodeDefinition): RegistrationError | null {
    const type = definition.type ?? '(missing type)';

    if (typeof definition.type !== 'string' || definition.type.trim() === '') {
      return { type, reason: 'type must be a non-empty string' };
    }

    if (this.definitions.has(definition.type)) {
      return { type, reason: 'already registered by another package' };
    }

    if (typeof definition.version !== 'string' || definition.version.trim() === '') {
      return { type, reason: 'version must be a non-empty string' };
    }

    if (typeof definition.execute !== 'function') {
      return { type, reason: 'execute must be a function' };
    }

    if (
      definition.configSchema == null ||
      typeof definition.configSchema.safeParse !== 'function'
    ) {
      return { type, reason: 'configSchema must be a Zod schema' };
    }

    if (definition.display == null || typeof definition.display.label !== 'string') {
      return { type, reason: 'display.label is required' };
    }

    const duplicateOutput = findDuplicateHandle(definition.outputs);
    if (duplicateOutput !== null) {
      return { type, reason: `duplicate output handle "${duplicateOutput}"` };
    }

    const duplicateInput = findDuplicateHandle(definition.inputs);
    if (duplicateInput !== null) {
      return { type, reason: `duplicate input handle "${duplicateInput}"` };
    }

    return null;
  }
}

const findDuplicateHandle = (
  ports: readonly { readonly handle: string }[] | undefined,
): string | null => {
  if (ports === undefined) return null;

  const seen = new Set<string>();
  for (const port of ports) {
    if (seen.has(port.handle)) return port.handle;
    seen.add(port.handle);
  }

  return null;
};

export const isNodeRegistrationError = (value: unknown): value is NodeRegistrationError =>
  value instanceof NodeRegistrationError;

export const isUnknownNodeTypeError = (value: unknown): value is UnknownNodeTypeError =>
  value instanceof UnknownNodeTypeError;
