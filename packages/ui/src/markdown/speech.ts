import { type InlineToken, type MarkdownBlock, parseMarkdown } from './parse';

/**
 * Markdown as plain text, for speech.
 *
 * Separate from rendering on purpose, and the reason is concrete: a voice reading "star star Send star star" is
 * worse than no voice at all. Text-to-speech gets this; the panel gets the rendered version.
 *
 * It is not a regex over the source, because that mangles the cases that matter. `runOcr` in backticks should be
 * spoken as `runOcr`, a fenced block should be summarised rather than read line by line, and a list needs its
 * items separated by something a voice can pause on. Going through the same tokeniser the renderer uses is what
 * keeps the two from disagreeing about what the text says.
 */

/**
 * How a code block is spoken.
 *
 * Not read out. A voice reading twenty lines of Kotlin is useless and cannot be interrupted usefully, so the
 * listener is told it exists and can look at the panel.
 */
const codeBlockPhrase = (language: string | null): string =>
  language === null
    ? 'There is a code block on screen.'
    : `There is a ${language} code block on screen.`;

/**
 * Strips markdown for speech.
 *
 * Blocks are joined by a blank line, which most TTS engines render as a sentence pause — the separation a
 * listener needs to tell one list item from the next.
 */
export const stripMarkdown = (source: string): string => {
  const spoken = parseMarkdown(source)
    .map(speakBlock)
    .filter((line) => line !== '');

  return spoken.join('\n\n');
};

const speakBlock = (block: MarkdownBlock): string => {
  switch (block.type) {
    case 'code':
      return codeBlockPhrase(block.language);

    case 'rule':
      // A divider is visual. Reading anything for it would be noise.
      return '';

    case 'listItem':
      // The bullet character is dropped and the number is kept: "one, open WhatsApp" is how a person reads a
      // numbered list aloud, while "hyphen open WhatsApp" is not how anyone reads anything.
      return block.ordinal === null
        ? spansToText(block.spans)
        : `${block.ordinal}. ${spansToText(block.spans)}`;

    case 'heading':
    case 'paragraph':
      return spansToText(block.spans);
  }
};

const spansToText = (spans: readonly InlineToken[]): string =>
  spans
    .map((span) => span.text)
    .join('')
    // Inline code keeps its content but a run of whitespace from stripped markers reads as a stumble.
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
