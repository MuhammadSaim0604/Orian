/**
 * Markdown rendering, shared by every surface that shows model text.
 *
 * Exported from `ui` rather than the app because the overlays are separate React roots and may not import
 * upward from `apps/mobile`.
 */

export {
  type CodeBlock,
  type HeadingBlock,
  type InlineToken,
  type ListItemBlock,
  type MarkdownBlock,
  type ParagraphBlock,
  type RuleBlock,
  parseInline,
  parseMarkdown,
} from './parse';

export { Markdown, type MarkdownProps } from './Markdown';

export { stripMarkdown } from './speech';
