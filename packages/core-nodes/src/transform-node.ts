import { type JsonValue, NodeExecutionError, defineNode } from '@mobile-automation/node-sdk';
import { TransformNodeConfigSchema } from '@mobile-automation/workflow-schema';

import { interpolate, resolveValue, stringify } from './values';

/**
 * The transform node: reshapes a value without touching the device.
 *
 * Exists so a workflow does not need a code node for "the contact name has a
 * trailing space", which is the single most common reason a selector fails to match
 * something that is visibly on screen.
 */

export const NODE_TYPE = 'transform' as const;

export const transformNode = defineNode({
  type: NODE_TYPE,
  version: '1.0.0',
  kind: 'transform',
  display: {
    label: 'Transform',
    description: 'Trims, splits, formats, or parses a value',
    icon: 'wand',
    category: 'Data',
  },
  configSchema: TransformNodeConfigSchema,
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [{ handle: 'next', label: 'Next' }],
  execute: async (context) => {
    const { input, operation, separator, template, pattern, assignTo } = context.config;

    // The template operation reads from the variable store rather than a single
    // input, since a template's whole point is combining several values.
    const value = operation === 'template' ? null : resolveValue(input, context, NODE_TYPE);

    const fail = (message: string): never => {
      throw new NodeExecutionError(context.nodeId, NODE_TYPE, message, { retryable: false });
    };

    let result: JsonValue;

    switch (operation) {
      case 'trim':
        result = stringify(value).trim();
        break;

      case 'lowercase':
        result = stringify(value).toLowerCase();
        break;

      case 'uppercase':
        result = stringify(value).toUpperCase();
        break;

      case 'split':
        // Defaults to comma rather than whitespace: a workflow splitting a list the
        // user typed almost always means "a, b, c".
        result = stringify(value).split(separator ?? ',');
        break;

      case 'join': {
        if (!Array.isArray(value)) {
          fail(`join needs a list but received ${typeof value}`);
        }
        result = (value as JsonValue[]).map(stringify).join(separator ?? ', ');
        break;
      }

      case 'parseNumber': {
        const parsed = Number(stringify(value).trim());
        if (!Number.isFinite(parsed)) {
          fail(`cannot read ${JSON.stringify(value)} as a number`);
        }
        result = parsed;
        break;
      }

      case 'parseJson': {
        try {
          result = JSON.parse(stringify(value)) as JsonValue;
        } catch (error) {
          return fail(
            `cannot read the value as JSON: ${error instanceof Error ? error.message : 'invalid'}`,
          );
        }
        break;
      }

      case 'stringify':
        result = JSON.stringify(value);
        break;

      case 'template':
        result = interpolate(template!, context, NODE_TYPE);
        break;

      case 'extract': {
        const matches = new RegExp(pattern!).exec(stringify(value));

        // The first capture group when there is one, else the whole match. A user
        // writing a group means "this part", not "everything that matched".
        result = matches === null ? null : (matches[1] ?? matches[0]);
        break;
      }
    }

    context.variables.set(assignTo, result);
    context.log(`${assignTo} = ${JSON.stringify(result)}`);

    return {
      outputs: { result },
      summary: `${operation} -> ${assignTo}`,
    };
  },
});
