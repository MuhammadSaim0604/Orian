import { z } from 'zod';

/**
 * Describing a node's config schema as data a form can render.
 *
 * The builder UI must be able to edit a node it has never heard of, including one from a
 * third-party package installed after the app shipped. Hand-written forms cannot do that,
 * so the form is generated from the node's own Zod schema - which already exists, is
 * already the validation contract, and is already what the AI must satisfy.
 *
 * This lives in `node-sdk` rather than in the app because a node author needs to know
 * what their schema will produce, and because `packages/ui` must not depend on the app.
 */

/** What kind of control a field needs. */
export const FIELD_KINDS = [
  'text',
  'multilineText',
  'number',
  'integer',
  'boolean',
  'enum',
  'selector',
  'json',
  'array',
  'object',
  'union',
  'unsupported',
] as const;

export type FieldKind = (typeof FIELD_KINDS)[number];

/** One editable field, as the form renderer sees it. */
export type FieldDescriptor = {
  /** Dotted path into the config object, e.g. `condition.selector.text`. */
  readonly path: string;
  /** The last path segment, for a label when no better name exists. */
  readonly name: string;
  readonly kind: FieldKind;
  readonly optional: boolean;
  /** Schema default, so the form can show it rather than an empty box. */
  readonly defaultValue?: unknown;
  /** From `.describe()`, shown as help text. */
  readonly description?: string;
  readonly enumValues?: readonly string[];
  /** Numeric bounds, so a stepper can clamp rather than validate after the fact. */
  readonly min?: number;
  readonly max?: number;
  /** Fields of an object, or of each element of an array. */
  readonly children?: readonly FieldDescriptor[];
  /**
   * The branches of a discriminated union, keyed by discriminator value.
   *
   * Kept as a map rather than flattened, because a form must show only the fields of the
   * selected branch - flattening would present the user with every variant's fields at
   * once, most of which are invalid together.
   */
  readonly variants?: Readonly<Record<string, readonly FieldDescriptor[]>>;
  readonly discriminator?: string;
};

/**
 * Reads a Zod schema into field descriptors.
 *
 * Only the constructs the node schemas actually use are handled. Anything else becomes
 * `unsupported`, which the form renders as a raw JSON editor - degrading to something
 * usable rather than throwing, so an exotic third-party node is still editable.
 */
export const describeSchema = (schema: z.ZodTypeAny): readonly FieldDescriptor[] => {
  const unwrapped = unwrap(schema).schema;

  if (unwrapped instanceof z.ZodObject) {
    return describeObjectShape(unwrapped, '');
  }

  // A non-object config is legal but unusual; describe it as a single unnamed field.
  return [describeField('', '', schema)];
};

const describeObjectShape = (
  schema: z.ZodObject<z.ZodRawShape>,
  prefix: string,
): readonly FieldDescriptor[] =>
  Object.entries(schema.shape).map(([key, value]) =>
    describeField(prefix === '' ? key : `${prefix}.${key}`, key, value as z.ZodTypeAny),
  );

const describeField = (path: string, name: string, schema: z.ZodTypeAny): FieldDescriptor => {
  const { schema: inner, optional, defaultValue, description } = unwrap(schema);

  const base = { path, name, optional, defaultValue, description };

  if (inner instanceof z.ZodString) {
    // A long free-text field wants a multiline control. Guessed from the field name
    // rather than the schema, because Zod cannot express "this is prose" - and getting a
    // single-line box for a message body is a genuinely annoying way to type.
    return { ...base, kind: isProseField(name) ? 'multilineText' : 'text' };
  }

  if (inner instanceof z.ZodNumber) {
    return {
      ...base,
      kind: inner.isInt ? 'integer' : 'number',
      min: inner.minValue ?? undefined,
      max: inner.maxValue ?? undefined,
    };
  }

  if (inner instanceof z.ZodBoolean) return { ...base, kind: 'boolean' };

  if (inner instanceof z.ZodEnum) {
    return { ...base, kind: 'enum', enumValues: inner.options as readonly string[] };
  }

  if (inner instanceof z.ZodLiteral) {
    // A literal in a union branch is the discriminator, already fixed by the branch
    // choice; presenting it as an editable field invites setting it to something the
    // schema will then reject.
    return { ...base, kind: 'enum', enumValues: [String(inner.value)] };
  }

  if (inner instanceof z.ZodObject) {
    if (isSelectorShape(inner)) return { ...base, kind: 'selector' };

    return {
      ...base,
      kind: 'object',
      children: describeObjectShape(inner as z.ZodObject<z.ZodRawShape>, path),
    };
  }

  if (inner instanceof z.ZodArray) {
    return {
      ...base,
      kind: 'array',
      children: [describeField(`${path}[]`, name, inner.element as z.ZodTypeAny)],
    };
  }

  if (inner instanceof z.ZodDiscriminatedUnion) {
    const options = inner.options as z.ZodObject<z.ZodRawShape>[];
    const discriminator = inner.discriminator as string;
    const variants: Record<string, readonly FieldDescriptor[]> = {};

    for (const option of options) {
      const tag = discriminatorValue(option, discriminator);
      if (tag === null) continue;

      variants[tag] = describeObjectShape(option, path);
    }

    return { ...base, kind: 'union', discriminator, variants };
  }

  if (inner instanceof z.ZodUnion) {
    // A plain union has no tag to switch on, so a form cannot know which branch the user
    // means. JSON is honest about that rather than guessing.
    return { ...base, kind: 'json' };
  }

  if (inner instanceof z.ZodRecord) return { ...base, kind: 'json' };

  return { ...base, kind: 'unsupported' };
};

/** Reads a literal discriminator value out of a union branch. */
const discriminatorValue = (
  option: z.ZodObject<z.ZodRawShape>,
  discriminator: string,
): string | null => {
  const field = option.shape[discriminator];
  if (field === undefined) return null;

  const inner = unwrap(field as z.ZodTypeAny).schema;

  if (inner instanceof z.ZodLiteral) return String(inner.value);
  if (inner instanceof z.ZodEnum) return String((inner.options as string[])[0]);

  return null;
};

/**
 * Recognises a selector by its shape.
 *
 * A selector needs a purpose-built control - "pick an element on screen" - not a generic
 * nested object form with nine optional text fields. Detected structurally rather than by
 * a marker, so a third-party node using the same shape gets the good control for free.
 */
const isSelectorShape = (schema: z.ZodObject<z.ZodRawShape>): boolean => {
  const keys = Object.keys(schema.shape);
  return keys.includes('resourceId') && keys.includes('text') && keys.includes('className');
};

/** Field names that usually hold prose rather than a short value. */
const PROSE_FIELD_NAMES = ['text', 'body', 'message', 'template', 'description', 'prompt'];

const isProseField = (name: string): boolean =>
  PROSE_FIELD_NAMES.some((candidate) => name.toLowerCase() === candidate);

/**
 * Strips the wrappers that describe a field without changing its control.
 *
 * Optionality, defaults, and descriptions are captured on the way down. Without this,
 * `z.string().optional().default('x').describe('...')` would read as an unsupported
 * wrapper type and render as raw JSON.
 */
const unwrap = (
  schema: z.ZodTypeAny,
): {
  schema: z.ZodTypeAny;
  optional: boolean;
  defaultValue?: unknown;
  description?: string;
} => {
  let current = schema;
  let optional = false;
  let defaultValue: unknown;
  let description: string | undefined;

  for (;;) {
    description ??= current.description;

    if (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
      optional = true;
      current = current.unwrap() as z.ZodTypeAny;
      continue;
    }

    if (current instanceof z.ZodDefault) {
      // A field with a default is optional from the user's point of view, whatever the
      // type says.
      optional = true;
      defaultValue ??= current._def.defaultValue();
      current = current.removeDefault() as z.ZodTypeAny;
      continue;
    }

    if (current instanceof z.ZodEffects) {
      // A .refine() or .transform() wrapper. The constraint cannot be shown as a control,
      // so the inner shape drives the form and validation catches the rest.
      current = current.innerType() as z.ZodTypeAny;
      continue;
    }

    return { schema: current, optional, defaultValue, description };
  }
};

/** Every leaf path in a descriptor tree, for iterating a form's values. */
export const fieldPaths = (fields: readonly FieldDescriptor[]): readonly string[] =>
  fields.flatMap((field) =>
    field.children === undefined || field.kind === 'array' || field.kind === 'selector'
      ? [field.path]
      : fieldPaths(field.children),
  );

/** Reads a dotted path out of a config object. */
export const readPath = (value: unknown, path: string): unknown => {
  if (path === '') return value;

  let current = value;

  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
};

/**
 * Returns a copy with a dotted path set.
 *
 * Immutable because the config lives in a Zustand store, and mutating it in place would
 * skip the subscription that repaints the node.
 */
export const writePath = (value: unknown, path: string, next: unknown): unknown => {
  if (path === '') return next;

  const [head, ...rest] = path.split('.');
  const base = value !== null && typeof value === 'object' ? { ...(value as object) } : {};

  const target = base as Record<string, unknown>;

  target[head!] = rest.length === 0 ? next : writePath(target[head!] ?? {}, rest.join('.'), next);

  return target;
};

/** Drops a dotted path, for clearing an optional field. */
export const clearPath = (value: unknown, path: string): unknown => {
  if (value === null || typeof value !== 'object') return value;

  const [head, ...rest] = path.split('.');
  const copy = { ...(value as Record<string, unknown>) };

  if (rest.length === 0) {
    delete copy[head!];
    return copy;
  }

  copy[head!] = clearPath(copy[head!], rest.join('.'));
  return copy;
};
