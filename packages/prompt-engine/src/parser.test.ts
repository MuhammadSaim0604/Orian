import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { extractJson, parseStructured, parseWithRetry, repairJson } from './parser';

const configSchema = z.object({
  condition: z.object({
    type: z.literal('element_exists'),
    selector: z.object({ text: z.string() }),
  }),
});

describe('extractJson', () => {
  it('reads a bare object', () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });

  it('reads an object out of a markdown fence', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('reads an object out of an unlabelled fence', () => {
    expect(extractJson('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('ignores a preamble the model added out of habit', () => {
    expect(extractJson('Here\'s the configuration:\n{"a":1}')).toBe('{"a":1}');
  });

  it('ignores a trailing explanation', () => {
    expect(extractJson('{"a":1}\n\nThis checks whether the button is visible.')).toBe('{"a":1}');
  });

  it('matches braces rather than using a regex, so nesting survives', () => {
    const nested = '{"a":{"b":{"c":1}}}';

    expect(extractJson(`prose ${nested} more prose`)).toBe(nested);
  });

  it('is not confused by a brace inside a string value', () => {
    // Common in a selector's text.
    const json = '{"text":"a } b"}';

    expect(extractJson(json)).toBe(json);
  });

  it('is not confused by an escaped quote', () => {
    const json = '{"text":"say \\"hi\\""}';

    expect(extractJson(json)).toBe(json);
  });

  it('reads a top-level array', () => {
    expect(extractJson('[1,2,3]')).toBe('[1,2,3]');
  });

  it('returns null when there is no JSON at all', () => {
    expect(extractJson('I cannot do that.')).toBeNull();
  });

  it('returns null for an unterminated object', () => {
    expect(extractJson('{"a":1')).toBeNull();
  });
});

describe('repairJson', () => {
  it('removes a trailing comma', () => {
    expect(JSON.parse(repairJson('{"a":1,}'))).toEqual({ a: 1 });
  });

  it('removes a trailing comma in an array', () => {
    expect(JSON.parse(repairJson('{"a":[1,2,]}'))).toEqual({ a: [1, 2] });
  });

  it('replaces smart quotes', () => {
    expect(JSON.parse(repairJson('{\u201ca\u201d:1}'))).toEqual({ a: 1 });
  });

  it('quotes unquoted keys', () => {
    expect(JSON.parse(repairJson('{a:1,b:2}'))).toEqual({ a: 1, b: 2 });
  });

  it('converts single-quoted values', () => {
    expect(JSON.parse(repairJson('{"a": \'hello\'}'))).toEqual({ a: 'hello' });
  });

  it('leaves valid JSON unchanged', () => {
    expect(JSON.parse(repairJson('{"a":"b, c"}'))).toEqual({ a: 'b, c' });
  });
});

describe('parseStructured', () => {
  const valid = '{"condition":{"type":"element_exists","selector":{"text":"Send"}}}';

  it('parses and validates', () => {
    const result = parseStructured(configSchema, valid);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.condition.selector.text).toBe('Send');
  });

  it('handles the Data_Models example from the plan', () => {
    // The Configure-with-AI acceptance case: "Return true if the Send button is
    // visible" must produce exactly this.
    const result = parseStructured(configSchema, `Sure!\n\`\`\`json\n${valid}\n\`\`\``);

    expect(result.ok).toBe(true);
  });

  it('reports when it had to repair formatting', () => {
    const result = parseStructured(
      configSchema,
      '{"condition":{"type":"element_exists","selector":{"text":"Send"},},}',
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.repaired).toBe(true);
  });

  it('does not claim repair when none was needed', () => {
    const result = parseStructured(configSchema, valid);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.repaired).toBe(false);
  });

  it('distinguishes no-JSON from malformed JSON', () => {
    // The useful correction differs: one needs "return only JSON", the other needs
    // "that was not valid".
    const noJson = parseStructured(configSchema, 'I cannot determine that.');
    // Balanced braces, so it is extracted, but not parseable and not repairable -
    // `undefined` is a real thing models emit.
    const malformed = parseStructured(configSchema, '{"condition": {"type": undefined}}');

    expect(noJson.ok).toBe(false);
    expect(malformed.ok).toBe(false);
    if (!noJson.ok) expect(noJson.reason).toBe('no-json');
    if (!malformed.ok) expect(malformed.reason).toBe('malformed-json');
  });

  it('names the field when the shape is wrong', () => {
    // What makes a re-prompt succeed rather than repeat the same mistake.
    const result = parseStructured(configSchema, '{"condition":{"type":"wrong_type"}}');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('schema-mismatch');
      expect(result.message).toContain('condition');
    }
  });

  it('never repairs meaning, only formatting', () => {
    // A missing required field is reported, not invented. Guessing would produce a
    // config that validates and then does the wrong thing on someone's phone.
    const result = parseStructured(configSchema, '{"condition":{"type":"element_exists"}}');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('schema-mismatch');
  });

  it('keeps the raw text for the log', () => {
    const result = parseStructured(configSchema, 'nope');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.raw).toBe('nope');
  });

  it('phrases every failure as an instruction the model can act on', () => {
    const failures = [
      parseStructured(configSchema, 'prose only'),
      parseStructured(configSchema, '{"condition": {"type": undefined}}'),
      parseStructured(configSchema, '{"wrong":true}'),
    ];

    for (const failure of failures) {
      expect(failure.ok).toBe(false);
      if (!failure.ok) {
        expect(failure.message.length).toBeGreaterThan(20);
        expect(failure.message).toMatch(/reply|return|correct/i);
      }
    }
  });
});

describe('parseWithRetry', () => {
  const valid = '{"condition":{"type":"element_exists","selector":{"text":"Send"}}}';

  it('succeeds on the first attempt without a correction', async () => {
    const corrections: (string | null)[] = [];

    const result = await parseWithRetry(configSchema, async (correction) => {
      corrections.push(correction);
      return valid;
    });

    expect(result.ok).toBe(true);
    expect(corrections).toEqual([null]);
  });

  it('feeds the failure back so the retry is a correction', async () => {
    const corrections: (string | null)[] = [];
    let attempt = 0;

    const result = await parseWithRetry(configSchema, async (correction) => {
      corrections.push(correction);
      attempt++;
      return attempt === 1 ? 'I think the button is visible.' : valid;
    });

    expect(result.ok).toBe(true);
    expect(corrections[0]).toBeNull();
    expect(corrections[1]).toContain('JSON');
  });

  it('gives up after the attempt limit', async () => {
    // A model that produced unusable output twice will usually do so again, and each
    // attempt is a paid round trip while the user waits.
    let attempts = 0;

    const result = await parseWithRetry(
      configSchema,
      async () => {
        attempts++;
        return 'still not JSON';
      },
      2,
    );

    expect(result.ok).toBe(false);
    expect(attempts).toBe(2);
  });

  it('returns the last failure, so the caller can report why', async () => {
    const result = await parseWithRetry(configSchema, async () => '{"wrong":true}', 2);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('schema-mismatch');
  });
});
