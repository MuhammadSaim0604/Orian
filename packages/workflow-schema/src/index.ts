/**
 * `@mobile-automation/workflow-schema`
 *
 * Zod schemas for the workflow JSON format. A workflow is plain data and must
 * stay independent of React Native so the same definition can execute anywhere
 * (`architecture/Data_Models.md`).
 *
 * Everything is validated at load time rather than trusted, because a workflow
 * may have been hand-edited, produced by a model, or written by an older version
 * of the app. Types are derived with `z.infer` so the schema is the single
 * definition of each shape.
 */

export const PACKAGE_NAME = '@mobile-automation/workflow-schema' as const;

export {
  BoundsSchema,
  PointSchema,
  SELECTOR_STRATEGIES,
  ScreenScopeSchema,
  SelectorSchema,
  SelectorStrategySchema,
  type Bounds,
  type Point,
  type ScreenScope,
  type Selector,
  type SelectorStrategy,
  availableStrategies,
  isFragileSelector,
  isFragileStrategy,
  strategyRank,
} from './selector';

export {
  JsonValueSchema,
  VARIABLE_NAME_PATTERN,
  VARIABLE_TYPES,
  ValidatedVariableSchema,
  VariableSchema,
  VariableTypeSchema,
  type JsonValue,
  type Variable,
  type VariableType,
  initialValueOf,
  matchesVariableType,
} from './variable';

export {
  ActionNodeConfigSchema,
  COMPARISON_OPERATORS,
  CORE_NODE_CONFIG_SCHEMAS,
  ComparisonOperatorSchema,
  ConditionNodeConfigSchema,
  ConditionSchema,
  InputNodeConfigSchema,
  LoopNodeConfigSchema,
  MAX_LOOP_ITERATIONS,
  TRANSFORM_OPERATIONS,
  TransformNodeConfigSchema,
  TransformOperationSchema,
  TriggerNodeConfigSchema,
  UNARY_OPERATORS,
  VARIABLE_OPERATIONS,
  ValueSourceSchema,
  VariableNodeConfigSchema,
  VariableOperationSchema,
  type ActionNodeConfig,
  type ComparisonOperator,
  type Condition,
  type ConditionNodeConfig,
  type CoreNodeKind,
  type InputNodeConfig,
  type LoopNodeConfig,
  type TransformNodeConfig,
  type TransformOperation,
  type TriggerNodeConfig,
  type ValueSource,
  type VariableNodeConfig,
  type VariableOperation,
  isUnaryOperator,
} from './node-config';

export {
  DEFAULT_EXECUTION_POLICY,
  ERROR_BEHAVIOURS,
  EdgeSchema,
  ErrorBehaviourSchema,
  ExecutionPolicySchema,
  INPUT_HANDLE_IN,
  MAX_NODE_TIMEOUT_MS,
  MAX_RETRY_ATTEMPTS,
  NODE_TYPE_PATTERN,
  NodeMetadataSchema,
  NodeTypeSchema,
  OUTPUT_HANDLE_BODY,
  OUTPUT_HANDLE_DONE,
  OUTPUT_HANDLE_FALSE,
  OUTPUT_HANDLE_NEXT,
  OUTPUT_HANDLE_TRUE,
  PortSpecSchema,
  PositionSchema,
  RESERVED_OUTPUT_HANDLES,
  SEMVER_PATTERN,
  SemverSchema,
  WORKFLOW_SCHEMA_VERSION,
  WorkflowMetadataSchema,
  WorkflowNodeSchema,
  WorkflowSchema,
  type Edge,
  type ErrorBehaviour,
  type ExecutionPolicy,
  type NodeMetadata,
  type PortSpec,
  type Position,
  type Workflow,
  type WorkflowMetadata,
  type WorkflowNode,
} from './workflow';

export {
  SchemaValidationError,
  formatPath,
  isSchemaValidationError,
  parseOrThrow,
  toValidationIssues,
  validate,
  type ValidationFailure,
  type ValidationIssue,
  type ValidationResult,
  type ValidationSuccess,
} from './validation';
