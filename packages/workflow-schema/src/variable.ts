import { z } from 'zod';

/**
 * Workflow variables: the values that carry state between nodes.
 *
 * Typed rather than free-form so the builder UI can render the right input
 * control, and so a workflow that expects a number does not silently receive the
 * string "12" from a text field.
 */

export const VARIABLE_TYPES = ['string', 'number', 'boolean', 'object', 'array'] as const;

export const VariableTypeSchema = z.enum(VARIABLE_TYPES);

export type VariableType = z.infer<typeof VariableTypeSchema>;

/**
 * A value a variable may hold.
 *
 * Recursive, because an object variable can nest. `z.lazy` is required for a
 * self-referential schema; the explicit annotation is what breaks the circular
 * type inference TypeScript would otherwise reject.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.record(JsonValueSchema),
    z.array(JsonValueSchema),
  ]),
);

/**
 * Variable name rules.
 *
 * Restricted to identifier characters because variables are referenced by
 * interpolation (`{{ contactName }}`), and allowing spaces or braces would make
 * a reference ambiguous to parse.
 */
export const VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const VariableSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(
      VARIABLE_NAME_PATTERN,
      'variable name must start with a letter or underscore and contain only letters, digits, and underscores',
    ),
  type: VariableTypeSchema,
  /**
   * Optional starting value. Checked against `type` below rather than typed
   * per-variant, because Zod cannot express "matches the sibling field".
   */
  defaultValue: JsonValueSchema.optional(),
  /** Shown in the builder UI, so a user knows what a variable is for. */
  description: z.string().optional(),
});

export type Variable = z.infer<typeof VariableSchema>;

/** Whether a runtime value matches a declared variable type. */
export const matchesVariableType = (value: JsonValue, type: VariableType): boolean => {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      // NaN is a number to `typeof` but never a useful variable value.
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
};

/**
 * A variable whose default actually matches its declared type.
 *
 * Separate from `VariableSchema` so the base shape stays reusable, but this is
 * the one a workflow uses: a number variable defaulting to "hello" would fail at
 * the first node that used it, far from the mistake.
 */
export const ValidatedVariableSchema = VariableSchema.refine(
  (variable) =>
    variable.defaultValue === undefined ||
    matchesVariableType(variable.defaultValue, variable.type),
  {
    message: 'defaultValue does not match the declared variable type',
    path: ['defaultValue'],
  },
);

/** The value a variable starts with when a run begins. */
export const initialValueOf = (variable: Variable): JsonValue => {
  if (variable.defaultValue !== undefined) return variable.defaultValue;

  // An unset variable is null rather than a type-appropriate zero. "" and 0 are
  // real values a workflow might branch on, so inventing one would hide the
  // difference between "empty" and "never set".
  return null;
};
