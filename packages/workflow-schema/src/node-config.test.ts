import { describe, expect, it } from 'vitest';

import {
  ActionNodeConfigSchema,
  CORE_NODE_CONFIG_SCHEMAS,
  ConditionNodeConfigSchema,
  InputNodeConfigSchema,
  LoopNodeConfigSchema,
  MAX_LOOP_ITERATIONS,
  TransformNodeConfigSchema,
  TriggerNodeConfigSchema,
  ValueSourceSchema,
  VariableNodeConfigSchema,
  isUnaryOperator,
} from './node-config';

describe('ValueSource', () => {
  it('accepts a literal', () => {
    expect(ValueSourceSchema.parse({ from: 'literal', value: 'Robert' })).toEqual({
      from: 'literal',
      value: 'Robert',
    });
  });

  it('accepts a variable reference', () => {
    expect(ValueSourceSchema.parse({ from: 'variable', name: 'contactName' }).from).toBe(
      'variable',
    );
  });

  it('accepts a node output reference with a handle', () => {
    const source = ValueSourceSchema.parse({
      from: 'nodeOutput',
      nodeId: 'find_1',
      handle: 'element',
    });

    expect(source).toMatchObject({ nodeId: 'find_1', handle: 'element' });
  });

  it('rejects an unknown source kind', () => {
    expect(ValueSourceSchema.safeParse({ from: 'telepathy' }).success).toBe(false);
  });

  it('preserves a falsy literal', () => {
    // 0 and false are real values a workflow branches on.
    expect(ValueSourceSchema.parse({ from: 'literal', value: 0 })).toEqual({
      from: 'literal',
      value: 0,
    });
    expect(ValueSourceSchema.parse({ from: 'literal', value: false })).toEqual({
      from: 'literal',
      value: false,
    });
  });
});

describe('input node config', () => {
  it('defaults to required', () => {
    const config = InputNodeConfigSchema.parse({
      variableName: 'contactName',
      valueType: 'string',
      prompt: 'Who should I message?',
    });

    expect(config.required).toBe(true);
  });

  it('needs a prompt, since the user has to know what to enter', () => {
    expect(
      InputNodeConfigSchema.safeParse({ variableName: 'x', valueType: 'string', prompt: '' })
        .success,
    ).toBe(false);
  });
});

describe('action node config', () => {
  it('accepts a tool call with argument sources', () => {
    const config = ActionNodeConfigSchema.parse({
      tool: 'typeText',
      arguments: {
        text: { from: 'variable', name: 'message' },
      },
      assignTo: 'result',
    });

    expect(config.arguments.text).toMatchObject({ from: 'variable' });
  });

  it('defaults arguments to empty for a no-argument tool', () => {
    expect(ActionNodeConfigSchema.parse({ tool: 'pressBack' }).arguments).toEqual({});
  });

  it('requires a tool name', () => {
    expect(ActionNodeConfigSchema.safeParse({ tool: '' }).success).toBe(false);
  });
});

describe('condition node config', () => {
  it('accepts the element_exists form from Data_Models', () => {
    const config = ConditionNodeConfigSchema.parse({
      condition: { type: 'element_exists', selector: { text: 'Send' } },
    });

    expect(config.condition.type).toBe('element_exists');
    expect(config.negate).toBe(false);
  });

  it('rejects an element_exists condition whose selector cannot locate anything', () => {
    expect(
      ConditionNodeConfigSchema.safeParse({
        condition: { type: 'element_exists', selector: { className: 'Button' } },
      }).success,
    ).toBe(false);
  });

  it('accepts a comparison', () => {
    const config = ConditionNodeConfigSchema.parse({
      condition: {
        type: 'comparison',
        left: { from: 'variable', name: 'count' },
        operator: 'greaterThan',
        right: { from: 'literal', value: 3 },
      },
    });

    expect(config.condition).toMatchObject({ operator: 'greaterThan' });
  });

  it('rejects a binary comparison with no right-hand value', () => {
    // Without this check the workflow loads and then compares against undefined.
    const result = ConditionNodeConfigSchema.safeParse({
      condition: {
        type: 'comparison',
        left: { from: 'variable', name: 'count' },
        operator: 'greaterThan',
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('right-hand value');
    }
  });

  it('allows a unary operator with no right-hand value', () => {
    expect(
      ConditionNodeConfigSchema.safeParse({
        condition: {
          type: 'comparison',
          left: { from: 'variable', name: 'name' },
          operator: 'isEmpty',
        },
      }).success,
    ).toBe(true);
  });

  it('knows which operators are unary', () => {
    expect(isUnaryOperator('isEmpty')).toBe(true);
    expect(isUnaryOperator('isNotEmpty')).toBe(true);
    expect(isUnaryOperator('equals')).toBe(false);
  });

  it('accepts a current_app condition', () => {
    expect(
      ConditionNodeConfigSchema.safeParse({
        condition: { type: 'current_app', packageName: 'com.whatsapp' },
      }).success,
    ).toBe(true);
  });
});

describe('loop node config', () => {
  it('accepts a counted loop', () => {
    const config = LoopNodeConfigSchema.parse({ kind: 'count', iterations: 5 });
    expect(config).toMatchObject({ iterations: 5 });
  });

  it('accepts a forEach loop over a variable', () => {
    const config = LoopNodeConfigSchema.parse({
      kind: 'forEach',
      items: { from: 'variable', name: 'contacts' },
      itemVariable: 'contact',
    });

    expect(config).toMatchObject({ itemVariable: 'contact' });
  });

  it('requires maxIterations on a while loop', () => {
    // A while loop drives someone's phone; if its condition never becomes false
    // it would tap forever, so unbounded is not offered at all.
    expect(
      LoopNodeConfigSchema.safeParse({
        kind: 'while',
        condition: { type: 'element_exists', selector: { text: 'Next' } },
      }).success,
    ).toBe(false);
  });

  it('accepts a bounded while loop', () => {
    expect(
      LoopNodeConfigSchema.safeParse({
        kind: 'while',
        condition: { type: 'element_exists', selector: { text: 'Next' } },
        maxIterations: 20,
      }).success,
    ).toBe(true);
  });

  it('caps iterations at the hard ceiling', () => {
    expect(
      LoopNodeConfigSchema.safeParse({ kind: 'count', iterations: MAX_LOOP_ITERATIONS + 1 })
        .success,
    ).toBe(false);
  });

  it('rejects zero or negative iterations', () => {
    expect(LoopNodeConfigSchema.safeParse({ kind: 'count', iterations: 0 }).success).toBe(false);
    expect(LoopNodeConfigSchema.safeParse({ kind: 'count', iterations: -1 }).success).toBe(false);
  });
});

describe('variable node config', () => {
  it('defaults the operation to set', () => {
    const config = VariableNodeConfigSchema.parse({
      variableName: 'count',
      value: { from: 'literal', value: 1 },
    });

    expect(config.operation).toBe('set');
  });

  it('allows clear with no value', () => {
    expect(
      VariableNodeConfigSchema.safeParse({ variableName: 'count', operation: 'clear' }).success,
    ).toBe(true);
  });

  it('rejects set with no value', () => {
    const result = VariableNodeConfigSchema.safeParse({
      variableName: 'count',
      operation: 'set',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['value']);
    }
  });
});

describe('transform node config', () => {
  it('accepts a trim', () => {
    const config = TransformNodeConfigSchema.parse({
      input: { from: 'variable', name: 'name' },
      operation: 'trim',
      assignTo: 'cleanName',
    });

    expect(config.operation).toBe('trim');
  });

  it('requires a template for the template operation', () => {
    expect(
      TransformNodeConfigSchema.safeParse({
        input: { from: 'variable', name: 'name' },
        operation: 'template',
        assignTo: 'greeting',
      }).success,
    ).toBe(false);
  });

  it('requires a pattern for extract', () => {
    expect(
      TransformNodeConfigSchema.safeParse({
        input: { from: 'variable', name: 'text' },
        operation: 'extract',
        assignTo: 'code',
      }).success,
    ).toBe(false);
  });

  it('rejects a pattern that is not a valid regex', () => {
    // Compiled at load time so an invalid pattern names the field, rather than
    // throwing a SyntaxError halfway through a run.
    const result = TransformNodeConfigSchema.safeParse({
      input: { from: 'variable', name: 'text' },
      operation: 'extract',
      pattern: '([unclosed',
      assignTo: 'code',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('pattern'))).toBe(true);
    }
  });

  it('accepts a valid regex pattern', () => {
    expect(
      TransformNodeConfigSchema.safeParse({
        input: { from: 'variable', name: 'text' },
        operation: 'extract',
        pattern: '\\d{6}',
        assignTo: 'code',
      }).success,
    ).toBe(true);
  });

  it('requires somewhere to put the result', () => {
    expect(
      TransformNodeConfigSchema.safeParse({
        input: { from: 'variable', name: 'name' },
        operation: 'trim',
      }).success,
    ).toBe(false);
  });
});

describe('trigger node config', () => {
  it('accepts a manual trigger', () => {
    expect(TriggerNodeConfigSchema.parse({ kind: 'manual' }).kind).toBe('manual');
  });

  it('accepts a schedule and defaults to every day', () => {
    const config = TriggerNodeConfigSchema.parse({ kind: 'schedule', hour: 9, minute: 0 });

    expect(config).toMatchObject({ hour: 9, minute: 0 });
    if (config.kind === 'schedule') expect(config.daysOfWeek).toEqual([]);
  });

  it('rejects an out-of-range time', () => {
    expect(
      TriggerNodeConfigSchema.safeParse({ kind: 'schedule', hour: 24, minute: 0 }).success,
    ).toBe(false);
    expect(
      TriggerNodeConfigSchema.safeParse({ kind: 'schedule', hour: 9, minute: 60 }).success,
    ).toBe(false);
  });

  it('rejects an invalid ISO weekday', () => {
    expect(
      TriggerNodeConfigSchema.safeParse({
        kind: 'schedule',
        hour: 9,
        minute: 0,
        daysOfWeek: [0],
      }).success,
    ).toBe(false);
  });

  it('accepts an app-launch trigger', () => {
    expect(
      TriggerNodeConfigSchema.safeParse({ kind: 'appLaunch', packageName: 'com.whatsapp' }).success,
    ).toBe(true);
  });
});

describe('core config registry', () => {
  it('has a schema for every generic node kind', () => {
    expect(Object.keys(CORE_NODE_CONFIG_SCHEMAS).sort()).toEqual([
      'action',
      'condition',
      'input',
      'loop',
      'transform',
      'trigger',
      'variable',
    ]);
  });
});
