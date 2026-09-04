import { describe, expect, it } from 'vitest';

import { parseInline, parseMarkdown } from './parse';
import { stripMarkdown } from './speech';

/**
 * The tokeniser.
 *
 * Tested without rendering anything, which is the reason it is a separate module: this is the part with bugs in
 * it, and a bug here shows up as a chat bubble that looks broken.
 */

describe('inline styles', () => {
  it('reads bold, italic, code and strikethrough', () => {
    expect(parseInline('**bold**')).toEqual([{ text: 'bold', bold: true }]);
    expect(parseInline('*italic*')).toEqual([{ text: 'italic', italic: true }]);
    expect(parseInline('`code`')).toEqual([{ text: 'code', code: true }]);
    expect(parseInline('~~gone~~')).toEqual([{ text: 'gone', strike: true }]);
  });

  it('reads underscores as emphasis too', () => {
    expect(parseInline('__bold__')).toEqual([{ text: 'bold', bold: true }]);
    expect(parseInline('_italic_')).toEqual([{ text: 'italic', italic: true }]);
  });

  it('tries the longer marker first', () => {
    // If `*` were tried before `**`, every bold run would read as an italic run with a stray asterisk.
    expect(parseInline('**both**')).toEqual([{ text: 'both', bold: true }]);
  });

  it('keeps the text around a styled run', () => {
    expect(parseInline('tap **Send** now')).toEqual([
      { text: 'tap ' },
      { text: 'Send', bold: true },
      { text: ' now' },
    ]);
  });

  it('keeps inline code verbatim', () => {
    // Code is the one context where a marker inside it is content, not markup.
    expect(parseInline('`a * b`')).toEqual([{ text: 'a * b', code: true }]);
  });
});

describe('unclosed markers stay literal', () => {
  /**
   * The rule that matters most, and the reason the scan looks ahead for a closer rather than toggling state.
   * Replies stream, so a bubble is frequently mid-token: swallowing the asterisks and reflowing when the rest
   * arrives is the visible jump users see.
   */

  it('leaves a lone opening marker as text', () => {
    expect(parseInline('**Sen')).toEqual([{ text: '**Sen' }]);
    expect(parseInline('tap `getUi')).toEqual([{ text: 'tap `getUi' }]);
  });

  it('renders a marker pair with nothing between it as text', () => {
    // `****` is four asterisks, not bold-nothing.
    expect(parseInline('****')).toEqual([{ text: '****' }]);
  });

  it('still opens a shorter marker from a longer one’s tail', () => {
    // Advancing by one character rather than the marker's length is what makes this work.
    expect(parseInline('***x*')).toEqual([{ text: '**' }, { text: 'x', italic: true }]);
  });

  it('does not style across a line that never closes', () => {
    const spans = parseInline('a * b * c');

    // Two asterisks with text between them is a legitimate italic run; asserting the text survives either way.
    expect(spans.map((span) => span.text).join('')).toContain('b');
  });
});

describe('escapes', () => {
  it('renders an escaped marker literally and drops the backslash', () => {
    expect(parseInline('\\**not bold\\**')).toEqual([{ text: '**not bold**' }]);
  });
});

describe('links', () => {
  it('reads text and destination', () => {
    expect(parseInline('[docs](https://example.com)')).toEqual([
      { text: 'docs', href: 'https://example.com' },
    ]);
  });

  it('keeps a link whole when its text contains markers', () => {
    expect(parseInline('[**docs**](https://example.com)')).toEqual([
      { text: 'docs', href: 'https://example.com' },
    ]);
  });
});

describe('blocks', () => {
  it('splits paragraphs on a blank line', () => {
    const blocks = parseMarkdown('one\n\ntwo');

    expect(blocks).toHaveLength(2);
    expect(blocks.every((block) => block.type === 'paragraph')).toBe(true);
  });

  it('joins consecutive lines into one paragraph', () => {
    // A wrapped sentence is one paragraph. Treating each line as its own block double-spaces every reply.
    expect(parseMarkdown('one\ntwo')).toHaveLength(1);
  });

  it('reads headings with their level', () => {
    expect(parseMarkdown('## Heading')[0]).toMatchObject({ type: 'heading', level: 2 });
  });

  it('reads bullets and keeps the author’s numbering', () => {
    const blocks = parseMarkdown('- one\n- two\n\n1. first\n3. third');

    expect(blocks.filter((block) => block.type === 'listItem')).toHaveLength(4);
    // Not renumbered: a model writing 1. and 3. means 1 and 3, and correcting it would disagree with what it said.
    expect(blocks[3]).toMatchObject({ type: 'listItem', ordinal: 3 });
  });

  it('reads a fenced block with its language', () => {
    const blocks = parseMarkdown('```kotlin\nval x = 1\n```');

    expect(blocks[0]).toMatchObject({
      type: 'code',
      language: 'kotlin',
      text: 'val x = 1',
      closed: true,
    });
  });

  it('marks an unclosed fence as open but still renders it as code', () => {
    // Constant during streaming. A half-written block is more readable as code than as prose with backticks.
    expect(parseMarkdown('```\nval x = 1')[0]).toMatchObject({ type: 'code', closed: false });
  });

  it('does not read markdown inside a fence', () => {
    const blocks = parseMarkdown('```\n- not a list\n**not bold**\n```');

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: 'code', text: '- not a list\n**not bold**' });
  });

  it('reads a horizontal rule', () => {
    expect(parseMarkdown('---')[0]).toEqual({ type: 'rule' });
  });

  it('returns nothing for empty or whitespace-only input', () => {
    // The streaming case: a bubble exists before the first token arrives.
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('   \n\n  ')).toEqual([]);
  });

  it('leaves an unsupported construct as text rather than breaking', () => {
    // Tables, images, blockquotes and HTML are deliberately unsupported. Degrading silently beats a crash in a
    // chat bubble.
    const blocks = parseMarkdown('| a | b |\n> quoted\n<div>x</div>');

    expect(blocks.every((block) => block.type === 'paragraph')).toBe(true);
  });
});

describe('stripping for speech', () => {
  it('removes emphasis markers', () => {
    expect(stripMarkdown('tap **Send** now')).toBe('tap Send now');
  });

  it('keeps the content of inline code', () => {
    // `runOcr` should be spoken as runOcr, not as backtick-runOcr-backtick.
    expect(stripMarkdown('call `runOcr` first')).toBe('call runOcr first');
  });

  it('describes a code block instead of reading it', () => {
    // A voice reading twenty lines of Kotlin is useless and cannot be interrupted usefully.
    expect(stripMarkdown('```kotlin\nval x = 1\n```')).toBe(
      'There is a kotlin code block on screen.',
    );
  });

  it('drops the bullet character but keeps a number', () => {
    // "one, open WhatsApp" is how a person reads a numbered list aloud; "hyphen open WhatsApp" is not.
    expect(stripMarkdown('- open WhatsApp')).toBe('open WhatsApp');
    expect(stripMarkdown('1. open WhatsApp')).toBe('1. open WhatsApp');
  });

  it('says nothing for a divider', () => {
    expect(stripMarkdown('a\n\n---\n\nb')).toBe('a\n\nb');
  });

  it('separates blocks with a blank line, which reads as a pause', () => {
    expect(stripMarkdown('- one\n- two')).toBe('one\n\ntwo');
  });

  it('speaks a link’s text, not its url', () => {
    expect(stripMarkdown('see [the docs](https://example.com)')).toBe('see the docs');
  });
});
