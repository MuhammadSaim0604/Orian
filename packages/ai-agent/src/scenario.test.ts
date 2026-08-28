import { type Observation } from '@mobile-automation/prompt-engine';
import { describe, expect, it } from 'vitest';

import { type AgentEvent, type ToolExecutedEvent } from './events';
import { type DeviceTools, runAgent } from './loop';
import { type CompletionResponse, type ModelProvider } from './provider';

/**
 * The flagship scenario from the Phase 7 plan.
 *
 * "Send Robert a WhatsApp message that I'll be late tomorrow" - the whole loop, the
 * real tool schemas, the real prompt engine, against a scripted model and a simulated
 * phone that changes screen as the agent acts.
 *
 * The simulation is what gives this test its value. A fake device returning the same
 * screen forever would let a broken loop pass; one whose screen only advances when the
 * right action is taken means the test fails if the agent acts out of order, acts on a
 * stale reading, or never notices it arrived.
 *
 * The definition of done still requires this on real hardware. What is proven here is
 * the orchestration; what is not is the device.
 */

type ScreenName = 'home' | 'search' | 'results' | 'conversation' | 'drafted' | 'sent';

/** A phone that advances only when the right thing is done to it. */
const simulatedPhone = () => {
  let screen: ScreenName = 'home';
  const typed: string[] = [];
  let draft = '';

  const conversationTree = (entryText: string | null) => ({
    nodeCount: 3,
    root: {
      children: [
        { text: 'Robert', className: 'TextView' },
        {
          resourceId: 'com.whatsapp:id/entry',
          className: 'EditText',
          ...(entryText === null ? {} : { text: entryText }),
        },
      ],
    },
  });

  const screens: Record<ScreenName, Observation> = {
    home: {
      packageName: 'com.whatsapp',
      activityName: 'com.whatsapp.HomeActivity',
      uiTree: {
        nodeCount: 3,
        root: {
          children: [
            { text: 'WhatsApp', className: 'TextView' },
            { resourceId: 'com.whatsapp:id/menuitem_search', contentDescription: 'Search' },
          ],
        },
      },
    },
    search: {
      packageName: 'com.whatsapp',
      activityName: 'com.whatsapp.HomeActivity',
      uiTree: {
        nodeCount: 2,
        root: {
          children: [{ resourceId: 'com.whatsapp:id/search_input', className: 'EditText' }],
        },
      },
    },
    results: {
      packageName: 'com.whatsapp',
      activityName: 'com.whatsapp.HomeActivity',
      uiTree: {
        nodeCount: 2,
        root: { children: [{ text: 'Robert', className: 'TextView' }] },
      },
    },
    conversation: {
      packageName: 'com.whatsapp',
      activityName: 'com.whatsapp.Conversation',
      uiTree: conversationTree(null),
    },
    // The draft shows in the entry field, as it would on a real phone. That is what
    // lets the model decide from the screen rather than from its own history.
    drafted: {
      packageName: 'com.whatsapp',
      activityName: 'com.whatsapp.Conversation',
      uiTree: conversationTree('DRAFT'),
    },
    sent: {
      packageName: 'com.whatsapp',
      activityName: 'com.whatsapp.Conversation',
      uiTree: {
        nodeCount: 4,
        root: {
          children: [
            { text: 'Robert', className: 'TextView' },
            { text: 'SENT', className: 'TextView' },
            { resourceId: 'com.whatsapp:id/entry', className: 'EditText' },
          ],
        },
      },
    },
  };

  const tools: DeviceTools & { readonly calls: { tool: string; args: unknown }[] } = {
    calls: [],
    isAvailable: true,
    invoke: async (tool, args) => {
      tools.calls.push({ tool, args });

      const selectorText = readSelector(args);

      switch (tool) {
        case 'openApp':
          screen = 'home';
          return undefined;

        case 'click': {
          if (selectorText.includes('menuitem_search') || selectorText.includes('Search')) {
            screen = 'search';
            return undefined;
          }

          if (selectorText.includes('Robert') && screen === 'results') {
            screen = 'conversation';
            return undefined;
          }

          if (selectorText.includes('send')) {
            // Sending with an empty field does nothing on a real phone, and the send
            // button is not even present - so this is the failure the agent must recover
            // from.
            if (draft === '') {
              throw Object.assign(new Error('Element not found: send'), {
                code: 'element_not_found',
              });
            }

            typed.push(draft);
            draft = '';
            screen = 'sent';
            return undefined;
          }

          throw Object.assign(new Error(`Element not found: ${selectorText}`), {
            code: 'element_not_found',
          });
        }

        case 'typeText': {
          const text = (args as { text?: string }).text ?? '';

          if (selectorText.includes('search_input')) {
            screen = 'results';
            return undefined;
          }

          if (selectorText.includes('entry')) {
            draft = text;
            screen = 'drafted';
            return undefined;
          }

          throw Object.assign(new Error('Element not found'), { code: 'element_not_found' });
        }

        case 'waitForElement':
        case 'findElement': {
          const current = screens[screen];
          const found = findInTree(current.uiTree, selectorText);

          if (found === null) {
            throw Object.assign(new Error(`Element not found: ${selectorText}`), {
              code: 'element_not_found',
            });
          }

          return { ...found, strategy: found.resourceId != null ? 'resourceId' : 'text' };
        }

        case 'getUiTree':
          return screens[screen].uiTree;

        case 'getCurrentScreen':
          return {
            packageName: screens[screen].packageName,
            activityName: screens[screen].activityName,
          };

        default:
          return undefined;
      }
    },
  };

  return {
    tools,
    observe: async () => screens[screen],
    get screen() {
      return screen;
    },
    get typed() {
      return [...typed];
    },
  };
};

const readSelector = (args: unknown): string => {
  const selector = (args as { selector?: Record<string, unknown> }).selector;
  if (selector === undefined) return '';
  return JSON.stringify(selector);
};

const findInTree = (
  tree: unknown,
  selectorText: string,
): { text?: string; resourceId?: string } | null => {
  const nodes = ((tree as { root?: { children?: unknown[] } }).root?.children ?? []) as {
    text?: string;
    resourceId?: string;
  }[];

  for (const node of nodes) {
    if (node.resourceId != null && selectorText.includes(node.resourceId)) return node;
    if (node.text != null && selectorText.includes(node.text)) return node;
  }

  return null;
};

/**
 * A model that plays the scenario, choosing its action from the screen it is shown.
 *
 * Written as a reaction to the prompt rather than a fixed script, so the test fails if
 * the loop stops including the screen in context - which is the single most important
 * thing the context builder does.
 *
 * The markers it looks for are deliberately precise. The goal text and the tool list are
 * both in every prompt, so matching on "I'll be late tomorrow" or "typeText" would match
 * on turn one and the model would think it had already finished. Screen state is read
 * from the serialized tree (`"text":"..."`), and its own history from the memory format
 * (`typeText({`), neither of which appears anywhere else in the prompt.
 */
const scenarioModel = (): ModelProvider => {
  let planned = false;

  return {
    model: 'scenario-model',
    isConfigured: async () => true,
    complete: async (request) => {
      const content = request.messages.map((message) => message.content).join('\n');

      // The planning turn has no tools attached.
      if (request.tools === undefined) {
        planned = true;
        return {
          content: JSON.stringify({
            steps: [
              'open WhatsApp',
              'search for Robert',
              'open the conversation',
              'type the message',
              'send it',
            ],
          }),
          toolCalls: [],
          finishReason: 'stop',
        };
      }

      expect(planned).toBe(true);

      // "SENT" appears in the tree only after the message went through.
      if (content.includes('"text":"SENT"')) {
        return prose('The message has been sent to Robert.');
      }

      // The entry field holding a draft means the message is typed and ready to send.
      if (content.includes('"text":"DRAFT"')) {
        return call('click', { selector: { resourceId: 'com.whatsapp:id/send' } });
      }

      // An empty entry field means the conversation is open but nothing is typed.
      if (content.includes('"resourceId":"com.whatsapp:id/entry"')) {
        return call('typeText', {
          selector: { resourceId: 'com.whatsapp:id/entry' },
          text: "I'll be late tomorrow",
        });
      }

      if (content.includes('"text":"Robert"')) {
        return call('click', { selector: { text: 'Robert' } });
      }

      if (content.includes('"resourceId":"com.whatsapp:id/search_input"')) {
        return call('typeText', {
          selector: { resourceId: 'com.whatsapp:id/search_input' },
          text: 'Robert',
        });
      }

      // The home screen, but only once the app has been opened deliberately.
      if (
        content.includes('"resourceId":"com.whatsapp:id/menuitem_search"') &&
        content.includes('openApp({')
      ) {
        return call('click', { selector: { resourceId: 'com.whatsapp:id/menuitem_search' } });
      }

      return call('openApp', { packageName: 'com.whatsapp' });
    },
  };
};

const call = (name: string, args: unknown): CompletionResponse => ({
  content: null,
  toolCalls: [{ id: `call_${name}`, name, arguments: JSON.stringify(args) }],
  finishReason: 'tool_calls',
});

const prose = (content: string): CompletionResponse => ({
  content,
  toolCalls: [],
  finishReason: 'stop',
});

describe("Send Robert a WhatsApp message that I'll be late tomorrow", () => {
  const goal = "Send Robert a WhatsApp message that I'll be late tomorrow";

  it('completes the scenario', async () => {
    const phone = simulatedPhone();

    const result = await runAgent(
      { provider: scenarioModel(), tools: phone.tools, observe: phone.observe },
      { goal, maxSteps: 15 },
    );

    expect(result.outcome).toBe('succeeded');
    expect(phone.screen).toBe('sent');
  });

  it('sends the right message', async () => {
    const phone = simulatedPhone();

    await runAgent(
      { provider: scenarioModel(), tools: phone.tools, observe: phone.observe },
      { goal, maxSteps: 15 },
    );

    expect(phone.typed).toContain("I'll be late tomorrow");
  });

  it('opens the app, searches, opens the chat, types, and sends', async () => {
    const phone = simulatedPhone();

    await runAgent(
      { provider: scenarioModel(), tools: phone.tools, observe: phone.observe },
      { goal, maxSteps: 15 },
    );

    const sequence = phone.tools.calls.map((entry) => entry.tool);

    expect(sequence[0]).toBe('openApp');
    expect(sequence).toContain('typeText');
    expect(sequence.at(-1)).toBe('click');
  });

  it('finishes well inside its step budget', async () => {
    // A loop that only terminates by exhaustion would still pass the outcome check.
    const phone = simulatedPhone();

    const result = await runAgent(
      { provider: scenarioModel(), tools: phone.tools, observe: phone.observe },
      { goal, maxSteps: 15 },
    );

    expect(result.stepsTaken).toBeLessThan(10);
  });

  it('plans before it acts', async () => {
    const events: AgentEvent[] = [];
    const phone = simulatedPhone();

    await runAgent(
      { provider: scenarioModel(), tools: phone.tools, observe: phone.observe },
      { goal, maxSteps: 15, onEvent: (event) => events.push(event) },
    );

    const plannedAt = events.findIndex((event) => event.type === 'planned');
    const firstAction = events.findIndex((event) => event.type === 'toolExecuted');

    expect(plannedAt).toBeGreaterThanOrEqual(0);
    expect(plannedAt).toBeLessThan(firstAction);
  });

  it('produces a trace Phase 9 can compile into a workflow', async () => {
    // Every executed step carries its screen, its tree, and the selector that resolved.
    const events: AgentEvent[] = [];
    const phone = simulatedPhone();

    await runAgent(
      { provider: scenarioModel(), tools: phone.tools, observe: phone.observe },
      { goal, maxSteps: 15, onEvent: (event) => events.push(event) },
    );

    const executed = events.filter(
      (event): event is ToolExecutedEvent => event.type === 'toolExecuted',
    );

    expect(executed.length).toBeGreaterThan(3);

    for (const step of executed) {
      expect(step.packageName).toBe('com.whatsapp');
      expect(step.activityName).not.toBeNull();
      expect(step.uiTreeBefore).toBeDefined();
      expect(typeof step.durationMs).toBe('number');
    }
  });

  it('records selectors rather than coordinates', async () => {
    // The whole reason a generated workflow survives an app update (ADR 0009).
    const events: AgentEvent[] = [];
    const phone = simulatedPhone();

    await runAgent(
      { provider: scenarioModel(), tools: phone.tools, observe: phone.observe },
      { goal, maxSteps: 15, onEvent: (event) => events.push(event) },
    );

    const taps = events.filter(
      (event): event is ToolExecutedEvent =>
        event.type === 'toolExecuted' && event.tool === 'click',
    );

    for (const tap of taps) {
      const selector = (tap.arguments as { selector?: Record<string, unknown> }).selector;
      expect(selector).toBeDefined();
      expect(selector).not.toHaveProperty('coordinates');
    }
  });

  it('recovers when a step fails because the screen is not what it expected', async () => {
    // The plan's acceptance criterion: it must recover, not abandon the goal.
    const phone = simulatedPhone();

    let sentEarly = false;

    const impatientModel: ModelProvider = {
      model: 'impatient',
      isConfigured: async () => true,
      complete: async (request) => {
        const content = request.messages.map((message) => message.content).join('\n');

        if (request.tools === undefined) {
          return prose(JSON.stringify({ steps: ['open the chat', 'send'] }));
        }

        if (content.includes('"text":"SENT"')) {
          return prose('Sent.');
        }

        // Tries to send before typing, once. The entry field is empty, so this fails and
        // the agent must notice and recover.
        if (content.includes('"resourceId":"com.whatsapp:id/entry"') && !sentEarly) {
          sentEarly = true;
          return call('click', { selector: { resourceId: 'com.whatsapp:id/send' } });
        }

        if (content.includes('"text":"DRAFT"')) {
          return call('click', { selector: { resourceId: 'com.whatsapp:id/send' } });
        }

        if (content.includes('"resourceId":"com.whatsapp:id/entry"')) {
          return call('typeText', {
            selector: { resourceId: 'com.whatsapp:id/entry' },
            text: "I'll be late tomorrow",
          });
        }

        if (content.includes('"text":"Robert"')) {
          return call('click', { selector: { text: 'Robert' } });
        }

        if (content.includes('"resourceId":"com.whatsapp:id/search_input"')) {
          return call('typeText', {
            selector: { resourceId: 'com.whatsapp:id/search_input' },
            text: 'Robert',
          });
        }

        if (
          content.includes('"resourceId":"com.whatsapp:id/menuitem_search"') &&
          content.includes('openApp({')
        ) {
          return call('click', { selector: { resourceId: 'com.whatsapp:id/menuitem_search' } });
        }

        return call('openApp', { packageName: 'com.whatsapp' });
      },
    };

    const result = await runAgent(
      { provider: impatientModel, tools: phone.tools, observe: phone.observe },
      { goal, maxSteps: 20 },
    );

    expect(sentEarly).toBe(true);
    expect(result.outcome).toBe('succeeded');
    expect(phone.screen).toBe('sent');
    expect(result.memory.steps.some((step) => step.outcome === 'failed')).toBe(true);
  });

  it('never touches the device with an unvalidated call', async () => {
    // A model that emits a malformed selector must not reach the phone.
    const phone = simulatedPhone();

    let emitted = false;

    const sloppyModel: ModelProvider = {
      model: 'sloppy',
      isConfigured: async () => true,
      complete: async (request) => {
        if (request.tools === undefined) return prose(JSON.stringify({ steps: ['try'] }));

        if (!emitted) {
          emitted = true;
          // No locating field - must be rejected before execution.
          return call('click', { selector: { className: 'android.widget.Button' } });
        }

        return prose('Giving up.');
      },
    };

    await runAgent(
      { provider: sloppyModel, tools: phone.tools, observe: phone.observe },
      { goal, maxSteps: 5 },
    );

    expect(phone.tools.calls).toHaveLength(0);
  });
});
