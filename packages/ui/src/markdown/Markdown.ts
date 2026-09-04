import { createElement, type ReactNode } from 'react';
import { Linking, Text, View } from 'react-native';

import { type InlineToken, type MarkdownBlock, parseMarkdown } from './parse';

/**
 * Renders markdown.
 *
 * Used by every surface that shows model text — the chat bubble, the Orion Assist panel, and the node toolset
 * overlay. It lives in `ui` rather than in the app because the overlays are separate React roots: a renderer in
 * `features/agent` would have to be imported upward from an overlay, which the dependency rules forbid.
 *
 * Written with `createElement` like the rest of this package, so it stays a `.ts` file.
 *
 * ## Two decisions worth knowing
 *
 * **Blocks are separate `Text` elements, not one nested tree.** React Native supports nested `Text` for inline
 * runs, but a list item needs its own row with a bullet beside it and a code block needs a different background —
 * neither is expressible inside a single `Text`. So inline styling nests and block structure does not.
 *
 * **Colour comes from className, not from `useTheme()`.** Everything visible resolves through NativeWind, which
 * is what lets this render identically in the app and in an overlay window with no shared ancestor.
 */

export interface MarkdownProps {
  readonly children: string;
  /** Tailwind text classes for body text, so a chat bubble and an overlay can size it differently. */
  readonly textClassName?: string;
  /** Opens a link. Defaults to `Linking.openURL`; the overlays pass their own, since they are not the activity. */
  readonly onLinkPress?: (url: string) => void;
  readonly accessibilityLabel?: string;
}

const DEFAULT_TEXT = 'text-sm text-text-primary';

export const Markdown = ({
  children,
  textClassName = DEFAULT_TEXT,
  onLinkPress,
  accessibilityLabel,
}: MarkdownProps) => {
  const blocks = parseMarkdown(children);

  // An empty string is a real case during streaming — the bubble exists before the first token arrives — and a
  // view with no children still takes its padding, so it renders as a visible empty box.
  if (blocks.length === 0) return null;

  return createElement(
    View,
    {
      accessible: accessibilityLabel !== undefined,
      // The screen reader gets the source rather than the tree. A reader walking twelve separate Text nodes
      // announces the message in fragments; one label reads it as the sentence it is.
      accessibilityLabel,
      className: 'w-full',
    },
    blocks.map((block, index) =>
      renderBlock(block, index, textClassName, onLinkPress, index === 0),
    ),
  );
};

const renderBlock = (
  block: MarkdownBlock,
  key: number,
  textClassName: string,
  onLinkPress: ((url: string) => void) | undefined,
  first: boolean,
): ReactNode => {
  // Spacing goes above each block except the first, so a message never opens with a gap.
  const spacing = first ? '' : 'mt-2';

  switch (block.type) {
    case 'paragraph':
      return createElement(
        Text,
        { key, className: `${textClassName} ${spacing}` },
        renderSpans(block.spans, onLinkPress),
      );

    case 'heading':
      return createElement(
        Text,
        {
          key,
          // Only two sizes for six levels. A model's choice between `##` and `###` carries no meaning worth
          // rendering, and six sizes in a chat bubble looks like a website.
          className: `${block.level <= 2 ? 'text-base' : 'text-sm'} font-semibold text-text-primary ${first ? '' : 'mt-3'}`,
        },
        renderSpans(block.spans, onLinkPress),
      );

    case 'listItem':
      return createElement(
        View,
        { key, className: `flex-row ${first ? '' : 'mt-1'}` },
        createElement(
          Text,
          // Fixed width so the text of every item lines up. Without it a two-digit number pushes its line right
          // and the list looks ragged.
          { className: `${textClassName} w-5 text-right` },
          block.ordinal === null ? '•' : `${block.ordinal}.`,
        ),
        createElement(
          Text,
          { className: `${textClassName} flex-1 pl-2` },
          renderSpans(block.spans, onLinkPress),
        ),
      );

    case 'code':
      return createElement(
        View,
        {
          key,
          className: `rounded-md bg-surface-muted px-2.5 py-2 ${first ? '' : 'mt-2'}`,
        },
        createElement(
          Text,
          {
            // `font-mono` rather than a platform font name: alignment is the whole point of a code block, and a
            // proportional fallback makes it unreadable.
            className: 'font-mono text-xs text-text-primary',
          },
          block.text,
        ),
      );

    case 'rule':
      return createElement(View, {
        key,
        className: `h-px w-full bg-border ${first ? '' : 'my-2'}`,
      });
  }
};

/**
 * Inline runs as nested `Text`.
 *
 * A nested `Text` inherits its parent's size and colour and overrides only what it sets, which is why each span
 * carries just its own emphasis.
 */
const renderSpans = (
  spans: readonly InlineToken[],
  onLinkPress: ((url: string) => void) | undefined,
): readonly ReactNode[] =>
  spans.map((span, key) => {
    if (span.href !== undefined) {
      const href = span.href;

      return createElement(
        Text,
        {
          key,
          className: 'text-primary underline',
          accessibilityRole: 'link',
          onPress: () => {
            // A failed open is ignored rather than surfaced. The URL comes from a model and may be malformed;
            // an unhandled rejection inside a chat bubble is worse than a tap that does nothing.
            if (onLinkPress !== undefined) onLinkPress(href);
            else void Linking.openURL(href).catch(() => undefined);
          },
        },
        span.text,
      );
    }

    return createElement(
      Text,
      {
        key,
        className: [
          span.bold === true ? 'font-semibold' : '',
          span.italic === true ? 'italic' : '',
          span.strike === true ? 'line-through' : '',
          // Inline code gets a monospace face but no background: a background on a run inside a line of text
          // cannot be padded in React Native, so it renders as a tight box that clips the glyphs.
          span.code === true ? 'font-mono text-text-secondary' : '',
        ]
          .filter((entry) => entry !== '')
          .join(' '),
      },
      span.text,
    );
  });
