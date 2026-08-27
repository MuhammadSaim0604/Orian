import { type JsonValue, NodeExecutionError, defineNode } from '@mobile-automation/node-sdk';
import { VariableNodeConfigSchema } from '@mobile-automation/workflow-schema';

import { resolveValue, stringify } from './values';

/**
 * The variable node: sets, increments, appends to, or clears a variable.
 *
 * Four operations rather than one `set` because the alternatives are worse. Without
 * `increment`, counting requires a transform node reading the variable, adding one,
 * and writing it back - three configured fields for something a user thinks of as
 * one action.
 */

export const NODE_TYPE = 'setVariable' as const;

export const variableNode = defineNode({
  type: NODE_TYPE,
  version: '1.0.0',
  kind: 'variable',
  display: {
    label: 'Set Variable',
    description: 'Stores a value for later nodes to use',
    icon: 'database',
    category: 'Data',
  },
  configSchema: VariableNodeConfigSchema,
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [{ handle: 'next', label: 'Next' }],
  execute: async (context) => {
    const { variableName, operation, value: source } = context.config;

    const current = context.variables.get(variableName);

    // Assigned in every branch below; `let` with no initialiser so the compiler
    // checks the switch is exhaustive rather than a default hiding a missed case.
    let next: JsonValue = null;

    switch (operation) {
      case 'set': {
        next = resolveValue(source!, context, NODE_TYPE);
        break;
      }

      case 'increment': {
        const by = resolveValue(source!, context, NODE_TYPE);
        const amount = typeof by === 'number' ? by : Number(stringify(by));

        if (!Number.isFinite(amount)) {
          throw new NodeExecutionError(
            context.nodeId,
            NODE_TYPE,
            `cannot increment by ${JSON.stringify(by)}: not a number`,
            { retryable: false },
          );
        }

        // An unset counter starts at zero rather than failing. "Increment a
        // variable I have not created yet" is what a user means by counting.
        const base = current === undefined || current === null ? 0 : Number(stringify(current));

        if (!Number.isFinite(base)) {
          throw new NodeExecutionError(
            context.nodeId,
            NODE_TYPE,
            `cannot increment "${variableName}": it holds ${JSON.stringify(current)}`,
            { retryable: false },
          );
        }

        next = base + amount;
        break;
      }

      case 'append': {
        const addition = resolveValue(source!, context, NODE_TYPE);

        if (Array.isArray(current)) {
          next = [...current, addition];
        } else if (current === undefined || current === null) {
          // Appending to nothing creates a list, which is what "collect these as I
          // go" means in a loop.
          next = [addition];
        } else if (typeof current === 'string') {
          next = current + stringify(addition);
        } else {
          throw new NodeExecutionError(
            context.nodeId,
            NODE_TYPE,
            `cannot append to "${variableName}": it holds ${typeof current}`,
            { retryable: false },
          );
        }
        break;
      }

      case 'clear': {
        // Null rather than deleting the key: a later condition may still ask about
        // this variable, and "cleared" is a more useful answer than "never existed".
        next = null;
        break;
      }
    }

    context.variables.set(variableName, next);
    context.log(`${variableName} = ${JSON.stringify(next)}`);

    return {
      outputs: { result: next },
      summary: `${operation} ${variableName}`,
    };
  },
});
