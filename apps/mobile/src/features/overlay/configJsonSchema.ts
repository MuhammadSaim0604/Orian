import { type FieldDescriptor, describeSchema } from '@mobile-automation/node-sdk';
import { type z } from 'zod';

/**
 * Describing a node's config schema for the model.
 *
 * `buildNodeConfigContext` wants a JSON Schema, and Zod's own `.toJSONSchema` does not exist in
 * v3. Converting the full schema by hand would be a second definition of every node's shape,
 * drifting from the first.
 *
 * So this derives the description from `describeSchema` - the same field descriptors that drive
 * the node editor's form. One source, two consumers: what the user sees as a form is what the
 * model is told to produce, and neither can silently diverge from the Zod schema that validates
 * both.
 */

export const configJsonSchemaFor = (schema: z.ZodTypeAny): Record<string, unknown> => {
  const fields = describeSchema(schema);

  return {
    type: 'object',
    properties: Object.fromEntries(fields.map((field) => [field.name, describeField(field)])),
    required: fields.filter((field) => !field.optional).map((field) => field.name),
  };
};

const describeField = (field: FieldDescriptor): Record<string, unknown> => {
  const base: Record<string, unknown> =
    field.description === undefined ? {} : { description: field.description };

  if (field.defaultValue !== undefined) base.default = field.defaultValue;

  switch (field.kind) {
    case 'text':
    case 'multilineText':
      return { ...base, type: 'string' };

    case 'number':
      return { ...base, type: 'number', minimum: field.min, maximum: field.max };

    case 'integer':
      return { ...base, type: 'integer', minimum: field.min, maximum: field.max };

    case 'boolean':
      return { ...base, type: 'boolean' };

    case 'enum':
      return { ...base, enum: field.enumValues };

    case 'selector':
      // Spelled out rather than recursed into, because the selector's shape is the single most
      // important thing the model must get right, and the priority order needs stating where it
      // will be read (ADR 0009).
      return {
        ...base,
        type: 'object',
        description:
          'Identifies an element on screen. Prefer resourceId, then contentDescription, then ' +
          'text. Use coordinates only when nothing else identifies it.',
        properties: {
          resourceId: { type: 'string' },
          contentDescription: { type: 'string' },
          text: { type: 'string' },
          className: { type: 'string' },
          coordinates: {
            type: 'object',
            properties: { x: { type: 'integer' }, y: { type: 'integer' } },
          },
        },
      };

    case 'object':
      return {
        ...base,
        type: 'object',
        properties: Object.fromEntries(
          (field.children ?? []).map((child) => [child.name, describeField(child)]),
        ),
        required: (field.children ?? [])
          .filter((child) => !child.optional)
          .map((child) => child.name),
      };

    case 'array':
      return {
        ...base,
        type: 'array',
        items: field.children?.[0] === undefined ? {} : describeField(field.children[0]),
      };

    case 'union':
      // `oneOf` keyed by the discriminator, so the model picks a branch and fills only its
      // fields. Flattening would invite a mixture no branch accepts.
      return {
        ...base,
        oneOf: Object.entries(field.variants ?? {}).map(([tag, children]) => ({
          type: 'object',
          properties: Object.fromEntries(
            children.map((child) => [
              child.name,
              child.name === field.discriminator ? { const: tag } : describeField(child),
            ]),
          ),
          required: children.filter((child) => !child.optional).map((child) => child.name),
        })),
      };

    case 'json':
    case 'unsupported':
      // Honest about not knowing, rather than asserting a shape the schema may reject.
      return { ...base, description: `${field.description ?? ''} Any JSON value.`.trim() };
  }
};
