import { NodeExecutionError, defineNode } from '@mobile-automation/node-sdk';
import { InputNodeConfigSchema, matchesVariableType } from '@mobile-automation/workflow-schema';

/**
 * The input node: where a value the workflow cannot know comes from.
 *
 * "Message whom?" is answered once, before the run starts, rather than hardcoded
 * into a selector. The engine collects answers up front and seeds the variable
 * store with them, so by the time this node executes the value is already present -
 * this node's job is to validate it, not to prompt.
 *
 * Prompting during a run would mean a workflow could stall halfway through with a
 * dialog while sitting behind another app, which is unusable.
 */

export const NODE_TYPE = 'input' as const;

export const inputNode = defineNode({
  type: NODE_TYPE,
  version: '1.0.0',
  kind: 'input',
  display: {
    label: 'Input',
    description: 'Asks the user for a value before the workflow runs',
    icon: 'keyboard',
    category: 'Data',
  },
  configSchema: InputNodeConfigSchema,
  inputs: [],
  outputs: [{ handle: 'next', label: 'Next' }],
  execute: async (context) => {
    const { variableName, valueType, required, defaultValue } = context.config;

    const supplied = context.variables.has(variableName)
      ? context.variables.get(variableName)
      : undefined;

    const value = supplied ?? defaultValue ?? null;

    if (required && (value === null || value === '')) {
      throw new NodeExecutionError(
        context.nodeId,
        NODE_TYPE,
        `"${variableName}" is required but no value was supplied`,
        {
          retryable: false,
          // The user can fix this by running the workflow again and answering, so
          // the UI should prompt rather than merely report a failure.
          needsUserAction: true,
          detail: { variableName, prompt: context.config.prompt },
        },
      );
    }

    if (value !== null && !matchesVariableType(value, valueType)) {
      throw new NodeExecutionError(
        context.nodeId,
        NODE_TYPE,
        `"${variableName}" should be a ${valueType} but received ${typeof value}`,
        { retryable: false, detail: { variableName, expected: valueType } },
      );
    }

    context.variables.set(variableName, value);
    context.log(`${variableName} = ${JSON.stringify(value)}`);

    return {
      outputs: { result: value },
      summary: `${variableName} set from user input`,
    };
  },
});
