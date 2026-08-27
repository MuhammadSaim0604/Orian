import { type z } from 'zod';

/**
 * Turning Zod failures into messages a person can act on.
 *
 * `conventions/Coding_Conventions.md` requires errors that name the node, tool, or
 * field at fault. A raw `ZodError` carries that information but buries it in a
 * nested structure, and a workflow may have been hand-edited, model-generated, or
 * written by an older version of the app - so the message is often the only clue
 * the user gets.
 */

/** One thing wrong with a document, located and explained. */
export type ValidationIssue = {
  /** Dotted path, e.g. `nodes.2.config.selector`. Empty for a root-level problem. */
  readonly path: string;
  readonly message: string;
};

export type ValidationFailure = {
  readonly ok: false;
  readonly issues: readonly ValidationIssue[];
  /** Every issue on one line, for logs and error messages. */
  readonly summary: string;
};

export type ValidationSuccess<T> = {
  readonly ok: true;
  readonly value: T;
};

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

/** Formats a Zod path as dotted notation, with array indices inline. */
export const formatPath = (path: readonly (string | number)[]): string =>
  path.reduce<string>((formatted, segment) => {
    if (typeof segment === 'number') return `${formatted}[${segment}]`;
    return formatted === '' ? segment : `${formatted}.${segment}`;
  }, '');

export const toValidationIssues = (error: z.ZodError): ValidationIssue[] =>
  error.issues.map((issue) => ({
    path: formatPath(issue.path),
    message: issue.message,
  }));

const summarise = (issues: readonly ValidationIssue[]): string =>
  issues
    .map((issue) => (issue.path === '' ? issue.message : `${issue.path}: ${issue.message}`))
    .join('; ');

/**
 * Parses with a schema, returning a result rather than throwing.
 *
 * A result because invalid input is expected in normal use - a user mistypes a
 * selector, a model returns a not-quite-right config - and `try`/`catch` around
 * every parse would make that read like an exceptional failure.
 */
export const validate = <TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  input: unknown,
): ValidationResult<z.infer<TSchema>> => {
  const parsed = schema.safeParse(input);

  if (parsed.success) return { ok: true, value: parsed.data };

  const issues = toValidationIssues(parsed.error);
  return { ok: false, issues, summary: summarise(issues) };
};

/**
 * Parses with a schema, throwing a readable error on failure.
 *
 * For callers that genuinely cannot continue - loading a workflow the user just
 * asked to run - where the alternative is checking a result and throwing anyway.
 */
export class SchemaValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(what: string, issues: readonly ValidationIssue[]) {
    super(`Invalid ${what}: ${summarise(issues)}`);
    this.name = 'SchemaValidationError';
    this.issues = issues;

    // Restores the prototype chain, lost when a built-in is subclassed and
    // transpiled. Without it, `instanceof` is false.
    Object.setPrototypeOf(this, SchemaValidationError.prototype);
  }
}

export const parseOrThrow = <TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  input: unknown,
  what: string,
): z.infer<TSchema> => {
  const result = validate(schema, input);
  if (result.ok) return result.value;
  throw new SchemaValidationError(what, result.issues);
};

export const isSchemaValidationError = (value: unknown): value is SchemaValidationError =>
  value instanceof SchemaValidationError;
