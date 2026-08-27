import { describe, expect, it } from 'vitest';

import { SelectorSchema } from './selector';
import {
  SchemaValidationError,
  formatPath,
  isSchemaValidationError,
  parseOrThrow,
  validate,
} from './validation';
import { WorkflowSchema } from './workflow';

describe('formatPath', () => {
  it('joins object keys with dots', () => {
    expect(formatPath(['metadata', 'name'])).toBe('metadata.name');
  });

  it('renders array indices inline', () => {
    expect(formatPath(['nodes', 2, 'config', 'selector'])).toBe('nodes[2].config.selector');
  });

  it('handles a leading index', () => {
    expect(formatPath([0, 'id'])).toBe('[0].id');
  });

  it('returns empty for a root-level problem', () => {
    expect(formatPath([])).toBe('');
  });
});

describe('validate', () => {
  it('returns the parsed value on success', () => {
    const result = validate(SelectorSchema, { text: 'Send' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.text).toBe('Send');
  });

  it('returns located issues on failure rather than throwing', () => {
    // Invalid input is expected in normal use - a mistyped selector, a
    // not-quite-right model response - so it is a result, not an exception.
    const result = validate(SelectorSchema, { className: 'Button' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toHaveLength(1);
      expect(result.summary).toContain('locating field');
    }
  });

  it('names the field at fault in a nested document', () => {
    const result = validate(WorkflowSchema, {
      id: 'wf_1',
      metadata: {
        name: 'Test',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      nodes: [{ id: 'n1', type: 'click', metadata: { label: '', position: { x: 0, y: 0 } } }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.path).toBe('nodes[0].metadata.label');
    }
  });

  it('summarises several issues on one line for logs', () => {
    const result = validate(WorkflowSchema, { id: '', metadata: {}, nodes: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.summary).toContain(';');
      expect(result.issues.length).toBeGreaterThan(1);
    }
  });
});

describe('parseOrThrow', () => {
  it('returns the value when valid', () => {
    expect(parseOrThrow(SelectorSchema, { text: 'Send' }, 'selector').text).toBe('Send');
  });

  it('throws a readable error naming what failed', () => {
    expect(() => parseOrThrow(SelectorSchema, {}, 'selector')).toThrow(/Invalid selector/);
  });

  it('carries the issues on the thrown error', () => {
    try {
      parseOrThrow(SelectorSchema, {}, 'selector');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isSchemaValidationError(error)).toBe(true);
      if (isSchemaValidationError(error)) {
        expect(error.issues.length).toBeGreaterThan(0);
      }
    }
  });

  it('is recognisable with instanceof after transpilation', () => {
    // Subclassing Error loses the prototype chain when transpiled, so the
    // constructor restores it; without that, catch blocks silently miss.
    const error = new SchemaValidationError('workflow', [{ path: 'id', message: 'required' }]);

    expect(error).toBeInstanceOf(SchemaValidationError);
    expect(error).toBeInstanceOf(Error);
  });
});
