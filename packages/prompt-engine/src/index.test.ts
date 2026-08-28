import { describe, expect, it } from 'vitest';

import {
  CONTEXT_KINDS,
  MESSAGE_ROLES,
  PACKAGE_NAME,
  REDACTED_KEYS,
  REDACTION_PLACEHOLDER,
  defineTemplate,
  estimateMessagesTokens,
  estimateTokens,
  isRedactedKey,
  joinSections,
  keepRecentWithinBudget,
  numberedList,
  redact,
  renderPrompt,
  section,
  systemMessage,
  toPromptJson,
  toolMessage,
  truncateToTokens,
  userMessage,
} from './index';

describe('prompt-engine', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@mobile-automation/prompt-engine');
  });

  it('declares the Chat Completions roles', () => {
    expect(MESSAGE_ROLES).toEqual(['system', 'user', 'assistant', 'tool']);
  });

  it('declares the three context assembly jobs', () => {
    expect(CONTEXT_KINDS).toEqual(['agent', 'nodeConfig', 'workflowGeneration']);
  });
});

describe('templates', () => {
  const greeting = defineTemplate<{ name: string }>({
    name: 'test.greeting',
    version: '1.0.0',
    purpose: 'Exercises the template model',
    render: (input) => [systemMessage('Be brief.'), userMessage(`Hello ${input.name}`)],
  });

  it('renders messages rather than one string', () => {
    // Chat Completions distinguishes system from user content, and collapsing them
    // loses what makes a model follow instructions rather than treat them as data.
    const rendered = renderPrompt(greeting, { name: 'Robert' });

    expect(rendered.messages).toHaveLength(2);
    expect(rendered.messages[0]?.role).toBe('system');
    expect(rendered.messages[1]?.content).toBe('Hello Robert');
  });

  it('carries the template name and version on the result', () => {
    // What makes "the agent got worse after a prompt change" attributable.
    const rendered = renderPrompt(greeting, { name: 'x' });

    expect(rendered.templateName).toBe('test.greeting');
    expect(rendered.templateVersion).toBe('1.0.0');
  });

  it('estimates its own size, so a context problem is visible before it is an error', () => {
    const rendered = renderPrompt(greeting, { name: 'Robert' });

    expect(rendered.estimatedTokens).toBeGreaterThan(0);
  });

  it('builds a tool message carrying the call id', () => {
    const message = toolMessage('call_1', '{"ok":true}');

    expect(message.role).toBe('tool');
    expect(message.toolCallId).toBe('call_1');
  });
});

describe('token estimation', () => {
  it('approximates four characters per token', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });

  it('counts per-message overhead', () => {
    // Role and separators cost tokens the content length does not show.
    const single = estimateMessagesTokens([userMessage('abcd')]);

    expect(single).toBeGreaterThan(estimateTokens('abcd'));
  });

  it('handles an empty prompt', () => {
    expect(estimateMessagesTokens([])).toBe(0);
  });
});

describe('section helpers', () => {
  it('labels a block', () => {
    expect(section('Goal', 'Message Robert')).toBe('## Goal\nMessage Robert');
  });

  it('drops an empty section rather than leaving a labelled gap', () => {
    // A prompt full of unexplained blank headings measurably confuses smaller models.
    expect(section('Goal', '')).toBeNull();
    expect(section('Goal', null)).toBeNull();
    expect(section('Goal', '   ')).toBeNull();
  });

  it('joins only the sections that exist', () => {
    expect(joinSections('a', null, 'b', undefined, '')).toBe('a\n\nb');
  });

  it('numbers a list so the model can refer to a step', () => {
    expect(numberedList(['open the app', 'find the contact'])).toBe(
      '1. open the app\n2. find the contact',
    );
  });

  it('renders nothing for an empty list', () => {
    expect(numberedList([])).toBeNull();
  });
});

describe('redaction', () => {
  it('recognises credential-shaped keys', () => {
    expect(isRedactedKey('apiKey')).toBe(true);
    expect(isRedactedKey('api_key')).toBe(true);
    expect(isRedactedKey('Authorization')).toBe(true);
    expect(isRedactedKey('X-Auth-Token')).toBe(true);
    expect(isRedactedKey('openaiApiKey')).toBe(true);
    expect(isRedactedKey('password')).toBe(true);
  });

  it('leaves ordinary keys alone', () => {
    expect(isRedactedKey('text')).toBe(false);
    expect(isRedactedKey('resourceId')).toBe(false);
    expect(isRedactedKey('packageName')).toBe(false);
  });

  it('redacts a nested secret', () => {
    // A key at depth four is exactly as dangerous as one at the top.
    const redacted = redact({
      provider: { config: { apiKey: 'sk-live-secret', model: 'gpt-4o' } },
    }) as { provider: { config: { apiKey: string; model: string } } };

    expect(redacted.provider.config.apiKey).toBe(REDACTION_PLACEHOLDER);
    expect(redacted.provider.config.model).toBe('gpt-4o');
  });

  it('redacts inside arrays', () => {
    const redacted = redact([{ token: 'abc' }, { text: 'Send' }]) as [
      { token: string },
      { text: string },
    ];

    expect(redacted[0].token).toBe(REDACTION_PLACEHOLDER);
    expect(redacted[1].text).toBe('Send');
  });

  it('preserves structure, so the model still sees a field existed', () => {
    // Matters when reasoning about a login screen.
    const redacted = redact({ form: { password: 'hunter2' } }) as {
      form: { password: string };
    };

    expect(Object.keys(redacted.form)).toEqual(['password']);
  });

  it('passes primitives through', () => {
    expect(redact('plain')).toBe('plain');
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBeNull();
  });

  it('serialises for a prompt with secrets removed', () => {
    const json = toPromptJson({ apiKey: 'sk-secret', model: 'local' });

    expect(json).not.toContain('sk-secret');
    expect(json).toContain('local');
  });

  it('lists the keys it guards', () => {
    expect(REDACTED_KEYS).toContain('apikey');
    expect(REDACTED_KEYS).toContain('bearer');
  });
});

describe('truncation', () => {
  it('leaves text within budget untouched', () => {
    expect(truncateToTokens('short', 100)).toBe('short');
  });

  it('says when it truncated, rather than stopping silently', () => {
    // Text that ends mid-sentence with no marker reads as the whole content, and the
    // model will reason confidently about a screen it only half saw.
    const truncated = truncateToTokens('a'.repeat(1_000), 10);

    expect(truncated).toContain('truncated');
    expect(truncated).toContain('omitted');
  });

  it('keeps the beginning', () => {
    const truncated = truncateToTokens('START' + 'x'.repeat(1_000), 10);

    expect(truncated.startsWith('START')).toBe(true);
  });
});

describe('keepRecentWithinBudget', () => {
  const size = (item: { tokens: number }) => item.tokens;

  it('keeps everything when it fits', () => {
    const items = [{ tokens: 10 }, { tokens: 10 }];

    const result = keepRecentWithinBudget(items, 100, size);

    expect(result.kept).toHaveLength(2);
    expect(result.droppedCount).toBe(0);
  });

  it('drops the oldest, since the newest describes the current screen', () => {
    const items = [{ tokens: 60 }, { tokens: 30 }, { tokens: 30 }];

    const result = keepRecentWithinBudget(items, 70, size);

    expect(result.kept).toEqual([{ tokens: 30 }, { tokens: 30 }]);
    expect(result.droppedCount).toBe(1);
  });

  it('preserves chronological order in what it keeps', () => {
    const items = [{ tokens: 1 }, { tokens: 2 }, { tokens: 3 }];

    expect(keepRecentWithinBudget(items, 100, size).kept).toEqual(items);
  });

  it('keeps at least one item even when it exceeds the budget', () => {
    // Dropping everything would leave the model with no history at all, which is
    // worse than being slightly over budget.
    const result = keepRecentWithinBudget([{ tokens: 5_000 }], 10, size);

    expect(result.kept).toHaveLength(1);
  });

  it('handles an empty list', () => {
    const result = keepRecentWithinBudget([], 100, size);

    expect(result.kept).toEqual([]);
    expect(result.droppedCount).toBe(0);
  });
});
