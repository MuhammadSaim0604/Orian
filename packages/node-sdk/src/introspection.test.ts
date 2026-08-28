import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  type FieldDescriptor,
  clearPath,
  describeSchema,
  fieldPaths,
  readPath,
  writePath,
} from './introspection';

const byPath = (fields: readonly FieldDescriptor[], path: string): FieldDescriptor =>
  fields.find((field) => field.path === path)!;

describe('primitive fields', () => {
  const fields = describeSchema(
    z.object({
      label: z.string(),
      count: z.number().int().min(1).max(10),
      ratio: z.number(),
      enabled: z.boolean(),
      mode: z.enum(['fast', 'careful']),
    }),
  );

  it('reads a string as a text field', () => {
    expect(byPath(fields, 'label').kind).toBe('text');
  });

  it('distinguishes an integer from a number, so a stepper can be whole', () => {
    expect(byPath(fields, 'count').kind).toBe('integer');
    expect(byPath(fields, 'ratio').kind).toBe('number');
  });

  it('carries numeric bounds so a control can clamp rather than validate after', () => {
    const count = byPath(fields, 'count');

    expect(count.min).toBe(1);
    expect(count.max).toBe(10);
  });

  it('reads a boolean as a switch', () => {
    expect(byPath(fields, 'enabled').kind).toBe('boolean');
  });

  it('reads an enum with its options', () => {
    const mode = byPath(fields, 'mode');

    expect(mode.kind).toBe('enum');
    expect(mode.enumValues).toEqual(['fast', 'careful']);
  });

  it('marks a required field as not optional', () => {
    expect(byPath(fields, 'label').optional).toBe(false);
  });
});

describe('wrappers', () => {
  it('sees through optional', () => {
    const fields = describeSchema(z.object({ note: z.string().optional() }));

    expect(byPath(fields, 'note').kind).toBe('text');
    expect(byPath(fields, 'note').optional).toBe(true);
  });

  it('captures a default and treats the field as optional', () => {
    // A field with a default is optional from the user's point of view, whatever the type
    // says.
    const fields = describeSchema(z.object({ timeoutMs: z.number().default(5_000) }));

    expect(byPath(fields, 'timeoutMs').defaultValue).toBe(5_000);
    expect(byPath(fields, 'timeoutMs').optional).toBe(true);
  });

  it('captures a description for help text', () => {
    const fields = describeSchema(
      z.object({ text: z.string().describe('What to type into the field') }),
    );

    expect(byPath(fields, 'text').description).toBe('What to type into the field');
  });

  it('sees through a stack of wrappers', () => {
    // Without unwrapping, this reads as an unsupported wrapper and renders as raw JSON.
    const fields = describeSchema(
      z.object({ n: z.number().int().optional().default(3).describe('how many') }),
    );

    const field = byPath(fields, 'n');

    expect(field.kind).toBe('integer');
    expect(field.defaultValue).toBe(3);
    expect(field.description).toBe('how many');
  });

  it('sees through a refine wrapper', () => {
    // The constraint cannot be shown as a control, so the inner shape drives the form.
    const fields = describeSchema(
      z.object({ hour: z.number().int() }).refine((value) => value.hour < 24),
    );

    expect(byPath(fields, 'hour').kind).toBe('integer');
  });
});

describe('nesting', () => {
  it('describes a nested object with dotted paths', () => {
    const fields = describeSchema(
      z.object({ retry: z.object({ attempts: z.number(), delayMs: z.number() }) }),
    );

    const retry = byPath(fields, 'retry');

    expect(retry.kind).toBe('object');
    expect(retry.children?.map((child) => child.path)).toEqual(['retry.attempts', 'retry.delayMs']);
  });

  it('describes an array by its element', () => {
    const fields = describeSchema(z.object({ days: z.array(z.number().int()) }));

    const days = byPath(fields, 'days');

    expect(days.kind).toBe('array');
    expect(days.children?.[0]?.kind).toBe('integer');
  });

  it('recognises a selector by its shape rather than a marker', () => {
    // So a third-party node using the same shape gets the element picker for free,
    // instead of a generic form with nine optional text fields.
    const selectorish = z.object({
      resourceId: z.string().optional(),
      text: z.string().optional(),
      className: z.string().optional(),
      contentDescription: z.string().optional(),
    });

    const fields = describeSchema(z.object({ selector: selectorish }));

    expect(byPath(fields, 'selector').kind).toBe('selector');
  });

  it('does not mistake an ordinary object for a selector', () => {
    const fields = describeSchema(z.object({ meta: z.object({ text: z.string() }) }));

    expect(byPath(fields, 'meta').kind).toBe('object');
  });
});

describe('discriminated unions', () => {
  const schema = z.object({
    source: z.discriminatedUnion('from', [
      z.object({ from: z.literal('literal'), value: z.string() }),
      z.object({ from: z.literal('variable'), name: z.string() }),
    ]),
  });

  it('keeps branches separate, so a form shows only the selected one', () => {
    // Flattening would present every variant's fields at once, most of which are invalid
    // together.
    const source = byPath(describeSchema(schema), 'source');

    expect(source.kind).toBe('union');
    expect(source.discriminator).toBe('from');
    expect(Object.keys(source.variants ?? {}).sort()).toEqual(['literal', 'variable']);
  });

  it('describes each branch\u2019s own fields', () => {
    const source = byPath(describeSchema(schema), 'source');

    expect(source.variants?.literal?.map((f) => f.name)).toEqual(['from', 'value']);
    expect(source.variants?.variable?.map((f) => f.name)).toEqual(['from', 'name']);
  });

  it('renders the discriminator as a fixed choice, not free text', () => {
    // An editable discriminator invites setting it to something the schema then rejects.
    const source = byPath(describeSchema(schema), 'source');
    const tag = source.variants?.literal?.find((f) => f.name === 'from');

    expect(tag?.kind).toBe('enum');
    expect(tag?.enumValues).toEqual(['literal']);
  });
});

describe('degrading gracefully', () => {
  it('falls back to JSON for an untagged union', () => {
    // A form cannot know which branch the user means; JSON is honest about that.
    const fields = describeSchema(z.object({ value: z.union([z.string(), z.number()]) }));

    expect(byPath(fields, 'value').kind).toBe('json');
  });

  it('falls back to JSON for a record', () => {
    const fields = describeSchema(z.object({ extras: z.record(z.string()) }));

    expect(byPath(fields, 'extras').kind).toBe('json');
  });

  it('reports an exotic type as unsupported rather than throwing', () => {
    // An exotic third-party node stays editable as raw JSON instead of breaking the
    // editor.
    const fields = describeSchema(z.object({ when: z.date() }));

    expect(byPath(fields, 'when').kind).toBe('unsupported');
  });

  it('handles an empty config', () => {
    expect(describeSchema(z.object({}))).toEqual([]);
  });

  it('handles a non-object config', () => {
    expect(describeSchema(z.string())[0]?.kind).toBe('text');
  });
});

describe('prose detection', () => {
  it('gives a multiline control to fields that hold prose', () => {
    // Zod cannot express "this is prose", and a single-line box for a message body is a
    // genuinely annoying way to type.
    const fields = describeSchema(
      z.object({ text: z.string(), body: z.string(), title: z.string() }),
    );

    expect(byPath(fields, 'text').kind).toBe('multilineText');
    expect(byPath(fields, 'body').kind).toBe('multilineText');
    expect(byPath(fields, 'title').kind).toBe('text');
  });
});

describe('path helpers', () => {
  it('lists leaf paths', () => {
    const fields = describeSchema(
      z.object({ a: z.string(), b: z.object({ c: z.number(), d: z.boolean() }) }),
    );

    expect(fieldPaths(fields)).toEqual(['a', 'b.c', 'b.d']);
  });

  it('treats a selector as a leaf, since it has its own control', () => {
    const selectorish = z.object({
      resourceId: z.string().optional(),
      text: z.string().optional(),
      className: z.string().optional(),
    });

    expect(fieldPaths(describeSchema(z.object({ selector: selectorish })))).toEqual(['selector']);
  });

  it('reads a nested value', () => {
    expect(readPath({ a: { b: 'x' } }, 'a.b')).toBe('x');
  });

  it('reads undefined for a missing path rather than throwing', () => {
    expect(readPath({ a: {} }, 'a.b.c')).toBeUndefined();
    expect(readPath(null, 'a')).toBeUndefined();
  });

  it('writes a nested value without mutating the original', () => {
    // The config lives in a Zustand store; mutating in place would skip the subscription
    // that repaints the node.
    const original = { a: { b: 'x' }, keep: 1 };
    const updated = writePath(original, 'a.b', 'y') as typeof original;

    expect(updated.a.b).toBe('y');
    expect(updated.keep).toBe(1);
    expect(original.a.b).toBe('x');
  });

  it('creates intermediate objects when writing a deep path', () => {
    expect(writePath({}, 'a.b.c', 1)).toEqual({ a: { b: { c: 1 } } });
  });

  it('clears an optional field', () => {
    expect(clearPath({ a: 1, b: 2 }, 'a')).toEqual({ b: 2 });
  });

  it('clears a nested field', () => {
    expect(clearPath({ a: { b: 1, c: 2 } }, 'a.b')).toEqual({ a: { c: 2 } });
  });
});
