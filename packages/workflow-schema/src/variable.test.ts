import { describe, expect, it } from 'vitest';

import {
  ValidatedVariableSchema,
  VariableSchema,
  initialValueOf,
  matchesVariableType,
} from './variable';

describe('variable schema', () => {
  it('accepts a typed variable with a default', () => {
    const variable = VariableSchema.parse({
      name: 'contactName',
      type: 'string',
      defaultValue: 'Robert',
    });

    expect(variable.name).toBe('contactName');
  });

  it('accepts a variable with no default', () => {
    expect(VariableSchema.parse({ name: 'count', type: 'number' }).defaultValue).toBeUndefined();
  });

  it('rejects a name that cannot be referenced by interpolation', () => {
    // Variables are referenced as {{ name }}, so a space or brace would make the
    // reference ambiguous to parse.
    expect(VariableSchema.safeParse({ name: 'contact name', type: 'string' }).success).toBe(false);
    expect(VariableSchema.safeParse({ name: '{{oops}}', type: 'string' }).success).toBe(false);
  });

  it('rejects a name starting with a digit', () => {
    expect(VariableSchema.safeParse({ name: '1st', type: 'string' }).success).toBe(false);
  });

  it('accepts underscores and digits after the first character', () => {
    expect(VariableSchema.safeParse({ name: '_retry_count2', type: 'number' }).success).toBe(true);
  });

  it('rejects an unknown type', () => {
    expect(VariableSchema.safeParse({ name: 'x', type: 'datetime' }).success).toBe(false);
  });

  it('accepts a nested object default', () => {
    const variable = VariableSchema.parse({
      name: 'contact',
      type: 'object',
      defaultValue: { name: 'Robert', numbers: ['+447700900123'], meta: { starred: true } },
    });

    expect(variable.defaultValue).toHaveProperty('meta.starred', true);
  });
});

describe('type checking', () => {
  it('matches primitives to their types', () => {
    expect(matchesVariableType('x', 'string')).toBe(true);
    expect(matchesVariableType(1, 'number')).toBe(true);
    expect(matchesVariableType(true, 'boolean')).toBe(true);
    expect(matchesVariableType([], 'array')).toBe(true);
    expect(matchesVariableType({}, 'object')).toBe(true);
  });

  it('does not treat an array as an object', () => {
    // typeof [] is 'object', so the naive check would let an array satisfy an
    // object variable and break the first node that read a property from it.
    expect(matchesVariableType([], 'object')).toBe(false);
  });

  it('does not treat null as an object', () => {
    expect(matchesVariableType(null, 'object')).toBe(false);
  });

  it('rejects NaN as a number', () => {
    expect(matchesVariableType(Number.NaN, 'number')).toBe(false);
  });

  it('rejects Infinity as a number', () => {
    expect(matchesVariableType(Number.POSITIVE_INFINITY, 'number')).toBe(false);
  });

  it('does not coerce a numeric string', () => {
    expect(matchesVariableType('12', 'number')).toBe(false);
  });
});

describe('ValidatedVariableSchema', () => {
  it('accepts a default matching its type', () => {
    expect(
      ValidatedVariableSchema.safeParse({ name: 'count', type: 'number', defaultValue: 3 }).success,
    ).toBe(true);
  });

  it('rejects a default of the wrong type', () => {
    // Left unchecked, this fails at the first node that uses the variable - far
    // from the mistake.
    const result = ValidatedVariableSchema.safeParse({
      name: 'count',
      type: 'number',
      defaultValue: 'hello',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['defaultValue']);
    }
  });

  it('accepts an absent default', () => {
    expect(ValidatedVariableSchema.safeParse({ name: 'count', type: 'number' }).success).toBe(true);
  });
});

describe('initialValueOf', () => {
  it('uses the declared default', () => {
    expect(initialValueOf({ name: 'n', type: 'string', defaultValue: 'hi' })).toBe('hi');
  });

  it('starts an undeclared variable as null rather than a type-appropriate zero', () => {
    // "" and 0 are real values a workflow might branch on, so inventing one would
    // hide the difference between "empty" and "never set".
    expect(initialValueOf({ name: 'n', type: 'string' })).toBeNull();
    expect(initialValueOf({ name: 'n', type: 'number' })).toBeNull();
    expect(initialValueOf({ name: 'n', type: 'boolean' })).toBeNull();
  });

  it('preserves a falsy default', () => {
    expect(initialValueOf({ name: 'n', type: 'number', defaultValue: 0 })).toBe(0);
    expect(initialValueOf({ name: 'n', type: 'boolean', defaultValue: false })).toBe(false);
    expect(initialValueOf({ name: 'n', type: 'string', defaultValue: '' })).toBe('');
  });
});
