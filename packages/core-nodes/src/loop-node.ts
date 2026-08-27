import { type JsonValue, NodeExecutionError, defineNode } from '@mobile-automation/node-sdk';
import { LoopNodeConfigSchema } from '@mobile-automation/workflow-schema';

import { evaluateCondition } from './condition-node';
import { resolveValue } from './values';

/**
 * The loop node: repeats a section of the workflow.
 *
 * The loop keeps **no state of its own between calls**. Instead it reads its
 * iteration counter from the variable store and returns `repeat: true` to ask the
 * engine to come back. That matters because a loop node holding a private counter
 * would be wrong the moment a loop is re-entered by an outer loop, or the workflow
 * is paused and resumed - and both are things this product must support.
 *
 * Two output handles: `body` runs one iteration, `done` continues past the loop. The
 * engine follows whichever the node names, so the log shows each decision.
 */

export const NODE_TYPE = 'loop' as const;

/** Where a loop keeps its counter. Namespaced by node id so nested loops cannot collide. */
export const iterationVariableName = (nodeId: string): string => `__loop_${nodeId}_index`;

export const loopNode = defineNode({
  type: NODE_TYPE,
  version: '1.0.0',
  kind: 'loop',
  display: {
    label: 'Loop',
    description: 'Repeats the connected nodes a number of times or over a list',
    icon: 'repeat',
    category: 'Flow',
  },
  configSchema: LoopNodeConfigSchema,
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [
    { handle: 'body', label: 'Each iteration' },
    { handle: 'done', label: 'Done' },
  ],
  execute: async (context) => {
    const config = context.config;
    const counterName = iterationVariableName(context.nodeId);

    const raw = context.variables.get(counterName);
    const index = typeof raw === 'number' ? raw : 0;

    const finish = (reason: string) => {
      // Cleared so re-entering this loop from an outer loop starts fresh rather
      // than resuming where the previous pass ended.
      context.variables.set(counterName, 0);
      context.log(`loop finished: ${reason}`);
      return {
        branch: { handle: 'done' },
        outputs: { iterations: index },
        summary: `ran ${index} iteration${index === 1 ? '' : 's'}`,
      };
    };

    const continueLoop = (exposed: Record<string, JsonValue>) => {
      context.variables.set(counterName, index + 1);
      return {
        branch: { handle: 'body' },
        repeat: true,
        outputs: { index, ...exposed },
        summary: `iteration ${index + 1}`,
      };
    };

    switch (config.kind) {
      case 'count': {
        if (index >= config.iterations) return finish('reached the requested count');

        if (config.indexVariable !== undefined) {
          context.variables.set(config.indexVariable, index);
        }

        return continueLoop({});
      }

      case 'forEach': {
        const items = resolveValue(config.items, context, NODE_TYPE);

        if (!Array.isArray(items)) {
          throw new NodeExecutionError(
            context.nodeId,
            NODE_TYPE,
            `this loop needs a list but received ${items === null ? 'null' : typeof items}`,
            { retryable: false, detail: { received: typeof items } },
          );
        }

        const limit = Math.min(items.length, config.maxIterations ?? items.length);

        if (index >= limit) {
          return finish(
            limit < items.length
              ? `stopped at the ${limit}-iteration limit with ${items.length - limit} item(s) left`
              : 'reached the end of the list',
          );
        }

        context.variables.set(config.itemVariable, items[index] as JsonValue);
        if (config.indexVariable !== undefined) {
          context.variables.set(config.indexVariable, index);
        }

        return continueLoop({ item: items[index] as JsonValue });
      }

      case 'while': {
        // Checked before the condition: a workflow that taps forever is worse than
        // one that stops early, so the ceiling wins even if the condition still
        // holds.
        if (index >= config.maxIterations) {
          return finish(`hit the ${config.maxIterations}-iteration safety limit`);
        }

        const shouldContinue = await evaluateCondition(config.condition, context, NODE_TYPE);

        if (!shouldContinue) return finish('condition became false');

        return continueLoop({});
      }
    }
  },
});
