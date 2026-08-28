import { z } from 'zod';

import { TOOL_DEFINITIONS, type ToolDefinition } from './definitions';
import { TOOL_NAMES, type ToolName, isToolName } from './names';

/**
 * Validating a tool call the model produced.
 *
 * The gate between a model's output and someone's phone. A call that fails validation
 * is **never executed** - it is reported back so the agent can re-prompt, which is
 * what stops a hallucinated argument from tapping something unintended.
 */

/** What a model asked to do, before validation. */
export type RawToolCall = {
  /** Provider-assigned id, echoed back so the model can match result to call. */
  readonly id?: string;
  readonly name: string;
  /** Arguments as the model produced them - a JSON string, or an already-parsed object. */
  readonly arguments: string | Record<string, unknown>;
};

/** A tool call that has been checked and is safe to execute. */
export type ValidatedToolCall = {
  readonly id?: string;
  readonly name: ToolName;
  readonly arguments: Record<string, unknown>;
  readonly definition: ToolDefinition;
};

export const TOOL_CALL_REJECTIONS = [
  'unknown-tool',
  'malformed-json',
  'invalid-arguments',
] as const;

export type ToolCallRejectionReason = (typeof TOOL_CALL_REJECTIONS)[number];

export type ToolCallRejection = {
  readonly ok: false;
  readonly reason: ToolCallRejectionReason;
  /**
   * Message written to be fed back to the model.
   *
   * Phrased as a correction rather than a stack trace, because it goes straight into
   * the next prompt and the model has to be able to act on it.
   */
  readonly message: string;
  readonly toolName: string;
};

export type ToolCallValidation =
  | { readonly ok: true; readonly call: ValidatedToolCall }
  | ToolCallRejection;

/**
 * Checks a model's tool call.
 *
 * Three failure modes, kept distinct because the useful correction differs: an
 * unknown tool needs the list of real ones, malformed JSON needs a reminder to emit
 * valid JSON, and bad arguments need the specific field that was wrong.
 */
export const validateToolCall = (raw: RawToolCall): ToolCallValidation => {
  if (!isToolName(raw.name)) {
    return {
      ok: false,
      reason: 'unknown-tool',
      toolName: raw.name,
      // Listing the real tools turns a dead end into a correctable mistake.
      message:
        `There is no tool called "${raw.name}". ` + `Available tools: ${TOOL_NAMES.join(', ')}.`,
    };
  }

  const definition = TOOL_DEFINITIONS[raw.name];

  let parsedArguments: unknown;
  if (typeof raw.arguments === 'string') {
    // Providers return tool arguments as a JSON string, and a truncated response is a
    // routine cause of a broken one.
    if (raw.arguments.trim() === '') {
      parsedArguments = {};
    } else {
      try {
        parsedArguments = JSON.parse(raw.arguments);
      } catch {
        return {
          ok: false,
          reason: 'malformed-json',
          toolName: raw.name,
          message:
            `The arguments for "${raw.name}" were not valid JSON. ` +
            'Send the arguments again as a single valid JSON object.',
        };
      }
    }
  } else {
    parsedArguments = raw.arguments;
  }

  const result = definition.argumentSchema.safeParse(parsedArguments);

  if (!result.success) {
    return {
      ok: false,
      reason: 'invalid-arguments',
      toolName: raw.name,
      message:
        `The arguments for "${raw.name}" were not valid: ` +
        `${describeIssues(result.error)}. Correct them and call the tool again.`,
    };
  }

  return {
    ok: true,
    call: {
      id: raw.id,
      name: raw.name,
      arguments: result.data as Record<string, unknown>,
      definition,
    },
  };
};

/** Formats Zod issues as a single line naming each field at fault. */
const describeIssues = (error: z.ZodError): string =>
  error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path === '' ? issue.message : `${path} - ${issue.message}`;
    })
    .join('; ');

/**
 * JSON Schema for a tool, for a provider's function-calling parameter.
 *
 * Hand-built rather than pulled from a Zod-to-JSON-Schema library: the subset needed
 * here is small, and the dependency would have to be trusted to produce something a
 * model can follow. This walks the schemas actually in use and nothing else.
 */
export const toolCallJsonSchema = (name: ToolName): Record<string, unknown> => {
  const definition = TOOL_DEFINITIONS[name];
  return zodToJsonSchema(definition.argumentSchema);
};

/** The whole tool list in the shape a Chat Completions request expects. */
export const toolsForRequest = (
  names: readonly ToolName[] = TOOL_NAMES,
): readonly {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}[] =>
  names.map((name) => ({
    type: 'function' as const,
    function: {
      name,
      description: `${TOOL_DEFINITIONS[name].description} Returns: ${TOOL_DEFINITIONS[name].returns}`,
      parameters: toolCallJsonSchema(name),
    },
  }));

/**
 * Converts the Zod schemas used by the tool surface into JSON Schema.
 *
 * Handles only the constructs these tools use. Anything unrecognised becomes an
 * unconstrained value rather than throwing - a slightly loose schema still lets the
 * model call the tool, and `validateToolCall` is the real gate either way.
 */
const zodToJsonSchema = (schema: z.ZodTypeAny): Record<string, unknown> => {
  const unwrapped = unwrap(schema);

  if (unwrapped instanceof z.ZodObject) {
    const shape = unwrapped.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value);
      if (!isOptional(value)) required.push(key);
    }

    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
      // Mirrors .strict(): an invented field is a misunderstanding, and saying so in
      // the schema gives the model a chance to avoid it.
      additionalProperties: false,
    };
  }

  if (unwrapped instanceof z.ZodString) return { type: 'string' };

  if (unwrapped instanceof z.ZodNumber) {
    return unwrapped.isInt ? { type: 'integer' } : { type: 'number' };
  }

  if (unwrapped instanceof z.ZodBoolean) return { type: 'boolean' };

  if (unwrapped instanceof z.ZodEnum) {
    return { type: 'string', enum: unwrapped.options as string[] };
  }

  if (unwrapped instanceof z.ZodArray) {
    return { type: 'array', items: zodToJsonSchema(unwrapped.element as z.ZodTypeAny) };
  }

  if (unwrapped instanceof z.ZodRecord) {
    return {
      type: 'object',
      additionalProperties: zodToJsonSchema(unwrapped.valueSchema as z.ZodTypeAny),
    };
  }

  return {};
};

/** Strips the wrappers that do not change the JSON shape. */
const unwrap = (schema: z.ZodTypeAny): z.ZodTypeAny => {
  let current = schema;

  for (;;) {
    if (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
      current = current.unwrap() as z.ZodTypeAny;
      continue;
    }

    if (current instanceof z.ZodDefault) {
      current = current.removeDefault() as z.ZodTypeAny;
      continue;
    }

    if (current instanceof z.ZodEffects) {
      // A .refine() wrapper, such as the selector's "needs a locating field" rule.
      // The constraint cannot be expressed in JSON Schema, so the description on the
      // tool carries it instead.
      current = current.innerType() as z.ZodTypeAny;
      continue;
    }

    return current;
  }
};

const isOptional = (schema: z.ZodTypeAny): boolean =>
  schema instanceof z.ZodOptional || schema instanceof z.ZodDefault || schema.isOptional();
