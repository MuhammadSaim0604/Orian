import { defineNode } from '@mobile-automation/node-sdk';
import { TriggerNodeConfigSchema } from '@mobile-automation/workflow-schema';

/**
 * The trigger node: where a workflow starts.
 *
 * Executing it is almost a no-op, and that is the point. Deciding *when* to start a
 * workflow is the scheduler's job, not a node's - a node that waited for its
 * schedule would hold the engine open for hours. By the time this executes,
 * something has already decided the workflow should run; the node records why, so
 * the execution log distinguishes a manual run from a scheduled one.
 */

export const NODE_TYPE = 'trigger' as const;

export const triggerNode = defineNode({
  type: NODE_TYPE,
  version: '1.0.0',
  kind: 'trigger',
  display: {
    label: 'Trigger',
    description: 'Starts the workflow, manually or on a schedule',
    icon: 'zap',
    category: 'Flow',
  },
  configSchema: TriggerNodeConfigSchema,
  inputs: [],
  outputs: [{ handle: 'next', label: 'Next' }],
  execute: async (context) => {
    const config = context.config;

    const description =
      config.kind === 'manual'
        ? 'started manually'
        : config.kind === 'schedule'
          ? `started on schedule at ${String(config.hour).padStart(2, '0')}:${String(
              config.minute,
            ).padStart(2, '0')}`
          : `started because ${config.packageName} was launched`;

    context.log(description);

    return {
      outputs: { startedAtEpochMs: Date.now(), triggerKind: config.kind },
      summary: description,
    };
  },
});
