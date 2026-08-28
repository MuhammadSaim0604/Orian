import {
  type FieldDescriptor,
  clearPath,
  describeSchema,
  readPath,
  writePath,
} from '@mobile-automation/node-sdk';
import { Field, NumberField, Select, TextField, Toggle } from '@mobile-automation/ui';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { type z } from 'zod';

/**
 * The node config form, generated from the node's own Zod schema.
 *
 * This is what lets the builder edit a node it has never heard of - including one from a
 * package installed after the app shipped. A hand-written form per node type could not do
 * that, and would drift from the schema the executor actually validates against.
 *
 * Validation runs on every change but **only valid config is written back**. A half-typed
 * value would otherwise be committed to the store and then rejected at load time, so the
 * user would see their workflow refuse to run for something they were in the middle of
 * fixing.
 */

export interface SchemaFormProps {
  readonly schema: z.ZodTypeAny;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
  /** Opens the element picker for a selector field. */
  readonly onPickElement?: (path: string) => void;
}

export const SchemaForm = ({ schema, value, onChange, onPickElement }: SchemaFormProps) => {
  const fields = useMemo(() => describeSchema(schema), [schema]);

  // Errors are held here rather than derived, so a field the user has not touched does not
  // show an error for being empty.
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});

  const update = (path: string, next: unknown) => {
    const candidate = next === undefined ? clearPath(value, path) : writePath(value, path, next);

    const result = schema.safeParse(candidate);

    if (result.success) {
      setErrors({});
      onChange(candidate);
      return;
    }

    // Written back anyway when the *only* problems are elsewhere in the form, so a user can
    // fill fields in any order rather than being blocked until the whole config is valid.
    const relevant = result.error.issues.filter((issue) => issue.path.join('.') === path);

    setErrors(
      Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message])),
    );

    if (relevant.length === 0) onChange(candidate);
  };

  if (fields.length === 0) {
    return <Text className="text-xs text-text-muted">This node has nothing to configure.</Text>;
  }

  return (
    <View className="gap-3">
      {fields.map((field) => (
        <FieldControl
          key={field.path}
          field={field}
          value={value}
          error={errors[field.path]}
          onChange={update}
          onPickElement={onPickElement}
        />
      ))}
    </View>
  );
};

const FieldControl = ({
  field,
  value,
  error,
  onChange,
  onPickElement,
}: {
  readonly field: FieldDescriptor;
  readonly value: unknown;
  readonly error?: string;
  readonly onChange: (path: string, next: unknown) => void;
  readonly onPickElement?: (path: string) => void;
}) => {
  const current = readPath(value, field.path);
  const label = humanise(field.name);

  switch (field.kind) {
    case 'text':
    case 'multilineText':
      return (
        <Field label={label} hint={field.description} error={error} optional={field.optional}>
          <TextField
            accessibilityLabel={label}
            value={typeof current === 'string' ? current : ''}
            onChangeText={(next) => onChange(field.path, next === '' ? undefined : next)}
            placeholder={field.defaultValue === undefined ? undefined : String(field.defaultValue)}
            multiline={field.kind === 'multilineText'}
            invalid={error !== undefined}
          />
        </Field>
      );

    case 'number':
    case 'integer':
      return (
        <Field label={label} hint={field.description} error={error} optional={field.optional}>
          <NumberField
            accessibilityLabel={label}
            value={typeof current === 'number' ? current : undefined}
            onChange={(next) => onChange(field.path, next)}
            integer={field.kind === 'integer'}
            min={field.min}
            max={field.max}
            placeholder={field.defaultValue === undefined ? undefined : String(field.defaultValue)}
            invalid={error !== undefined}
          />
        </Field>
      );

    case 'boolean':
      return (
        <Field label={label} hint={field.description} error={error} optional={field.optional}>
          <Toggle
            accessibilityLabel={label}
            value={current === true || (current === undefined && field.defaultValue === true)}
            onChange={(next) => onChange(field.path, next)}
          />
        </Field>
      );

    case 'enum':
      return (
        <Field label={label} hint={field.description} error={error} optional={field.optional}>
          <Select
            accessibilityLabel={label}
            value={typeof current === 'string' ? current : (field.defaultValue as string)}
            options={(field.enumValues ?? []).map((option) => ({
              value: option,
              label: humanise(option),
            }))}
            onChange={(next) => onChange(field.path, next)}
          />
        </Field>
      );

    case 'selector':
      return (
        <SelectorField
          field={field}
          current={current}
          error={error}
          label={label}
          onChange={onChange}
          onPickElement={onPickElement}
        />
      );

    case 'union':
      return (
        <UnionField
          field={field}
          value={value}
          error={error}
          label={label}
          onChange={onChange}
          onPickElement={onPickElement}
        />
      );

    case 'object':
      return (
        <View className="gap-3 rounded-lg border border-border p-3">
          <Text className="text-xs font-semibold uppercase text-text-muted">{label}</Text>
          {(field.children ?? []).map((child) => (
            <FieldControl
              key={child.path}
              field={child}
              value={value}
              onChange={onChange}
              onPickElement={onPickElement}
            />
          ))}
        </View>
      );

    case 'array':
    case 'json':
    case 'unsupported':
      // A raw JSON editor rather than nothing: an exotic field stays editable instead of
      // being silently uneditable, which would make the node unusable.
      return (
        <Field
          label={label}
          hint={field.description ?? 'Edit as JSON'}
          error={error}
          optional={field.optional}
        >
          <TextField
            accessibilityLabel={`${label} as JSON`}
            value={current === undefined ? '' : JSON.stringify(current)}
            onChangeText={(text) => {
              if (text.trim() === '') {
                onChange(field.path, undefined);
                return;
              }

              try {
                onChange(field.path, JSON.parse(text));
              } catch {
                // Ignored while typing: JSON is invalid for most of the time it takes to
                // write, and rejecting each keystroke would make the field unusable.
              }
            }}
            multiline
            invalid={error !== undefined}
          />
        </Field>
      );
  }
};

/**
 * A selector field.
 *
 * Shows what the selector currently matches on and offers the element picker, rather than
 * exposing nine optional text inputs. The picker is what makes a durable selector the easy
 * choice - typing a resourceId by hand is something nobody will do (ADR 0009).
 */
const SelectorField = ({
  field,
  current,
  error,
  label,
  onChange,
  onPickElement,
}: {
  readonly field: FieldDescriptor;
  readonly current: unknown;
  readonly error?: string;
  readonly label: string;
  readonly onChange: (path: string, next: unknown) => void;
  readonly onPickElement?: (path: string) => void;
}) => {
  const selector = (current ?? {}) as Record<string, unknown>;

  const summary = describeSelector(selector);

  return (
    <Field
      label={label}
      hint={field.description ?? 'Which element on screen this acts on'}
      error={error}
      optional={field.optional}
    >
      <View className="gap-2">
        <View className="rounded-lg border border-border bg-surface-muted p-3">
          <Text className="text-sm text-text-primary">{summary ?? 'No element chosen'}</Text>
          {summary !== null && (
            <Text className="mt-0.5 text-xs text-text-muted">{strategyOf(selector)}</Text>
          )}
        </View>

        <View className="flex-row gap-2">
          {onPickElement !== undefined && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Pick an element from the screen"
              onPress={() => onPickElement(field.path)}
              className="flex-1 items-center rounded-md border border-border bg-surface px-3 py-2"
            >
              <Text className="text-xs font-medium text-primary">Pick from screen</Text>
            </Pressable>
          )}

          <View className="flex-1">
            <TextField
              accessibilityLabel="Match by visible text"
              value={typeof selector.text === 'string' ? selector.text : ''}
              onChangeText={(text) =>
                onChange(field.path, text === '' ? undefined : { ...selector, text })
              }
              placeholder="or type visible text"
            />
          </View>
        </View>
      </View>
    </Field>
  );
};

/**
 * A discriminated union field.
 *
 * The branch is chosen first, then only that branch's fields appear. Showing every variant's
 * fields at once would present combinations the schema rejects, and the user would have no
 * way to tell which ones belong together.
 */
const UnionField = ({
  field,
  value,
  error,
  label,
  onChange,
  onPickElement,
}: {
  readonly field: FieldDescriptor;
  readonly value: unknown;
  readonly error?: string;
  readonly label: string;
  readonly onChange: (path: string, next: unknown) => void;
  readonly onPickElement?: (path: string) => void;
}) => {
  const discriminator = field.discriminator!;
  const variants = field.variants ?? {};

  const current = readPath(value, field.path) as Record<string, unknown> | undefined;
  const activeTag =
    typeof current?.[discriminator] === 'string'
      ? (current[discriminator] as string)
      : Object.keys(variants)[0];

  const activeFields = activeTag === undefined ? [] : (variants[activeTag] ?? []);

  return (
    <View className="gap-3 rounded-lg border border-border p-3">
      <Field label={label} hint={field.description} error={error}>
        <Select
          accessibilityLabel={`${label} type`}
          value={activeTag}
          options={Object.keys(variants).map((tag) => ({ value: tag, label: humanise(tag) }))}
          onChange={(tag) =>
            // Switching branch replaces the whole object rather than merging: keeping the old
            // branch's fields would leave keys the new branch's schema rejects.
            onChange(field.path, { [discriminator]: tag })
          }
        />
      </Field>

      {activeFields
        .filter((child) => child.name !== discriminator)
        .map((child) => (
          <FieldControl
            key={child.path}
            field={child}
            value={value}
            onChange={onChange}
            onPickElement={onPickElement}
          />
        ))}
    </View>
  );
};

/** `resourceId` becomes "Resource id"; `maxIterations` becomes "Max iterations". */
const humanise = (name: string): string => {
  if (name === '') return 'Value';

  const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
};

/** The most recognisable thing about a selector, for a one-line summary. */
const describeSelector = (selector: Record<string, unknown>): string | null => {
  for (const key of ['text', 'contentDescription', 'resourceId'] as const) {
    const candidate = selector[key];
    if (typeof candidate === 'string' && candidate !== '') return candidate;
  }

  if (selector.coordinates !== undefined) return 'A fixed screen position';

  return null;
};

/**
 * How the selector will be resolved, stated plainly.
 *
 * Worth surfacing because it tells the user how durable their step is, and a coordinate
 * selector is the one they should want to replace.
 */
const strategyOf = (selector: Record<string, unknown>): string => {
  if (typeof selector.resourceId === 'string') return 'By id — survives app updates';
  if (typeof selector.contentDescription === 'string') return 'By accessibility label';
  if (typeof selector.text === 'string')
    return 'By visible text — may break if the app is translated';
  return 'By position — will break if the layout changes';
};
