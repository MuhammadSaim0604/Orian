import { coreNodes } from '@mobile-automation/core-nodes';
import { parseStructured } from '@mobile-automation/prompt-engine';
import { z } from 'zod';

import { configJsonSchemaFor } from '../configJsonSchema';

/**
 * The model's view of a node's config, and the validation it must satisfy.
 *
 * This is the contract the whole overlay rests on: the model is told a shape, and its output is
 * checked against the node's **own** Zod schema before anything is applied. The tests below cover
 * both halves - that the description matches the schema, and that a response is rejected when it
 * does not.
 *
 * The condition-node case is the phase's definition of done, so it is tested end to end from the
 * model's text through to a validated config.
 */

const conditionNode = coreNodes.find((node) => node.type === 'condition')!;

describe('describing a config for the model', () => {
  it('produces an object schema with the node’s own fields', () => {
    const schema = configJsonSchemaFor(conditionNode.configSchema);

    expect(schema.type).toBe('object');
    expect(Object.keys(schema.properties as object)).toContain('condition');
  });

  it('lists required fields, so the model does not omit one', () => {
    const schema = configJsonSchemaFor(z.object({ text: z.string(), note: z.string().optional() }));

    expect(schema.required).toEqual(['text']);
  });

  it('carries numeric bounds through', () => {
    const schema = configJsonSchemaFor(z.object({ timeoutMs: z.number().int().min(1).max(1_000) }));
    const field = (schema.properties as Record<string, Record<string, unknown>>).timeoutMs!;

    expect(field.type).toBe('integer');
    expect(field.minimum).toBe(1);
    expect(field.maximum).toBe(1_000);
  });

  it('describes an enum by its options', () => {
    const schema = configJsonSchemaFor(z.object({ mode: z.enum(['fast', 'careful']) }));
    const field = (schema.properties as Record<string, Record<string, unknown>>).mode!;

    expect(field.enum).toEqual(['fast', 'careful']);
  });

  it('states the selector priority where the model will read it', () => {
    // The single most important thing for it to get right (ADR 0009).
    const selectorish = z.object({
      resourceId: z.string().optional(),
      text: z.string().optional(),
      className: z.string().optional(),
    });

    const schema = configJsonSchemaFor(z.object({ selector: selectorish }));
    const field = (schema.properties as Record<string, Record<string, unknown>>).selector!;

    expect(String(field.description)).toContain('Prefer resourceId');
    expect(String(field.description)).toContain('coordinates only when');
  });

  it('describes a discriminated union as oneOf with the tag fixed per branch', () => {
    // Flattening would invite a mixture no branch accepts.
    const schema = configJsonSchemaFor(
      z.object({
        source: z.discriminatedUnion('from', [
          z.object({ from: z.literal('literal'), value: z.string() }),
          z.object({ from: z.literal('variable'), name: z.string() }),
        ]),
      }),
    );

    const field = (schema.properties as Record<string, Record<string, unknown>>).source!;
    const branches = field.oneOf as Record<string, Record<string, Record<string, unknown>>>[];

    expect(branches).toHaveLength(2);
    expect(branches[0]!.properties!.from!.const).toBe('literal');
  });

  it('carries a description from the schema, so the model knows what a field means', () => {
    const schema = configJsonSchemaFor(
      z.object({ text: z.string().describe('What to type into the field') }),
    );
    const field = (schema.properties as Record<string, Record<string, unknown>>).text!;

    expect(field.description).toBe('What to type into the field');
  });

  it('is honest about a shape it cannot describe', () => {
    const schema = configJsonSchemaFor(z.object({ extras: z.record(z.string()) }));
    const field = (schema.properties as Record<string, Record<string, unknown>>).extras!;

    expect(String(field.description)).toContain('Any JSON value');
  });

  it('describes every core node without throwing', () => {
    // A node whose schema cannot be described would be one the overlay silently cannot configure.
    for (const node of coreNodes) {
      expect(() => configJsonSchemaFor(node.configSchema)).not.toThrow();
    }
  });
});

describe('validating what the model returns', () => {
  it('accepts the config from the phase’s definition of done', () => {
    // "Return true if the Send button is visible" →
    // { condition: { type: "element_exists", selector: { text: "Send" } } }
    const output = JSON.stringify({
      condition: { type: 'element_exists', selector: { text: 'Send' } },
    });

    const parsed = parseStructured(conditionNode.configSchema, output);

    expect(parsed.ok).toBe(true);
  });

  it('accepts the same config wrapped in markdown fences', () => {
    // Models add them constantly; failing on that would be a self-inflicted retry.
    const output = `\`\`\`json\n${JSON.stringify({
      condition: { type: 'element_exists', selector: { resourceId: 'com.whatsapp:id/send' } },
    })}\n\`\`\``;

    expect(parseStructured(conditionNode.configSchema, output).ok).toBe(true);
  });

  it('rejects prose, which cannot be applied to a node', () => {
    const parsed = parseStructured(
      conditionNode.configSchema,
      'I would check whether the Send button exists.',
    );

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toBe('no-json');
  });

  it('rejects a selector with nothing to locate by', () => {
    // Such a config resolves to nothing at run time and reports "element not found", sending the
    // user to look at their screen rather than their workflow.
    const output = JSON.stringify({
      condition: { type: 'element_exists', selector: { className: 'android.widget.Button' } },
    });

    expect(parseStructured(conditionNode.configSchema, output).ok).toBe(false);
  });

  it('rejects an unknown condition type', () => {
    const output = JSON.stringify({
      condition: { type: 'vibes_are_good', selector: { text: 'Send' } },
    });

    expect(parseStructured(conditionNode.configSchema, output).ok).toBe(false);
  });

  it('explains a rejection in terms the model can act on', () => {
    // The message goes into the retry prompt, so it has to be a correction rather than a
    // diagnostic.
    const parsed = parseStructured(conditionNode.configSchema, JSON.stringify({}));

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.message.length).toBeGreaterThan(10);
  });

  it('validates against the same schema the executor applies', () => {
    // So a config that passes here cannot fail at run time for a shape reason.
    const output = JSON.stringify({
      condition: { type: 'element_exists', selector: { text: 'Send' } },
    });

    const parsed = parseStructured(conditionNode.configSchema, output);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(conditionNode.configSchema.safeParse(parsed.value).success).toBe(true);
  });
});
