import {
  type ExecutionContext,
  type JsonValue,
  NodeExecutionError,
} from '@mobile-automation/node-sdk';
import { type ValueSource } from '@mobile-automation/workflow-schema';

/**
 * Resolving a {@link ValueSource} into an actual value.
 *
 * Shared by every core node, because they all face the same question: the config
 * says *where* a value comes from, and the node needs the value itself. Kept in one
 * place so a variable reference behaves identically whether it appears in a
 * condition, a loop, or a transform.
 */

/**
 * Reads the value a source points at.
 *
 * Throws rather than returning undefined for a missing variable. A workflow
 * comparing against an absent variable is a mistake in the workflow, and silently
 * treating it as undefined would make the condition quietly false - the user would
 * see a branch not taken with no indication why.
 */
export const resolveValue = (
  source: ValueSource,
  context: ExecutionContext<unknown>,
  nodeType: string,
): JsonValue => {
  switch (source.from) {
    case 'literal':
      return source.value;

    case 'variable': {
      if (!context.variables.has(source.name)) {
        throw new NodeExecutionError(
          context.nodeId,
          nodeType,
          `variable "${source.name}" has not been set`,
          { retryable: false, detail: { variable: source.name } },
        );
      }

      // `has` passed, so this cannot be undefined; null is a legitimate value.
      return context.variables.get(source.name) as JsonValue;
    }

    case 'nodeOutput': {
      // Upstream outputs arrive on this node's inputs, keyed by handle. The engine
      // is what wires them, so a node never reaches across the graph itself.
      const handle = source.handle ?? 'result';
      const value = context.inputs[handle];

      if (value === undefined) {
        throw new NodeExecutionError(
          context.nodeId,
          nodeType,
          `no value arrived on input "${handle}" from node "${source.nodeId}"`,
          { retryable: false, detail: { nodeId: source.nodeId, handle } },
        );
      }

      return value;
    }
  }
};

/**
 * Renders `{{ name }}` references in a string against the variable store.
 *
 * Interpolation is the right tool for a message body - "Hi {{ name }}, I'll be
 * late" - where the surrounding text is literal. It is the wrong tool for a whole
 * value, which is why {@link ValueSource} exists alongside it.
 */
export const interpolate = (
  template: string,
  context: ExecutionContext<unknown>,
  nodeType: string,
): string =>
  template.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (_match, name: string) => {
    if (!context.variables.has(name)) {
      throw new NodeExecutionError(
        context.nodeId,
        nodeType,
        `template refers to variable "${name}", which has not been set`,
        { retryable: false, detail: { variable: name } },
      );
    }

    return stringify(context.variables.get(name) as JsonValue);
  });

/**
 * Converts a value to a string for display, templates, and text input.
 *
 * Objects and arrays are JSON-encoded rather than rendered as "[object Object]",
 * which would be typed into someone's chat window verbatim.
 */
export const stringify = (value: JsonValue): string => {
  if (value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
};

/**
 * JavaScript truthiness, with two deliberate departures.
 *
 * An empty array and an empty object are falsy here. `[]` is truthy in JavaScript,
 * which surprises everyone: a "while there are items left" loop written against a
 * list would never terminate. Workflow authors are not necessarily JavaScript
 * programmers, so the intuitive reading wins.
 */
export const isTruthy = (value: JsonValue | undefined): boolean => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0 && !Number.isNaN(value);
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return Object.keys(value).length > 0;
};
