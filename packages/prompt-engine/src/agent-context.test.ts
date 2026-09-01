import { allToolDefinitions } from '@mobile-automation/tool-sdk';
import { describe, expect, it } from 'vitest';

import {
  AGENT_SYSTEM_PROMPT,
  DEFAULT_CONTEXT_BUDGET,
  type MemoryEntry,
  type Observation,
  buildAgentContext,
} from './agent-context';

const observation: Observation = {
  packageName: 'com.whatsapp',
  activityName: 'com.whatsapp.HomeActivity',
  uiTree: {
    root: {
      className: 'FrameLayout',
      children: [{ text: 'Search', resourceId: 'com.whatsapp:id/menuitem_search' }],
    },
  },
};

const input = (overrides: Partial<Parameters<typeof buildAgentContext>[0]> = {}) =>
  buildAgentContext({
    goal: "Send Robert a WhatsApp message that I'll be late tomorrow",
    observation,
    memory: [],
    tools: allToolDefinitions(),
    stepsTaken: 0,
    maxSteps: 40,
    ...overrides,
  });

const userContent = (messages: ReturnType<typeof buildAgentContext>) =>
  messages.find((message) => message.role === 'user')?.content ?? '';

describe('the system prompt', () => {
  it('is sent as a system message', () => {
    const messages = input();

    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toBe(AGENT_SYSTEM_PROMPT);
  });

  it('tells the model to read the screen before acting', () => {
    // Without it, models tap coordinates remembered from a screen two steps old. Named as the tag rather than
    // as prose, because that is how the instruction now refers to it and the model must be able to follow the
    // reference.
    expect(AGENT_SYSTEM_PROMPT).toMatch(/read <screen> before acting/i);
  });

  it('is structured into tagged sections rather than one list of rules', () => {
    // Four different kinds of statement — what it is, how to work, how to see, when to stop — and a flat list
    // of bullets gives the model no way to tell a hard rule from a hint.
    for (const tag of [
      'role',
      'how_to_work',
      'identifying_elements',
      'seeing_the_screen',
      'finishing',
      'safety',
    ]) {
      expect(AGENT_SYSTEM_PROMPT).toContain(`<${tag}>`);
      expect(AGENT_SYSTEM_PROMPT).toContain(`</${tag}>`);
    }
  });

  it('describes the perception chain in order of cost', () => {
    // The failure to avoid is a model reaching for the most powerful-sounding option first. Each rung has to say
    // what it costs, and the cheap one has to come first (ADR 0013).
    const hierarchy = AGENT_SYSTEM_PROMPT.indexOf('element hierarchy in <screen>');
    const ocr = AGENT_SYSTEM_PROMPT.indexOf('runOcr');
    const screenshot = AGENT_SYSTEM_PROMPT.indexOf('takeScreenshot');

    expect(hierarchy).toBeGreaterThan(-1);
    expect(ocr).toBeGreaterThan(hierarchy);
    expect(screenshot).toBeGreaterThan(ocr);
    expect(AGENT_SYSTEM_PROMPT).toMatch(/only descend when the one above genuinely fails/i);
  });

  it('names both OCR tools, not just the concept', () => {
    // A model told that "OCR is available" cannot call it. The tool names have to appear in the instruction that
    // tells it when to descend.
    expect(AGENT_SYSTEM_PROMPT).toContain('runOcr');
    expect(AGENT_SYSTEM_PROMPT).toContain('findTextOnScreen');
  });

  it('warns that OCR reads pixels and can misread', () => {
    // Without this the model treats an approximate match as a certainty, which is how it taps "Share" when it
    // meant "Save".
    expect(AGENT_SYSTEM_PROMPT).toMatch(/misread/i);
    expect(AGENT_SYSTEM_PROMPT).toMatch(/check the text it actually read/i);
  });

  it('tells the model that answering a question is a complete response', () => {
    // A question about the screen was being turned into a sequence of actions, because nothing said that
    // answering is enough.
    expect(AGENT_SYSTEM_PROMPT).toMatch(/Answering is a complete response/i);
  });

  it('states the selector preference order', () => {
    // Text selectors break on any localisation or label change.
    expect(AGENT_SYSTEM_PROMPT).toContain('resourceId');
    expect(AGENT_SYSTEM_PROMPT).toContain('contentDescription');
  });

  it('tells the model to wait after an action that loads a screen', () => {
    // The commonest false "element not found" is looking too early.
    expect(AGENT_SYSTEM_PROMPT).toMatch(/wait for an element/i);
  });

  it('requires an explicit finish, so the loop does not run to its ceiling', () => {
    expect(AGENT_SYSTEM_PROMPT).toMatch(/stop|say so/i);
  });

  it('forbids inventing an element', () => {
    // A model that cannot find something will otherwise guess a plausible id.
    expect(AGENT_SYSTEM_PROMPT).toMatch(/never invent/i);
  });

  it('says whose device this is', () => {
    expect(AGENT_SYSTEM_PROMPT).toMatch(/real person|someone's real device/i);
  });
});

describe('assembly', () => {
  it('produces a system and a user message', () => {
    const messages = input();

    expect(messages).toHaveLength(2);
    expect(messages[1]?.role).toBe('user');
  });

  it('includes the goal', () => {
    expect(userContent(input())).toContain('Send Robert a WhatsApp message');
  });

  it('includes the current app and screen', () => {
    const content = userContent(input());

    expect(content).toContain('com.whatsapp');
    expect(content).toContain('HomeActivity');
  });

  it('includes the UI tree', () => {
    expect(userContent(input())).toContain('menuitem_search');
  });

  it('puts the current screen last, where recency weighs most', () => {
    const content = userContent(input());

    expect(content.lastIndexOf('<screen')).toBeGreaterThan(content.indexOf('<goal>'));
  });

  it('lists the available tools with their descriptions', () => {
    // The tool list tells a model what it can do; the descriptions tell it when.
    const content = userContent(input());

    expect(content).toContain('waitForElement');
    expect(content).toContain('Wait for an element to appear');
  });

  it('delimits every data block with a closing tag', () => {
    // The reason the turn is tagged rather than headed: screen content is arbitrary text from a third-party
    // app, so a UI tree containing "## Goal" is indistinguishable from the prompt's own heading. A tag pair
    // has an explicit end.
    const content = userContent(input({ plan: ['open WhatsApp'], memory: [] }));

    for (const tag of ['goal', 'plan', 'tools', 'screen']) {
      expect(content).toContain(`</${tag}>`);
    }
  });

  it('handles an unknown foreground app', () => {
    const content = userContent(
      input({ observation: { ...observation, packageName: null, activityName: null } }),
    );

    expect(content).toContain('app="unknown"');
  });

  it('says so explicitly when the hierarchy is empty', () => {
    // An empty block reads as a missing section and the model guesses. Naming the situation is what lets it
    // decide to descend the perception chain rather than acting blind - and naming the *next rung specifically*
    // is what stops it descending straight to the expensive one.
    const content = userContent(input({ observation: { ...observation, uiTree: null } }));

    expect(content).toMatch(/element hierarchy is empty/i);
    expect(content).toContain('runOcr');
  });

  it('mentions a screenshot by path, never by bytes', () => {
    // Image bytes in a prompt would be ruinous, and the tree is the primary
    // perception (ADR 0009).
    const content = userContent(
      input({ observation: { ...observation, screenshotPath: '/data/captures/3.png' } }),
    );

    expect(content).toContain('/data/captures/3.png');
    expect(content).not.toContain('base64');
  });

  it('omits the screenshot line when there is none', () => {
    expect(userContent(input())).not.toContain('screenshot');
  });
});

describe('plan and budget', () => {
  it('includes a plan when one exists', () => {
    const content = userContent(
      input({ plan: ['open WhatsApp', 'search for Robert', 'send the message'] }),
    );

    expect(content).toContain('<plan');
    expect(content).toContain('2. search for Robert');
  });

  it('says the plan is a guide rather than a script', () => {
    // The screen decides what is actually possible. A model treating the plan as a script keeps executing a
    // step that no longer applies.
    expect(userContent(input({ plan: ['open WhatsApp'] }))).toContain('not a script');
  });

  it('omits the plan section when there is no plan', () => {
    expect(userContent(input())).not.toContain('<plan');
  });

  it('states the step budget', () => {
    // Attributes rather than a sentence: it is three numbers, and prose asking a model to compare "step 5 of
    // at most 40" is more work than reading remaining="36".
    const content = userContent(input({ stepsTaken: 4, maxSteps: 40 }));

    expect(content).toContain('<budget step="5"');
    expect(content).toContain('max="40"');
    expect(content).toContain('remaining="36"');
  });

  it('warns when the budget is nearly spent', () => {
    // So the model prioritises finishing rather than exploring.
    const content = userContent(input({ stepsTaken: 35, maxSteps: 40 }));

    expect(content).toMatch(/running short/i);
  });

  it('does not warn early in the run', () => {
    expect(userContent(input({ stepsTaken: 2, maxSteps: 40 }))).not.toMatch(/running short/i);
  });
});

describe('memory', () => {
  const entry = (step: number, overrides: Partial<MemoryEntry> = {}): MemoryEntry => ({
    step,
    tool: 'click',
    arguments: { selector: { text: 'Search' } },
    outcome: 'succeeded',
    summary: 'tapped search',
    ...overrides,
  });

  it('omits the history section on the first step', () => {
    expect(userContent(input())).not.toContain('What you have done so far');
  });

  it('lists what has been done', () => {
    const content = userContent(input({ memory: [entry(1), entry(2)] }));

    expect(content).toContain('<history');
    expect(content).toContain('1. click');
  });

  it('marks a failed step clearly', () => {
    const content = userContent(
      input({ memory: [entry(1, { outcome: 'failed', summary: 'element not found' })] }),
    );

    expect(content).toContain('FAILED');
    expect(content).toContain('element not found');
  });

  it('records the screen an action landed on', () => {
    const content = userContent(
      input({ memory: [entry(1, { screenAfter: 'com.whatsapp/Conversation' })] }),
    );

    expect(content).toContain('com.whatsapp/Conversation');
  });

  it('says when earlier steps were omitted', () => {
    // A model shown steps 4-9 with no indication that 1-3 existed may conclude it has
    // just started and repeat work.
    const many = Array.from({ length: 60 }, (_unused, index) =>
      entry(index + 1, { summary: 'x'.repeat(200) }),
    );

    const content = userContent(input({ memory: many }));

    // An attribute rather than a parenthetical, so the count is a fact about the block rather than a line the
    // model might read as history itself.
    expect(content).toMatch(/omitted="\d+"/);
  });

  it('keeps the most recent steps when trimming', () => {
    const many = Array.from({ length: 60 }, (_unused, index) =>
      entry(index + 1, { summary: `step ${index + 1} ${'x'.repeat(200)}` }),
    );

    const content = userContent(input({ memory: many }));

    expect(content).toContain('step 60');
    expect(content).not.toContain('step 1 xxx');
  });
});

describe('rejection feedback', () => {
  it('includes the correction after a rejected call', () => {
    // So the retry is a correction rather than a repeat.
    const content = userContent(
      input({ lastRejection: 'There is no tool called "sendWhatsApp".' }),
    );

    expect(content).toContain('rejected');
    expect(content).toContain('sendWhatsApp');
  });

  it('omits the section when the last call was fine', () => {
    expect(userContent(input())).not.toContain('rejected');
  });
});

describe('budgets', () => {
  it('gives the UI tree the largest share', () => {
    // It is the perception; memory summaries matter far less than the current screen.
    expect(DEFAULT_CONTEXT_BUDGET.uiTreeTokens).toBeGreaterThan(
      DEFAULT_CONTEXT_BUDGET.memoryTokens,
    );
  });

  it('trims a huge UI tree rather than sending it whole', () => {
    const huge = { root: { children: Array.from({ length: 5_000 }, () => ({ text: 'x' })) } };

    const content = userContent(
      input({
        observation: { ...observation, uiTree: huge },
        budget: { uiTreeTokens: 200, memoryTokens: 200, totalTokens: 1_000 },
      }),
    );

    expect(content).toContain('truncated');
  });

  it('redacts a secret that somehow reached the tree', () => {
    // Defence in depth: a login form field should never carry a value into a prompt.
    const content = userContent(
      input({
        observation: { ...observation, uiTree: { root: { password: 'hunter2' } } },
      }),
    );

    expect(content).not.toContain('hunter2');
    expect(content).toContain('[redacted]');
  });
});
