import { androidNodes } from '@mobile-automation/android-nodes';
import { coreNodes } from '@mobile-automation/core-nodes';
import { NodeRegistry, createRecordingToolInvoker } from '@mobile-automation/node-sdk';
import { describe, expect, it } from 'vitest';

import { registerBuiltInNodes } from './discovery';
import { type ExecutionEvent } from './events';
import { runWorkflow } from './executor';

/**
 * The end-to-end test the phase asks for: the real core and Android node packages,
 * the real registry, the real engine, against a fake device.
 *
 * Everything except the phone is genuine. That is the point - it proves the packages
 * fit together, and it is the test that would have caught a node wired to a tool the
 * runtime does not expose, or a config schema the engine cannot satisfy.
 */

const registry = () => {
  const reg = new NodeRegistry();

  registerBuiltInNodes(reg, [
    { name: '@mobile-automation/core-nodes', nodes: coreNodes },
    { name: '@mobile-automation/android-nodes', nodes: androidNodes },
  ]);

  return reg;
};

const metadata = (label: string, x = 0) => ({ label, position: { x, y: 0 } });

/** The flagship scenario: message a contact in WhatsApp. */
const messageWorkflow = {
  id: 'wf_whatsapp',
  metadata: {
    name: 'Message Robert',
    description: "Tell Robert I'll be late",
    createdAt: '2026-01-01T09:00:00.000Z',
    updatedAt: '2026-01-01T09:00:00.000Z',
  },
  variables: [
    { name: 'contactName', type: 'string', defaultValue: 'Robert' },
    { name: 'message', type: 'string', defaultValue: "I'll be late tomorrow" },
  ],
  nodes: [
    { id: 'start', type: 'trigger', config: { kind: 'manual' }, metadata: metadata('Start') },
    {
      id: 'open',
      type: 'openApp',
      config: { packageName: 'com.whatsapp' },
      metadata: metadata('Open WhatsApp', 200),
    },
    {
      id: 'find_search',
      type: 'findElement',
      config: { selector: { resourceId: 'com.whatsapp:id/menuitem_search' } },
      metadata: metadata('Find search', 400),
    },
    {
      id: 'tap_search',
      type: 'click',
      config: { selector: { resourceId: 'com.whatsapp:id/menuitem_search' } },
      metadata: metadata('Tap search', 600),
    },
    {
      id: 'type_name',
      type: 'typeText',
      config: {
        selector: { resourceId: 'com.whatsapp:id/search_input' },
        text: '{{ contactName }}',
      },
      metadata: metadata('Type name', 800),
    },
    {
      id: 'wait_result',
      type: 'waitForElement',
      config: { selector: { text: 'Robert' }, timeoutMs: 3_000 },
      metadata: metadata('Wait for result', 1000),
    },
    {
      id: 'tap_contact',
      type: 'click',
      config: { selector: { text: 'Robert' } },
      metadata: metadata('Tap contact', 1200),
    },
    {
      id: 'type_message',
      type: 'typeText',
      config: {
        selector: { resourceId: 'com.whatsapp:id/entry' },
        text: '{{ message }}',
      },
      metadata: metadata('Type message', 1400),
    },
    {
      id: 'send',
      type: 'click',
      config: { selector: { resourceId: 'com.whatsapp:id/send' } },
      metadata: metadata('Send', 1600),
    },
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'open' },
    { id: 'e2', source: 'open', target: 'find_search' },
    { id: 'e3', source: 'find_search', target: 'tap_search' },
    { id: 'e4', source: 'tap_search', target: 'type_name' },
    { id: 'e5', source: 'type_name', target: 'wait_result' },
    { id: 'e6', source: 'wait_result', target: 'tap_contact' },
    { id: 'e7', source: 'tap_contact', target: 'type_message' },
    { id: 'e8', source: 'type_message', target: 'send' },
  ],
};

const fakeDevice = () =>
  createRecordingToolInvoker({
    openApp: () => undefined,
    findElement: () => ({ text: 'Search', strategy: 'resourceId', centerX: 900, centerY: 100 }),
    click: () => undefined,
    typeText: () => undefined,
    waitForElement: () => ({ text: 'Robert', strategy: 'text' }),
  });

describe('the built-in registry', () => {
  it('registers every core and Android node', () => {
    const reg = registry();

    expect(reg.size).toBe(coreNodes.length + androidNodes.length);
  });

  it('has no type collision between the two packages', () => {
    // Both are registered bare, so a clash would be silently order-dependent - which
    // is exactly what the registry refuses.
    expect(() => registry()).not.toThrow();
  });

  it('groups nodes into categories for the palette', () => {
    const categories = [...registry().byCategory().keys()].sort();

    expect(categories).toContain('Device');
    expect(categories).toContain('Logic');
    expect(categories).toContain('Data');
  });
});

describe('OpenApp -> FindElement -> Click -> TypeText', () => {
  it('runs the whole workflow against a fake device', async () => {
    const tools = fakeDevice();

    const result = await runWorkflow(messageWorkflow, registry(), {
      tools,
      sleep: () => Promise.resolve(),
    });

    expect(result.outcome).toBe('succeeded');
    expect(result.stepsRun).toBe(9);
  });

  it('calls the device tools in the right order', async () => {
    const tools = fakeDevice();

    await runWorkflow(messageWorkflow, registry(), { tools, sleep: () => Promise.resolve() });

    expect(tools.calls.map((call) => call.tool)).toEqual([
      'openApp',
      'findElement',
      'click',
      'typeText',
      'waitForElement',
      'click',
      'typeText',
      'click',
    ]);
  });

  it('interpolates variables into the typed text', async () => {
    // The reason a workflow is reusable rather than hardcoded.
    const tools = fakeDevice();

    await runWorkflow(messageWorkflow, registry(), { tools, sleep: () => Promise.resolve() });

    const typed = tools.calls.filter((call) => call.tool === 'typeText');

    expect(typed[0]?.args.text).toBe('Robert');
    expect(typed[1]?.args.text).toBe("I'll be late tomorrow");
  });

  it('uses values supplied at run time over the declared defaults', async () => {
    const tools = fakeDevice();

    await runWorkflow(messageWorkflow, registry(), {
      tools,
      sleep: () => Promise.resolve(),
      variables: { contactName: 'Alice', message: 'on my way' },
    });

    const typed = tools.calls.filter((call) => call.tool === 'typeText');

    expect(typed[0]?.args.text).toBe('Alice');
    expect(typed[1]?.args.text).toBe('on my way');
  });

  it('passes selectors through to the device untouched', async () => {
    // Selectors are the durability mechanism; the engine must not rewrite them.
    const tools = fakeDevice();

    await runWorkflow(messageWorkflow, registry(), { tools, sleep: () => Promise.resolve() });

    const send = tools.calls.at(-1);

    expect(send).toEqual({
      tool: 'click',
      args: { selector: { resourceId: 'com.whatsapp:id/send' } },
    });
  });

  it('reports every step through the event stream', async () => {
    const events: ExecutionEvent[] = [];

    await runWorkflow(messageWorkflow, registry(), {
      tools: fakeDevice(),
      sleep: () => Promise.resolve(),
      onEvent: (event) => events.push(event),
    });

    const started = events.filter((event) => event.type === 'nodeStarted');
    const succeeded = events.filter((event) => event.type === 'nodeSucceeded');

    expect(started).toHaveLength(9);
    expect(succeeded).toHaveLength(9);
  });

  it('stops at the failing step and names it', async () => {
    const tools = createRecordingToolInvoker({
      openApp: () => undefined,
      findElement: () => {
        throw Object.assign(new Error('Element not found: search'), {
          code: 'element_not_found',
          isRetryable: false,
        });
      },
    });

    const result = await runWorkflow(messageWorkflow, registry(), {
      tools,
      sleep: () => Promise.resolve(),
    });

    expect(result.outcome).toBe('failed');
    expect(result.failedNodeId).toBe('find_search');
    expect(result.error).toContain('Element not found');
    // Nothing after the failure ran.
    expect(tools.calls.map((call) => call.tool)).toEqual(['openApp', 'findElement']);
  });

  it('refuses to run with no device rather than failing halfway', async () => {
    const result = await runWorkflow(messageWorkflow, registry(), {
      sleep: () => Promise.resolve(),
    });

    expect(result.outcome).toBe('failed');
    expect(result.failedNodeId).toBe('open');
  });

  it('knows in advance which node types need a device', async () => {
    // Lets the UI ask for permissions before starting rather than mid-task.
    const { loadWorkflow } = await import('./loader');
    const loaded = loadWorkflow(messageWorkflow, registry());

    expect(loaded.deviceDependentTypes.sort()).toEqual([
      'click',
      'findElement',
      'openApp',
      'typeText',
      'waitForElement',
    ]);
  });
});

describe('a workflow with a condition and a loop', () => {
  const searchWorkflow = {
    id: 'wf_scroll',
    metadata: {
      name: 'Scroll looking for a chat',
      createdAt: '2026-01-01T09:00:00.000Z',
      updatedAt: '2026-01-01T09:00:00.000Z',
    },
    variables: [{ name: 'found', type: 'boolean', defaultValue: false }],
    nodes: [
      { id: 'start', type: 'trigger', config: { kind: 'manual' }, metadata: metadata('Start') },
      {
        id: 'loop',
        type: 'loop',
        config: { kind: 'count', iterations: 3 },
        metadata: metadata('Scroll 3 times', 200),
      },
      {
        id: 'scroll',
        type: 'swipe',
        config: { direction: 'down' },
        metadata: metadata('Scroll', 400),
      },
      {
        id: 'check',
        type: 'condition',
        config: { condition: { type: 'element_exists', selector: { text: 'Robert' } } },
        metadata: metadata('Visible?', 600),
      },
      {
        id: 'mark',
        type: 'setVariable',
        config: {
          variableName: 'found',
          operation: 'set',
          value: { from: 'literal', value: true },
        },
        metadata: metadata('Mark found', 800),
      },
      {
        id: 'done',
        type: 'notification',
        config: { title: 'Search finished', body: 'found: {{ found }}' },
        metadata: metadata('Notify', 1000),
      },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'loop' },
      { id: 'e2', source: 'loop', sourceHandle: 'body', target: 'scroll' },
      { id: 'e3', source: 'scroll', target: 'check' },
      { id: 'e4', source: 'check', sourceHandle: 'true', target: 'mark' },
      { id: 'e5', source: 'loop', sourceHandle: 'done', target: 'done' },
    ],
  };

  it('iterates, branches, and finishes', async () => {
    const tools = createRecordingToolInvoker({
      swipe: () => undefined,
      findElement: () => {
        throw new Error('element_not_found');
      },
      sendNotification: () => undefined,
    });

    const result = await runWorkflow(searchWorkflow, registry(), {
      tools,
      sleep: () => Promise.resolve(),
    });

    expect(result.outcome).toBe('succeeded');
    expect(tools.calls.filter((call) => call.tool === 'swipe')).toHaveLength(3);
    expect(result.variables.found).toBe(false);
  });

  it('takes the true branch and records the result when the element appears', async () => {
    const tools = createRecordingToolInvoker({
      swipe: () => undefined,
      findElement: () => ({ text: 'Robert' }),
      sendNotification: () => undefined,
    });

    const result = await runWorkflow(searchWorkflow, registry(), {
      tools,
      sleep: () => Promise.resolve(),
    });

    expect(result.variables.found).toBe(true);

    const notification = tools.calls.find((call) => call.tool === 'sendNotification');
    expect(notification?.args.body).toBe('found: true');
  });
});
