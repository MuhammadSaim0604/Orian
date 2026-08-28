import { describe, expect, it } from 'vitest';

import { TOOL_NAMES, toolCallJsonSchema, toolsForRequest, validateToolCall } from './index';

describe('validateToolCall', () => {
  it('accepts a well-formed call', () => {
    const result = validateToolCall({
      name: 'click',
      arguments: '{"selector":{"text":"Send"}}',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.call.name).toBe('click');
      expect(result.call.arguments).toEqual({ selector: { text: 'Send' } });
    }
  });

  it('accepts already-parsed arguments', () => {
    const result = validateToolCall({
      name: 'openApp',
      arguments: { packageName: 'com.whatsapp' },
    });

    expect(result.ok).toBe(true);
  });

  it('carries the provider call id through, so a result can be matched to its call', () => {
    const result = validateToolCall({
      id: 'call_abc123',
      name: 'pressBack',
      arguments: '{}',
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.call.id).toBe('call_abc123');
  });

  it('treats empty arguments as an empty object', () => {
    // Providers send "" for a no-argument tool.
    const result = validateToolCall({ name: 'pressHome', arguments: '' });

    expect(result.ok).toBe(true);
  });

  it('attaches the definition, so the caller need not look it up again', () => {
    const result = validateToolCall({ name: 'getUiTree', arguments: '{}' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.call.definition.impact).toBe('read');
  });
});

describe('rejections', () => {
  it('rejects an unknown tool and lists the real ones', () => {
    // Turns a dead end into a correctable mistake.
    const result = validateToolCall({ name: 'sendWhatsApp', arguments: '{}' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unknown-tool');
      expect(result.message).toContain('sendWhatsApp');
      expect(result.message).toContain('typeText');
    }
  });

  it('rejects malformed JSON with a correction, not a stack trace', () => {
    // A truncated response is a routine cause, and the message goes straight into
    // the next prompt.
    const result = validateToolCall({ name: 'click', arguments: '{"selector":{"text":' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('malformed-json');
      expect(result.message).toContain('valid JSON');
    }
  });

  it('names the field at fault in bad arguments', () => {
    const result = validateToolCall({
      name: 'swipe',
      arguments: '{"direction":"sideways"}',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid-arguments');
      expect(result.message).toContain('direction');
    }
  });

  it('rejects a selector that cannot locate anything', () => {
    const result = validateToolCall({
      name: 'click',
      arguments: '{"selector":{"className":"Button"}}',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid-arguments');
  });

  it('rejects an invented argument rather than dropping it', () => {
    const result = validateToolCall({
      name: 'typeText',
      arguments: '{"selector":{"text":"Message"},"text":"hi","pressEnter":true}',
    });

    expect(result.ok).toBe(false);
  });

  it('always names the tool, so a rejection can be reported usefully', () => {
    const rejections = [
      validateToolCall({ name: 'nope', arguments: '{}' }),
      validateToolCall({ name: 'click', arguments: 'not json' }),
      validateToolCall({ name: 'click', arguments: '{}' }),
    ];

    for (const rejection of rejections) {
      expect(rejection.ok).toBe(false);
      if (!rejection.ok) expect(rejection.toolName.length).toBeGreaterThan(0);
    }
  });
});

describe('JSON Schema generation', () => {
  it('produces an object schema with the right required fields', () => {
    const schema = toolCallJsonSchema('openApp');

    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(['packageName']);
    expect(schema.additionalProperties).toBe(false);
  });

  it('omits optional fields from required', () => {
    const schema = toolCallJsonSchema('swipe') as {
      required: string[];
      properties: Record<string, unknown>;
    };

    expect(schema.required).toEqual(['direction']);
    expect(schema.properties.distanceFraction).toBeDefined();
  });

  it('renders an enum as a string with allowed values', () => {
    const schema = toolCallJsonSchema('controlMedia') as {
      properties: { command: { type: string; enum: string[] } };
    };

    expect(schema.properties.command.type).toBe('string');
    expect(schema.properties.command.enum).toContain('play_pause');
  });

  it('distinguishes integers from numbers', () => {
    const schema = toolCallJsonSchema('createAlarm') as {
      properties: { hour: { type: string } };
    };

    expect(schema.properties.hour.type).toBe('integer');
  });

  it('renders an array of integers', () => {
    const schema = toolCallJsonSchema('createAlarm') as {
      properties: { repeatDays: { type: string; items: { type: string } } };
    };

    expect(schema.properties.repeatDays.type).toBe('array');
    expect(schema.properties.repeatDays.items.type).toBe('integer');
  });

  it('unwraps a refined schema so the selector still renders', () => {
    // SelectorArgSchema is wrapped in .refine(); without unwrapping, the model would
    // be given an empty schema and could not construct a selector at all.
    const schema = toolCallJsonSchema('click') as {
      properties: { selector: { type: string; properties: Record<string, unknown> } };
    };

    expect(schema.properties.selector.type).toBe('object');
    expect(schema.properties.selector.properties.resourceId).toBeDefined();
    expect(schema.properties.selector.properties.text).toBeDefined();
  });

  it('renders a record as an open object', () => {
    const schema = toolCallJsonSchema('launchIntent') as {
      properties: { extras: { type: string; additionalProperties: { type: string } } };
    };

    expect(schema.properties.extras.additionalProperties.type).toBe('string');
  });

  it('produces a schema for every tool without throwing', () => {
    for (const name of TOOL_NAMES) {
      expect(toolCallJsonSchema(name).type).toBe('object');
    }
  });
});

describe('toolsForRequest', () => {
  it('shapes every tool for a Chat Completions request', () => {
    const tools = toolsForRequest();

    expect(tools).toHaveLength(TOOL_NAMES.length);
    expect(tools[0]?.type).toBe('function');
  });

  it('includes what the tool returns in its description', () => {
    // The model needs to know what it will get back to plan the next step.
    const tools = toolsForRequest(['findElement']);

    expect(tools[0]?.function.description).toContain('Returns:');
  });

  it('can be narrowed to a subset, for a read-only agent mode', () => {
    const tools = toolsForRequest(['getUiTree', 'findElement']);

    expect(tools.map((tool) => tool.function.name)).toEqual(['getUiTree', 'findElement']);
  });
});
