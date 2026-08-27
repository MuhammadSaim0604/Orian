import { NodeExecutionError, defineNode } from '@mobile-automation/node-sdk';
import { ActionNodeConfigSchema, type ValueSource } from '@mobile-automation/workflow-schema';

import { resolveValue } from './values';

/**
 * The action node: runs a tool by name.
 *
 * The generic escape hatch, and the reason a third-party package can add a
 * capability without the engine changing. It is deliberately dumb: it resolves
 * argument sources, invokes the tool, and stores the result. Knowledge of what a
 * particular tool means belongs in a purpose-built node from `android-nodes`, which
 * can validate its arguments properly.
 */

export const NODE_TYPE = 'action' as const;

export const actionNode = defineNode({
  type: NODE_TYPE,
  version: '1.0.0',
  kind: 'action',
  display: {
    label: 'Run Tool',
    description: 'Calls a device tool by name with the arguments you supply',
    icon: 'play',
    category: 'Advanced',
  },
  configSchema: ActionNodeConfigSchema,
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [{ handle: 'next', label: 'Next' }],
  requiresDevice: true,
  execute: async (context) => {
    const { tool, arguments: argumentSources, assignTo } = context.config;

    if (!context.tools.isAvailable) {
      throw new NodeExecutionError(
        context.nodeId,
        NODE_TYPE,
        `cannot run "${tool}": no device is attached`,
        { retryable: false, needsUserAction: true, detail: { tool } },
      );
    }

    const args: Record<string, unknown> = {};
    const sources = argumentSources as Record<string, ValueSource>;
    for (const name of Object.keys(sources)) {
      args[name] = resolveValue(sources[name]!, context, NODE_TYPE);
    }

    context.log(`running ${tool}`);

    let result: unknown;
    try {
      result = await context.tools.invoke(tool, args);
    } catch (error) {
      // Rethrown as a node failure carrying the tool name, so the engine can apply
      // this node's retry policy and the log names what actually failed.
      throw new NodeExecutionError(
        context.nodeId,
        NODE_TYPE,
        error instanceof Error ? error.message : `tool "${tool}" failed`,
        { cause: error, detail: { tool, args } },
      );
    }

    if (assignTo !== undefined) {
      context.variables.set(assignTo, (result ?? null) as never);
    }

    return {
      outputs: { result: (result ?? null) as never },
      summary: `ran ${tool}`,
    };
  },
});
