import {
  type ExecutionContext,
  type JsonValue,
  NodeExecutionError,
  type NodeResult,
} from '@mobile-automation/node-sdk';
import { type ToolName } from '@mobile-automation/tool-sdk';

/**
 * Shared plumbing for every Android node.
 *
 * Each node is a thin wrapper around one tool call, so the interesting behaviour is
 * all in the parts they have in common: refusing to run with no device, turning a
 * bridge rejection into a node failure the engine can act on, and storing the result
 * where the workflow asked. Duplicating that seventeen times would guarantee it
 * drifts.
 */

/** Config fields every device node accepts. */
export type DeviceNodeConfigBase = {
  /** Variable to receive the tool's result, if the workflow wants it. */
  readonly assignTo?: string;
};

/**
 * Runs a tool and packages the outcome as a node result.
 *
 * The single place a device node's failure is shaped, which is what lets the engine
 * apply retry policy consistently: a bridge error becomes a `NodeExecutionError`
 * carrying the tool name and the arguments, and the retry and user-action flags are
 * taken from the bridge's own classification rather than guessed.
 */
export const invokeTool = async (
  context: ExecutionContext<DeviceNodeConfigBase>,
  nodeType: string,
  tool: ToolName,
  args: Record<string, unknown>,
  summary: string,
): Promise<NodeResult> => {
  if (!context.tools.isAvailable) {
    throw new NodeExecutionError(
      context.nodeId,
      nodeType,
      `cannot run "${tool}": no device is attached`,
      { retryable: false, needsUserAction: true, detail: { tool } },
    );
  }

  context.log(summary);

  let result: unknown;
  try {
    result = await context.tools.invoke(tool, args);
  } catch (error) {
    throw asNodeFailure(error, context.nodeId, nodeType, tool, args);
  }

  const value = (result ?? null) as JsonValue;

  if (context.config.assignTo !== undefined) {
    context.variables.set(context.config.assignTo, value);
  }

  return { outputs: { result: value }, summary };
};

/**
 * Translates a bridge rejection into a node failure.
 *
 * The bridge already knows whether a failure is worth retrying and whether the user
 * can fix it - `element_not_found` usually means a screen still loading, while
 * `permission_denied` needs a grant. Re-deriving that here from the message text
 * would be guesswork, so the flags are read off the error when present.
 */
const asNodeFailure = (
  error: unknown,
  nodeId: string,
  nodeType: string,
  tool: string,
  args: Record<string, unknown>,
): NodeExecutionError => {
  const bridgeError = error as {
    message?: unknown;
    code?: unknown;
    isRetryable?: unknown;
    needsUserAction?: unknown;
    detail?: unknown;
  };

  const message =
    typeof bridgeError?.message === 'string' && bridgeError.message.length > 0
      ? bridgeError.message
      : `tool "${tool}" failed`;

  return new NodeExecutionError(nodeId, nodeType, message, {
    retryable: typeof bridgeError?.isRetryable === 'boolean' ? bridgeError.isRetryable : true,
    needsUserAction:
      typeof bridgeError?.needsUserAction === 'boolean' ? bridgeError.needsUserAction : false,
    cause: error,
    detail: {
      tool,
      args,
      ...(typeof bridgeError?.code === 'string' ? { code: bridgeError.code } : {}),
    },
  });
};

/** Category every device node appears under in the builder's palette. */
export const DEVICE_CATEGORY = 'Device' as const;

/** Category for nodes that read or write device data rather than driving the screen. */
export const DATA_CATEGORY = 'Device data' as const;
