import { type z } from 'zod';

/**
 * Parsing structured output from a model.
 *
 * The model returns text; the app needs a validated object. Between those sits a
 * surprising amount of reality: markdown fences, a leading "Here's the
 * configuration:", a trailing explanation, smart quotes from a model that formats
 * prose by habit, a trailing comma.
 *
 * The order of operations matters. **Repair only fixes formatting, never meaning.** A
 * missing required field is not repaired - it is reported, so the model can be
 * re-prompted with the specific problem. Guessing a value would produce a config that
 * validates and then does the wrong thing on someone's phone, which is worse than a
 * clean failure.
 */

export type ParseSuccess<T> = {
  readonly ok: true;
  readonly value: T;
  /** Whether the raw text needed formatting repair, for logs and prompt tuning. */
  readonly repaired: boolean;
};

export type ParseFailure = {
  readonly ok: false;
  readonly reason: 'no-json' | 'malformed-json' | 'schema-mismatch';
  /**
   * Message written to be fed back to the model.
   *
   * Phrased as a correction rather than a diagnostic: it goes into the next prompt, and
   * the model must be able to act on it.
   */
  readonly message: string;
  /** The text that failed, for the log. Truncated by the caller if long. */
  readonly raw: string;
};

export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

/**
 * Extracts a JSON object from model output.
 *
 * Brace matching rather than a regex, because a nested object defeats a lazy pattern
 * and a greedy one swallows trailing prose. Quote and escape state is tracked so a
 * brace inside a string value - common in a selector's text - does not end the object
 * early.
 */
export const extractJson = (text: string): string | null => {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced?.[1] ?? text;

  const start = candidate.search(/[{[]/);
  if (start === -1) return null;

  const opening = candidate[start]!;
  const closing = opening === '{' ? '}' : ']';

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < candidate.length; index++) {
    const char = candidate[index]!;

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === opening) depth++;
    else if (char === closing) {
      depth--;
      if (depth === 0) return candidate.slice(start, index + 1);
    }
  }

  return null;
};

/**
 * Fixes formatting a model got wrong, never content.
 *
 * Each rule addresses something models actually emit. Trailing commas come from
 * JavaScript habits; smart quotes from prose formatting; unquoted keys from YAML-ish
 * output. None of them change what the model meant, which is the line this function
 * must not cross.
 */
export const repairJson = (text: string): string => {
  let repaired = text.trim();

  // Smart quotes around keys and values.
  repaired = repaired.replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'");

  // Trailing comma before a closing brace or bracket.
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

  // Unquoted object keys.
  repaired = repaired.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');

  // Single-quoted strings, only where they clearly delimit a value.
  repaired = repaired.replace(/:\s*'([^'\n]*)'/g, ': "$1"');

  return repaired;
};

/**
 * Parses and validates model output against a schema.
 *
 * The single gate between a model's text and something the app acts on. Three distinct
 * failures, kept separate because the useful correction differs: no JSON at all needs
 * "return only JSON", malformed JSON needs "that was not valid", and a schema mismatch
 * needs the specific field.
 */
export const parseStructured = <TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  text: string,
): ParseResult<z.infer<TSchema>> => {
  const extracted = extractJson(text);

  if (extracted === null) {
    return {
      ok: false,
      reason: 'no-json',
      message:
        'Your response contained no JSON object. Reply with only a JSON object and nothing else.',
      raw: text,
    };
  }

  let parsed: unknown;
  let repaired = false;

  try {
    parsed = JSON.parse(extracted);
  } catch {
    try {
      parsed = JSON.parse(repairJson(extracted));
      repaired = true;
    } catch {
      return {
        ok: false,
        reason: 'malformed-json',
        message:
          'Your response was not valid JSON. Reply with a single valid JSON object, ' +
          'with no comments and no trailing commas.',
        raw: text,
      };
    }
  }

  const result = schema.safeParse(parsed);

  if (!result.success) {
    return {
      ok: false,
      reason: 'schema-mismatch',
      // Naming the fields is what makes a re-prompt succeed rather than repeat the
      // same mistake.
      message: `Your JSON did not match the required shape: ${describeIssues(result.error)}. Correct those fields and reply with only the JSON object.`,
      raw: text,
    };
  }

  return { ok: true, value: result.data, repaired };
};

const describeIssues = (error: z.ZodError): string =>
  error.issues
    .slice(0, 5)
    .map((issue) => {
      const path = issue.path.join('.');
      return path === '' ? issue.message : `${path} - ${issue.message}`;
    })
    .join('; ');

/**
 * Retries a parse by re-prompting.
 *
 * Bounded, because a model that produced unusable output twice will usually produce it
 * a third time, and each attempt is a paid round trip while the user waits. The
 * failure message is fed back so the retry is a correction rather than a repeat.
 */
export const parseWithRetry = async <TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  attempt: (correction: string | null) => Promise<string>,
  maxAttempts = 2,
): Promise<ParseResult<z.infer<TSchema>>> => {
  let lastFailure: ParseFailure | null = null;

  for (let index = 0; index < maxAttempts; index++) {
    const text = await attempt(lastFailure?.message ?? null);
    const result = parseStructured(schema, text);

    if (result.ok) return result;

    lastFailure = result;
  }

  return lastFailure!;
};
