import {
  createRecordingToolInvoker,
  createTestContext,
  createVariableStore,
  executeNode,
} from '@mobile-automation/node-sdk';
import { describe, expect, it } from 'vitest';

import { actionNode } from './action-node';
import { inputNode } from './input-node';
import { transformNode } from './transform-node';
import { triggerNode } from './trigger-node';
import { variableNode } from './variable-node';

describe('input node', () => {
  it('accepts a value the engine collected before the run', async () => {
    // The engine seeds the store from the user's answers, so by the time this runs
    // the value is already present; prompting mid-run would stall the workflow
    // behind another app.
    const store = createVariableStore({ contactName: 'Robert' });

    const result = await executeNode(inputNode, {
      ...createTestContext({ config: {}, variables: store }),
      config: { variableName: 'contactName', valueType: 'string', prompt: 'Who?' },
    });

    expect(result.outputs?.result).toBe('Robert');
    expect(store.get('contactName')).toBe('Robert');
  });

  it('falls back to the default', async () => {
    const store = createVariableStore();

    await executeNode(inputNode, {
      ...createTestContext({ config: {}, variables: store }),
      config: {
        variableName: 'greeting',
        valueType: 'string',
        prompt: 'Say what?',
        defaultValue: 'hello',
      },
    });

    expect(store.get('greeting')).toBe('hello');
  });

  it('asks the user to act when a required value is missing', async () => {
    await expect(
      executeNode(inputNode, {
        ...createTestContext({ config: {} }),
        config: { variableName: 'contactName', valueType: 'string', prompt: 'Who?' },
      }),
    ).rejects.toThrow(/is required/);
  });

  it('allows an absent optional value', async () => {
    const store = createVariableStore();

    await executeNode(inputNode, {
      ...createTestContext({ config: {}, variables: store }),
      config: {
        variableName: 'note',
        valueType: 'string',
        prompt: 'Any note?',
        required: false,
      },
    });

    expect(store.get('note')).toBeNull();
  });

  it('rejects a value of the wrong type', async () => {
    const store = createVariableStore({ count: 'twelve' });

    await expect(
      executeNode(inputNode, {
        ...createTestContext({ config: {}, variables: store }),
        config: { variableName: 'count', valueType: 'number', prompt: 'How many?' },
      }),
    ).rejects.toThrow(/should be a number/);
  });
});

describe('action node', () => {
  it('resolves argument sources and invokes the tool', async () => {
    const tools = createRecordingToolInvoker({ typeText: () => undefined });
    const store = createVariableStore({ message: 'I will be late' });

    await executeNode(actionNode, {
      ...createTestContext({ config: {}, tools, variables: store }),
      config: {
        tool: 'typeText',
        arguments: {
          text: { from: 'variable', name: 'message' },
          selector: { from: 'literal', value: { resourceId: 'entry' } },
        },
      },
    });

    expect(tools.calls[0]).toEqual({
      tool: 'typeText',
      args: { text: 'I will be late', selector: { resourceId: 'entry' } },
    });
  });

  it('stores the result when asked', async () => {
    const tools = createRecordingToolInvoker({
      getCurrentScreen: () => ({ packageName: 'com.x' }),
    });
    const store = createVariableStore();

    await executeNode(actionNode, {
      ...createTestContext({ config: {}, tools, variables: store }),
      config: { tool: 'getCurrentScreen', assignTo: 'screen' },
    });

    expect(store.get('screen')).toEqual({ packageName: 'com.x' });
  });

  it('reports a tool failure as a node failure naming the tool', async () => {
    const tools = createRecordingToolInvoker({
      click: () => {
        throw new Error('element_not_found');
      },
    });

    await expect(
      executeNode(actionNode, {
        ...createTestContext({ config: {}, tools }),
        config: { tool: 'click', arguments: {} },
      }),
    ).rejects.toThrow(/element_not_found/);
  });

  it('refuses to run with no device attached', async () => {
    await expect(
      executeNode(actionNode, {
        ...createTestContext({ config: {} }),
        config: { tool: 'click', arguments: {} },
      }),
    ).rejects.toThrow(/no device is attached/);
  });
});

describe('variable node', () => {
  const set = async (config: unknown, store = createVariableStore()) => {
    await executeNode(variableNode, {
      ...createTestContext({ config: {}, variables: store }),
      config,
    });
    return store;
  };

  it('sets a value', async () => {
    const store = await set({
      variableName: 'name',
      operation: 'set',
      value: { from: 'literal', value: 'Robert' },
    });

    expect(store.get('name')).toBe('Robert');
  });

  it('increments from zero when the counter does not exist yet', async () => {
    // "Increment a variable I have not created" is what a user means by counting.
    const store = await set({
      variableName: 'count',
      operation: 'increment',
      value: { from: 'literal', value: 1 },
    });

    expect(store.get('count')).toBe(1);
  });

  it('increments an existing counter', async () => {
    const store = await set(
      { variableName: 'count', operation: 'increment', value: { from: 'literal', value: 2 } },
      createVariableStore({ count: 5 }),
    );

    expect(store.get('count')).toBe(7);
  });

  it('refuses to increment something that is not a number', async () => {
    await expect(
      set(
        { variableName: 'name', operation: 'increment', value: { from: 'literal', value: 1 } },
        createVariableStore({ name: 'Robert' }),
      ),
    ).rejects.toThrow(/cannot increment/);
  });

  it('appending to nothing creates a list', async () => {
    // What "collect these as I go" means inside a loop.
    const store = await set({
      variableName: 'found',
      operation: 'append',
      value: { from: 'literal', value: 'a' },
    });

    expect(store.get('found')).toEqual(['a']);
  });

  it('appends to an existing list', async () => {
    const store = await set(
      { variableName: 'found', operation: 'append', value: { from: 'literal', value: 'b' } },
      createVariableStore({ found: ['a'] }),
    );

    expect(store.get('found')).toEqual(['a', 'b']);
  });

  it('concatenates when appending to a string', async () => {
    const store = await set(
      { variableName: 'text', operation: 'append', value: { from: 'literal', value: '!' } },
      createVariableStore({ text: 'hi' }),
    );

    expect(store.get('text')).toBe('hi!');
  });

  it('clears to null rather than deleting the key', async () => {
    // A later condition may still ask about this variable; "cleared" is a more
    // useful answer than "never existed".
    const store = await set(
      { variableName: 'name', operation: 'clear' },
      createVariableStore({ name: 'Robert' }),
    );

    expect(store.get('name')).toBeNull();
    expect(store.has('name')).toBe(true);
  });
});

describe('transform node', () => {
  const transform = async (config: unknown, store = createVariableStore()) => {
    const result = await executeNode(transformNode, {
      ...createTestContext({ config: {}, variables: store }),
      config,
    });
    return { result, store };
  };

  it('trims whitespace', async () => {
    // The single most common reason a selector fails to match something visibly on
    // screen.
    const { store } = await transform({
      input: { from: 'literal', value: '  Robert  ' },
      operation: 'trim',
      assignTo: 'name',
    });

    expect(store.get('name')).toBe('Robert');
  });

  it('changes case', async () => {
    const lower = await transform({
      input: { from: 'literal', value: 'ROBERT' },
      operation: 'lowercase',
      assignTo: 'x',
    });
    expect(lower.store.get('x')).toBe('robert');

    const upper = await transform({
      input: { from: 'literal', value: 'robert' },
      operation: 'uppercase',
      assignTo: 'x',
    });
    expect(upper.store.get('x')).toBe('ROBERT');
  });

  it('splits on a comma by default', async () => {
    const { store } = await transform({
      input: { from: 'literal', value: 'a,b,c' },
      operation: 'split',
      assignTo: 'parts',
    });

    expect(store.get('parts')).toEqual(['a', 'b', 'c']);
  });

  it('splits on a given separator', async () => {
    const { store } = await transform({
      input: { from: 'literal', value: 'a|b' },
      operation: 'split',
      separator: '|',
      assignTo: 'parts',
    });

    expect(store.get('parts')).toEqual(['a', 'b']);
  });

  it('joins a list', async () => {
    const { store } = await transform({
      input: { from: 'literal', value: ['a', 'b'] },
      operation: 'join',
      separator: ' and ',
      assignTo: 'text',
    });

    expect(store.get('text')).toBe('a and b');
  });

  it('refuses to join something that is not a list', async () => {
    await expect(
      transform({
        input: { from: 'literal', value: 'not a list' },
        operation: 'join',
        assignTo: 'x',
      }),
    ).rejects.toThrow(/needs a list/);
  });

  it('parses a number', async () => {
    const { store } = await transform({
      input: { from: 'literal', value: ' 42 ' },
      operation: 'parseNumber',
      assignTo: 'n',
    });

    expect(store.get('n')).toBe(42);
  });

  it('fails on text that is not a number', async () => {
    await expect(
      transform({
        input: { from: 'literal', value: 'twelve' },
        operation: 'parseNumber',
        assignTo: 'n',
      }),
    ).rejects.toThrow(/as a number/);
  });

  it('parses and stringifies JSON', async () => {
    const parsed = await transform({
      input: { from: 'literal', value: '{"a":1}' },
      operation: 'parseJson',
      assignTo: 'obj',
    });
    expect(parsed.store.get('obj')).toEqual({ a: 1 });

    const encoded = await transform({
      input: { from: 'literal', value: { a: 1 } },
      operation: 'stringify',
      assignTo: 'text',
    });
    expect(encoded.store.get('text')).toBe('{"a":1}');
  });

  it('fails on malformed JSON', async () => {
    await expect(
      transform({
        input: { from: 'literal', value: '{not json' },
        operation: 'parseJson',
        assignTo: 'obj',
      }),
    ).rejects.toThrow(/as JSON/);
  });

  it('renders a template from the variable store', async () => {
    const { store } = await transform(
      {
        input: { from: 'literal', value: null },
        operation: 'template',
        template: 'Hi {{ name }}, running {{ minutes }} minutes late',
        assignTo: 'message',
      },
      createVariableStore({ name: 'Robert', minutes: 10 }),
    );

    expect(store.get('message')).toBe('Hi Robert, running 10 minutes late');
  });

  it('extracts the first capture group when there is one', async () => {
    // A user writing a group means "this part", not "everything that matched".
    const { store } = await transform({
      input: { from: 'literal', value: 'code: 123456' },
      operation: 'extract',
      pattern: 'code: (\\d+)',
      assignTo: 'code',
    });

    expect(store.get('code')).toBe('123456');
  });

  it('extracts the whole match when there is no group', async () => {
    const { store } = await transform({
      input: { from: 'literal', value: 'abc 123' },
      operation: 'extract',
      pattern: '\\d+',
      assignTo: 'n',
    });

    expect(store.get('n')).toBe('123');
  });

  it('yields null when the pattern does not match', async () => {
    const { store } = await transform({
      input: { from: 'literal', value: 'nothing here' },
      operation: 'extract',
      pattern: '\\d+',
      assignTo: 'n',
    });

    expect(store.get('n')).toBeNull();
  });
});

describe('trigger node', () => {
  it('records a manual start', async () => {
    const result = await executeNode(triggerNode, {
      ...createTestContext({ config: {} }),
      config: { kind: 'manual' },
    });

    expect(result.summary).toContain('manually');
    expect(result.outputs?.triggerKind).toBe('manual');
  });

  it('describes a scheduled start', async () => {
    const result = await executeNode(triggerNode, {
      ...createTestContext({ config: {} }),
      config: { kind: 'schedule', hour: 9, minute: 5 },
    });

    expect(result.summary).toContain('09:05');
  });

  it('describes an app-launch start', async () => {
    const result = await executeNode(triggerNode, {
      ...createTestContext({ config: {} }),
      config: { kind: 'appLaunch', packageName: 'com.whatsapp' },
    });

    expect(result.summary).toContain('com.whatsapp');
  });

  it('publishes when it started, for the execution log', async () => {
    const result = await executeNode(triggerNode, {
      ...createTestContext({ config: {} }),
      config: { kind: 'manual' },
    });

    expect(typeof result.outputs?.startedAtEpochMs).toBe('number');
  });
});
