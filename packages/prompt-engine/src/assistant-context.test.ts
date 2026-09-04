import { describe, expect, it } from 'vitest';

import { AGENT_SYSTEM_PROMPT } from './agent-context';
import { ASSISTANT_SYSTEM_PROMPT, buildAssistantContext } from './assistant-context';
import { systemMessage, userMessage } from './template';

/**
 * Orion Assist's prompt.
 *
 * These assert the ways it must **differ** from the agent's prompt, because that is the whole reason it exists.
 * A copy of the agent prompt with a friendlier tone would pass a casual reading and produce exactly the wrong
 * behaviour: a plan card in a panel that is closing, and a spoken briefing where the user asked a question.
 */

describe('the request shape', () => {
  it('is the system prompt followed by the conversation', () => {
    const conversation = [userMessage('what does this say')];

    expect(buildAssistantContext({ messages: conversation })).toEqual([
      systemMessage(ASSISTANT_SYSTEM_PROMPT),
      ...conversation,
    ]);
  });

  it('sends the user message exactly as spoken', () => {
    const messages = buildAssistantContext({ messages: [userMessage('read this out')] });

    expect(messages[1]).toEqual({ role: 'user', content: 'read this out' });
  });
});

describe('how it differs from the agent prompt', () => {
  it('is not the agent prompt', () => {
    expect(ASSISTANT_SYSTEM_PROMPT).not.toBe(AGENT_SYSTEM_PROMPT);
  });

  it('forbids planning outright', () => {
    // The agent prompt has a whole <planning> section telling the model when to call createPlan. This one must
    // say the opposite, because the panel is about to close and a spoken plan is noise.
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/Never make a plan/i);
    expect(ASSISTANT_SYSTEM_PROMPT).not.toContain('createPlan');
    expect(AGENT_SYSTEM_PROMPT).toContain('createPlan');
  });

  it('makes answering the default rather than acting', () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/Answer the question\. Do the one thing\. Then stop\./);
  });

  it('says to hand a long job back to the app', () => {
    // The honest boundary. A forty-step run in a transient panel that the system may dismiss is a bad idea, and
    // the model needs to be told where the line is rather than discovering it.
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/offer to do it in the app instead/i);
  });

  it('tells the model its reply will be spoken', () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/read out loud/i);
    // Without this a model asked about a screen returns a bulleted table.
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/No markdown, no bullet points/i);
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/Two or three sentences/i);
  });

  it('bans the preamble that makes a voice reply unbearable', () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("I've read the screen");
  });

  it('knows its own name', () => {
    // The user summoned it by name. A model that does not know what it is called answers "I am an AI assistant",
    // which reads as the wrong app having opened.
    expect(ASSISTANT_SYSTEM_PROMPT).toContain('You are Orion');
  });
});

describe('what it shares with the agent prompt', () => {
  it('keeps the same selector durability order', () => {
    // A fact about the device, not a choice about the mode. Both prompts must rank these the same way or the two
    // modes would produce differently durable actions on the same screen.
    //
    // Lowercased before searching: this prompt writes prose ("Coordinates are a last resort") where the agent's
    // writes a numbered list, and the assertion is about order rather than capitalisation.
    const prompt = ASSISTANT_SYSTEM_PROMPT.toLowerCase();

    const resourceId = prompt.indexOf('resourceid');
    const contentDescription = prompt.indexOf('contentdescription');
    const coordinates = prompt.indexOf('coordinates');

    expect(resourceId).toBeGreaterThan(-1);
    expect(resourceId).toBeLessThan(contentDescription);
    expect(contentDescription).toBeLessThan(coordinates);
  });

  it('keeps the perception chain in cost order', () => {
    const tree = ASSISTANT_SYSTEM_PROMPT.indexOf('getUiTree');
    const ocr = ASSISTANT_SYSTEM_PROMPT.indexOf('runOcr');
    const screenshot = ASSISTANT_SYSTEM_PROMPT.indexOf('takeScreenshot');

    expect(tree).toBeLessThan(ocr);
    expect(ocr).toBeLessThan(screenshot);
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/costs the user money/i);
  });

  it('refuses to invent an element', () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/Never invent an element/i);
  });

  it('says nothing is given unasked', () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/Nothing about the phone is given to you/i);
  });

  it('uses tags rather than markdown headings', () => {
    // Same reasoning as the agent prompt: screen content is arbitrary third-party text, so a heading is not a
    // delimiter but a tag pair has an explicit end.
    for (const tag of [
      'role',
      'what_you_are_for',
      'how_you_speak',
      'seeing_the_screen',
      'identifying_elements',
      'before_you_do_something_irreversible',
      'when_you_cannot_help',
      'safety',
    ]) {
      expect(ASSISTANT_SYSTEM_PROMPT).toContain(`<${tag}>`);
      expect(ASSISTANT_SYSTEM_PROMPT).toContain(`</${tag}>`);
    }
  });
});

describe('confirmation before something irreversible', () => {
  it('requires a confirmation turn and forbids acting in the same one', () => {
    /**
     * The rule with the most consequence in this file. In Agent Mode the user is watching a screen; here they may
     * not be looking at the phone at all, and there is no dialog to read. Asking and then acting in the same turn
     * would be a confirmation nobody could refuse.
     */
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/ask them to confirm/i);
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/Do not do it in the same turn as asking/i);
  });

  it('names what counts as irreversible', () => {
    for (const phrase of ['sending a message', 'making a call', 'deleting', 'money']) {
      expect(ASSISTANT_SYSTEM_PROMPT).toContain(phrase);
    }
  });

  it('exempts reading and looking things up, so a question is not gated', () => {
    // Without this the model asks permission to read the screen, which makes every single interaction two turns.
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(
      /Reading, opening, and looking things up need no confirmation/i,
    );
  });
});
