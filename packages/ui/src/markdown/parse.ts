/**
 * Markdown, tokenised.
 *
 * ## Why this exists rather than a library
 *
 * Models reply in markdown whether or not anyone asked, and the chat rendered it as raw text — so `**Send**`
 * appeared with its asterisks and a list arrived as one run-together paragraph. Correct answers looked broken.
 *
 * `react-native-markdown-display` is the obvious fix and was rejected: unmaintained, pulls a full commonmark
 * parser, and needs a style object per element that would have to be rebuilt against our theme anyway. What
 * actually appears in these replies is a small subset, and a small subset is testable.
 *
 * ## The rule that matters most
 *
 * **An unclosed marker stays literal.** Replies stream, so a bubble is frequently mid-token: `**Sen` must render
 * as `**Sen`, not swallow the asterisks and reflow when the rest arrives. Every visible jump in a streaming
 * reply is that bug, and it is why matching is done by looking for a closing marker rather than by toggling
 * state on each delimiter.
 *
 * ## Deliberately not supported
 *
 * Tables, images, blockquotes, nested lists past one level, HTML. Each renders as plain text rather than
 * breaking — silently degrading beats a crash inside a chat bubble.
 */

/** A run of text with its emphasis. Nesting is not supported; the innermost marker wins. */
export type InlineToken = {
  readonly text: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly code?: boolean;
  readonly strike?: boolean;
  /** Set on a link. The text is what to show; this is where to go. */
  readonly href?: string;
};

export type ParagraphBlock = {
  readonly type: 'paragraph';
  readonly spans: readonly InlineToken[];
};

export type HeadingBlock = {
  readonly type: 'heading';
  /** 1 to 6, clamped. Rendering only distinguishes a couple of sizes. */
  readonly level: number;
  readonly spans: readonly InlineToken[];
};

export type ListItemBlock = {
  readonly type: 'listItem';
  /** Null for a bullet, a number for an ordered item. The author's own numbering is kept. */
  readonly ordinal: number | null;
  readonly spans: readonly InlineToken[];
};

/**
 * A fenced code block.
 *
 * `closed` is false while the closing fence has not arrived, which happens constantly during streaming. The
 * renderer still shows it as code — a half-written block is more readable as code than as prose with stray
 * backticks.
 */
export type CodeBlock = {
  readonly type: 'code';
  readonly language: string | null;
  readonly text: string;
  readonly closed: boolean;
};

/** A horizontal rule. Cheap to support and models use it to separate sections. */
export type RuleBlock = { readonly type: 'rule' };

export type MarkdownBlock = ParagraphBlock | HeadingBlock | ListItemBlock | CodeBlock | RuleBlock;

const FENCE = /^\s*```(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const RULE = /^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/;

/**
 * Splits markdown into blocks.
 *
 * Line-based rather than a real parser, which is the whole reason it is affordable. Every branch is a line
 * shape, and anything unrecognised becomes paragraph text.
 */
export const parseMarkdown = (source: string): readonly MarkdownBlock[] => {
  const blocks: MarkdownBlock[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');

  let paragraph: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;

    const text = paragraph.join('\n').trim();
    paragraph = [];

    if (text !== '') blocks.push({ type: 'paragraph', spans: parseInline(text) });
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;

    const fence = FENCE.exec(line);

    if (fence !== null) {
      flushParagraph();

      const language = fence[1]!.trim();
      const body: string[] = [];
      let closed = false;

      // Consumed here rather than by a state flag, so a fence's contents can never be mistaken for markdown.
      // A code block containing `- item` is a code block.
      index++;

      while (index < lines.length) {
        if (FENCE.test(lines[index]!)) {
          closed = true;
          break;
        }

        body.push(lines[index]!);
        index++;
      }

      blocks.push({
        type: 'code',
        language: language === '' ? null : language,
        // Trailing newline trimmed, leading indentation kept: indentation is meaning inside code.
        text: body.join('\n').replace(/\n+$/, ''),
        closed,
      });

      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      continue;
    }

    if (RULE.test(line)) {
      flushParagraph();
      blocks.push({ type: 'rule' });
      continue;
    }

    const heading = HEADING.exec(line);

    if (heading !== null) {
      flushParagraph();
      blocks.push({
        type: 'heading',
        level: heading[1]!.length,
        spans: parseInline(heading[2]!.trim()),
      });
      continue;
    }

    const ordered = ORDERED.exec(line);

    if (ordered !== null) {
      flushParagraph();
      blocks.push({
        type: 'listItem',
        // The author's number, not our own count. A model writing "1." three times means three items numbered 1,
        // and renumbering would silently disagree with what it said.
        ordinal: Number.parseInt(ordered[1]!, 10),
        spans: parseInline(ordered[2]!),
      });
      continue;
    }

    const bullet = BULLET.exec(line);

    if (bullet !== null) {
      flushParagraph();
      blocks.push({ type: 'listItem', ordinal: null, spans: parseInline(bullet[1]!) });
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();

  return blocks;
};

/**
 * Inline markers, longest first.
 *
 * Order is load-bearing: `**` has to be tried before `*`, or every bold run would be read as an italic run
 * containing a stray asterisk.
 */
const INLINE_MARKERS: readonly { readonly marker: string; readonly style: keyof InlineStyle }[] = [
  { marker: '```', style: 'code' },
  { marker: '**', style: 'bold' },
  { marker: '__', style: 'bold' },
  { marker: '~~', style: 'strike' },
  { marker: '`', style: 'code' },
  { marker: '*', style: 'italic' },
  { marker: '_', style: 'italic' },
];

type InlineStyle = { bold: boolean; italic: boolean; code: boolean; strike: boolean };

const LINK = /^\[([^\]]*)\]\(([^)\s]+)\)/;

/**
 * Splits one line into styled runs.
 *
 * Scans forward and, at each marker, **looks ahead for its closing pair before committing**. That is what keeps
 * an unclosed marker literal: with no closer the marker is emitted as text and the scan moves on by one
 * character. A state-toggling parser cannot do this — it has already changed style by the time it discovers the
 * line ended.
 *
 * Nesting is not supported. `**bold *and italic*** ` renders as bold throughout, which is the failure that
 * matters least: it looks slightly wrong rather than showing punctuation.
 */
export const parseInline = (source: string): readonly InlineToken[] => {
  const tokens: InlineToken[] = [];
  let plain = '';

  const flush = (): void => {
    if (plain !== '') {
      tokens.push({ text: plain });
      plain = '';
    }
  };

  let index = 0;

  while (index < source.length) {
    const rest = source.slice(index);

    // Links first: their text may itself contain markers, and `[**x**](url)` should stay one link.
    const link = LINK.exec(rest);

    if (link !== null) {
      flush();
      tokens.push({ text: stripInlineMarkers(link[1]!), href: link[2]! });
      index += link[0].length;
      continue;
    }

    const escaped = rest.startsWith('\\') && rest.length > 1;

    if (escaped) {
      const after = rest.slice(1);

      // The whole marker is consumed, not one character of it. Advancing by two would leave `*` behind from an
      // escaped `**`, and that lone asterisk then opens an emphasis run the author explicitly escaped.
      const escapedMarker = INLINE_MARKERS.find((candidate) => after.startsWith(candidate.marker));

      if (escapedMarker !== undefined) {
        plain += escapedMarker.marker;
        index += 1 + escapedMarker.marker.length;
        continue;
      }

      // A backslash before anything else is literal text, backslash included: models use it in paths and in
      // regexes, and swallowing it would corrupt what they wrote.
      plain += rest.slice(0, 2);
      index += 2;
      continue;
    }

    const marker = INLINE_MARKERS.find((candidate) => rest.startsWith(candidate.marker));

    if (marker !== undefined) {
      const closeAt = source.indexOf(marker.marker, index + marker.marker.length);

      // Closed, and with something between the markers. `****` is not bold-nothing, it is four asterisks.
      if (closeAt > index + marker.marker.length) {
        const inner = source.slice(index + marker.marker.length, closeAt);

        flush();

        tokens.push({
          // Code is verbatim by definition; everything else may hold markers we do not nest, so they are
          // stripped rather than left to appear as punctuation.
          text: marker.style === 'code' ? inner : stripInlineMarkers(inner),
          [marker.style]: true,
        });

        index = closeAt + marker.marker.length;
        continue;
      }

      // Unclosed. The marker is text, and the scan advances one character rather than the marker's length so a
      // longer marker's tail can still open a shorter one: `***x*` opens on the third asterisk.
      plain += source[index]!;
      index += 1;
      continue;
    }

    plain += source[index]!;
    index += 1;
  }

  flush();

  return tokens;
};

/** Removes inline markers without applying them, for a context that cannot nest. */
const stripInlineMarkers = (value: string): string => value.replace(/(\*\*|__|~~|`|\*|_)/g, '');
