/**
 * `@mobile-automation/tool-sdk`
 *
 * The single source of truth for the device tool surface. Both the AI agent and the
 * MCP server register tools from these definitions, so a tool is described exactly
 * once (ADR 0008).
 *
 * The tool *names* are duplicated on purpose in Kotlin's `DeviceTool`, with a parity
 * test on each side restating the other's list. If they drift, the AI can name a tool
 * the runtime cannot call - so both sides change in one commit.
 */

export const PACKAGE_NAME = '@mobile-automation/tool-sdk' as const;

export { TOOL_NAMES, type ToolName, isToolName } from './names';

export {
  BoundsArgSchema,
  MEDIA_COMMANDS,
  PointArgSchema,
  SWIPE_DIRECTIONS,
  SelectorArgSchema,
  TOOL_ARGUMENT_SCHEMAS,
  VOLUME_DIRECTIONS,
  type SelectorArg,
  type ToolArgumentSchemas,
} from './arguments';

export {
  TOOL_DEFINITIONS,
  TOOL_IMPACTS,
  type ToolDefinition,
  type ToolImpact,
  allToolDefinitions,
  isRetryableTool,
  readOnlyTools,
  toolDefinition,
} from './definitions';

export {
  TOOL_CALL_REJECTIONS,
  type RawToolCall,
  type ToolCallRejection,
  type ToolCallRejectionReason,
  type ToolCallValidation,
  type ValidatedToolCall,
  toolCallJsonSchema,
  toolsForRequest,
  validateToolCall,
} from './validation';
