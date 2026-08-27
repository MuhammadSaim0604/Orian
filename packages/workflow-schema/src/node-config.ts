import { z } from 'zod';

import { SelectorSchema } from './selector';
import { JsonValueSchema, VariableTypeSchema } from './variable';

/**
 * Configuration schemas for the seven generic node kinds.
 *
 * Each kind validates its own config shape, so a malformed workflow is rejected
 * at load time naming the node and field at fault rather than failing mid-run
 * (`conventions/Coding_Conventions.md`).
 *
 * Device node configs are **not** here - they are contributed by `android-nodes`
 * and merged into the registry, keeping this package device-agnostic (ADR 0008).
 */

// --- shared primitives --------------------------------------------------

/**
 * A value a node config may hold: a literal, or a reference to something
 * resolved at run time.
 *
 * Two forms rather than one string with magic syntax. `{{ name }}` inside a
 * string is convenient for a user typing a message, but a config that needs the
 * *whole* value to be a variable cannot express that by interpolation without
 * losing its type - `{{ count }}` would arrive as a string.
 */
export const ValueSourceSchema = z.discriminatedUnion('from', [
  z.object({ from: z.literal('literal'), value: JsonValueSchema }),
  z.object({ from: z.literal('variable'), name: z.string().min(1) }),
  z.object({
    from: z.literal('nodeOutput'),
    nodeId: z.string().min(1),
    /** Output handle to read, defaulting to the node's primary output. */
    handle: z.string().min(1).optional(),
  }),
]);

export type ValueSource = z.infer<typeof ValueSourceSchema>;

// --- input --------------------------------------------------------------

/**
 * Asks the user for a value before the run starts.
 *
 * The entry point for a workflow that is not fully predetermined - "message whom?"
 * is answered once, at the start, rather than being hardcoded.
 */
export const InputNodeConfigSchema = z.object({
  variableName: z.string().min(1),
  valueType: VariableTypeSchema,
  prompt: z.string().min(1),
  required: z.boolean().default(true),
  defaultValue: JsonValueSchema.optional(),
});

export type InputNodeConfig = z.infer<typeof InputNodeConfigSchema>;

// --- action -------------------------------------------------------------

/**
 * Runs a registered tool.
 *
 * The generic escape hatch: `tool` names a device tool and `arguments` are
 * validated by that tool's own schema at execution time, which is what lets
 * third-party node packages add capabilities without changing this file.
 */
export const ActionNodeConfigSchema = z.object({
  tool: z.string().min(1),
  arguments: z.record(ValueSourceSchema).default({}),
  /** Where to store the tool's result, if anywhere. */
  assignTo: z.string().min(1).optional(),
});

export type ActionNodeConfig = z.infer<typeof ActionNodeConfigSchema>;

// --- condition ----------------------------------------------------------

export const COMPARISON_OPERATORS = [
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'greaterThan',
  'lessThan',
  'isEmpty',
  'isNotEmpty',
] as const;

export const ComparisonOperatorSchema = z.enum(COMPARISON_OPERATORS);

export type ComparisonOperator = z.infer<typeof ComparisonOperatorSchema>;

/** Operators that need no right-hand side. */
export const UNARY_OPERATORS: readonly ComparisonOperator[] = ['isEmpty', 'isNotEmpty'];

export const isUnaryOperator = (operator: ComparisonOperator): boolean =>
  UNARY_OPERATORS.includes(operator);

/**
 * What a condition tests.
 *
 * Three kinds because they answer genuinely different questions: is something on
 * screen, does a value compare a certain way, and is the user in a particular
 * app. The example in `Data_Models.md` is the `element_exists` form.
 */
export const ConditionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('element_exists'),
    selector: SelectorSchema,
    /** Wait this long for it to appear before deciding it is absent. */
    timeoutMs: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal('comparison'),
    left: ValueSourceSchema,
    operator: ComparisonOperatorSchema,
    right: ValueSourceSchema.optional(),
  }),
  z.object({
    type: z.literal('current_app'),
    packageName: z.string().min(1),
  }),
]);

export type Condition = z.infer<typeof ConditionSchema>;

export const ConditionNodeConfigSchema = z
  .object({
    condition: ConditionSchema,
    /** Invert the result, so a user need not restate a condition backwards. */
    negate: z.boolean().default(false),
  })
  .refine(
    (config) =>
      config.condition.type !== 'comparison' ||
      isUnaryOperator(config.condition.operator) ||
      config.condition.right !== undefined,
    {
      // Without this, `count greaterThan <nothing>` would load happily and then
      // compare against undefined at run time.
      message: 'this comparison operator needs a right-hand value',
      path: ['condition', 'right'],
    },
  );

export type ConditionNodeConfig = z.infer<typeof ConditionNodeConfigSchema>;

// --- loop ---------------------------------------------------------------

/**
 * Hard ceiling on iterations, applied to every loop kind.
 *
 * A workflow drives someone's phone. A `while` loop whose condition never
 * becomes false would tap forever, so an unbounded loop is not offered at all.
 */
export const MAX_LOOP_ITERATIONS = 1_000;

export const LoopNodeConfigSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('count'),
    iterations: z.number().int().positive().max(MAX_LOOP_ITERATIONS),
    /** Variable receiving the zero-based index, if the body needs it. */
    indexVariable: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal('forEach'),
    items: ValueSourceSchema,
    itemVariable: z.string().min(1),
    indexVariable: z.string().min(1).optional(),
    maxIterations: z.number().int().positive().max(MAX_LOOP_ITERATIONS).optional(),
  }),
  z.object({
    kind: z.literal('while'),
    condition: ConditionSchema,
    /** Required, not optional: an unbounded while loop is never acceptable here. */
    maxIterations: z.number().int().positive().max(MAX_LOOP_ITERATIONS),
  }),
]);

export type LoopNodeConfig = z.infer<typeof LoopNodeConfigSchema>;

// --- variable -----------------------------------------------------------

export const VARIABLE_OPERATIONS = ['set', 'increment', 'append', 'clear'] as const;

export const VariableOperationSchema = z.enum(VARIABLE_OPERATIONS);

export type VariableOperation = z.infer<typeof VariableOperationSchema>;

export const VariableNodeConfigSchema = z
  .object({
    variableName: z.string().min(1),
    operation: VariableOperationSchema.default('set'),
    value: ValueSourceSchema.optional(),
  })
  .refine((config) => config.operation === 'clear' || config.value !== undefined, {
    message: 'this operation needs a value',
    path: ['value'],
  });

export type VariableNodeConfig = z.infer<typeof VariableNodeConfigSchema>;

// --- transform ----------------------------------------------------------

export const TRANSFORM_OPERATIONS = [
  'trim',
  'lowercase',
  'uppercase',
  'split',
  'join',
  'parseNumber',
  'parseJson',
  'stringify',
  'template',
  'extract',
] as const;

export const TransformOperationSchema = z.enum(TRANSFORM_OPERATIONS);

export type TransformOperation = z.infer<typeof TransformOperationSchema>;

/**
 * Reshapes a value without touching the device.
 *
 * Exists so a workflow does not need a code node for "the contact name has a
 * trailing space" - the most common reason a selector fails to match.
 */
export const TransformNodeConfigSchema = z
  .object({
    input: ValueSourceSchema,
    operation: TransformOperationSchema,
    /** Separator for `split`/`join`. */
    separator: z.string().optional(),
    /** Template for `template`, e.g. `Hi {{ name }}`. */
    template: z.string().optional(),
    /** Pattern for `extract`. Validated as a real regex below. */
    pattern: z.string().optional(),
    assignTo: z.string().min(1),
  })
  .refine((config) => config.operation !== 'template' || config.template !== undefined, {
    message: 'the template operation needs a template string',
    path: ['template'],
  })
  .refine((config) => config.operation !== 'extract' || config.pattern !== undefined, {
    message: 'the extract operation needs a pattern',
    path: ['pattern'],
  })
  .refine(
    (config) => {
      if (config.pattern === undefined) return true;
      // Compiled here so an invalid pattern is a load-time error naming the
      // field, not a thrown SyntaxError halfway through a run.
      try {
        new RegExp(config.pattern);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'pattern is not a valid regular expression', path: ['pattern'] },
  );

export type TransformNodeConfig = z.infer<typeof TransformNodeConfigSchema>;

// --- trigger ------------------------------------------------------------

export const TriggerNodeConfigSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('manual') }),
  z.object({
    kind: z.literal('schedule'),
    /** 24-hour local time. */
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
    /** ISO days: 1 = Monday through 7 = Sunday. Empty means every day. */
    daysOfWeek: z.array(z.number().int().min(1).max(7)).default([]),
  }),
  z.object({
    kind: z.literal('appLaunch'),
    packageName: z.string().min(1),
  }),
]);

export type TriggerNodeConfig = z.infer<typeof TriggerNodeConfigSchema>;

// --- registry of built-in config schemas --------------------------------

/**
 * Config schema per generic node kind.
 *
 * The engine looks a node's kind up here when no registered definition supplies
 * a schema, so a core node cannot be executed with a config nobody validated.
 */
export const CORE_NODE_CONFIG_SCHEMAS = {
  input: InputNodeConfigSchema,
  action: ActionNodeConfigSchema,
  condition: ConditionNodeConfigSchema,
  loop: LoopNodeConfigSchema,
  variable: VariableNodeConfigSchema,
  transform: TransformNodeConfigSchema,
  trigger: TriggerNodeConfigSchema,
} as const;

export type CoreNodeKind = keyof typeof CORE_NODE_CONFIG_SCHEMAS;
