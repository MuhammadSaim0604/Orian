import { Markdown } from '@mobile-automation/ui';
import { render } from '@testing-library/react-native';

import { renderWithTheme } from '../../../test/renderWithTheme';

/**
 * The markdown renderer, as it actually renders.
 *
 * The tokeniser has its own tests in `packages/ui`. These cover the part those cannot: that the tree comes out as
 * separate elements with the right text in them, and that the failure modes degrade rather than throw. A crash in
 * this component would take out a chat bubble mid-conversation.
 */

describe('rendering', () => {
  it('shows the text of a paragraph', () => {
    const { getByText } = renderWithTheme(<Markdown>{'hello there'}</Markdown>);

    expect(getByText('hello there')).toBeTruthy();
  });

  it('shows the text of a bold run without its markers', () => {
    // The defect this whole feature exists for: `**Send**` used to appear with the asterisks.
    const { getByText, queryByText } = renderWithTheme(<Markdown>{'tap **Send** now'}</Markdown>);

    expect(getByText('Send')).toBeTruthy();
    expect(queryByText('**Send**')).toBeNull();
  });

  it('renders a bullet beside a list item', () => {
    const { getByText } = renderWithTheme(<Markdown>{'- open WhatsApp'}</Markdown>);

    // Separate elements rather than one string: a list item needs its own row, which is not expressible inside a
    // single `Text`.
    expect(getByText('•')).toBeTruthy();
    expect(getByText('open WhatsApp')).toBeTruthy();
  });

  it('keeps the author’s own numbering', () => {
    const { getByText } = renderWithTheme(<Markdown>{'3. third thing'}</Markdown>);

    expect(getByText('3.')).toBeTruthy();
  });

  it('renders a fenced block as its contents', () => {
    const { getByText } = renderWithTheme(<Markdown>{'```kotlin\nval x = 1\n```'}</Markdown>);

    expect(getByText('val x = 1')).toBeTruthy();
  });

  it('renders a heading', () => {
    const { getByText } = renderWithTheme(<Markdown>{'## Results'}</Markdown>);

    expect(getByText('Results')).toBeTruthy();
  });

  it('renders a link’s text', () => {
    const { getByText } = renderWithTheme(
      <Markdown>{'see [the docs](https://example.com)'}</Markdown>,
    );

    expect(getByText('the docs')).toBeTruthy();
  });
});

describe('streaming', () => {
  it('renders nothing at all for an empty string', () => {
    // A bubble exists before the first token arrives. A view with no children still takes its padding, so it would
    // otherwise show as a visible empty box.
    //
    // Rendered bare rather than through `renderWithTheme`, which wraps the tree in a safe-area provider — the
    // wrapper would be the JSON and the assertion would pass whatever this component did.
    const { toJSON } = render(<Markdown>{''}</Markdown>);

    expect(toJSON()).toBeNull();
  });

  it('leaves an unclosed marker on screen as text', () => {
    // Mid-token is the normal state while a reply streams. Swallowing the asterisks and reflowing when the rest
    // arrives is the visible jump users see.
    const { getByText } = renderWithTheme(<Markdown>{'**Sen'}</Markdown>);

    expect(getByText('**Sen')).toBeTruthy();
  });

  it('renders a half-written code block as code', () => {
    const { getByText } = renderWithTheme(<Markdown>{'```\nval x ='}</Markdown>);

    expect(getByText('val x =')).toBeTruthy();
  });
});

describe('degrading rather than breaking', () => {
  it('renders an unsupported construct as plain text', () => {
    // Tables, blockquotes and HTML are deliberately unsupported. Silently degrading beats a crash inside a chat.
    const { getByText } = renderWithTheme(<Markdown>{'> quoted thing'}</Markdown>);

    expect(getByText('> quoted thing')).toBeTruthy();
  });

  it('survives text that is nothing but punctuation', () => {
    expect(() => renderWithTheme(<Markdown>{'*** ` ~~ [ ]( )'}</Markdown>)).not.toThrow();
  });
});

describe('accessibility', () => {
  it('announces the whole reply from one label', () => {
    // A reader walking a dozen separate `Text` nodes announces the message in fragments.
    const source = '**Done.** I sent the message.';

    const { getByLabelText } = renderWithTheme(
      <Markdown accessibilityLabel={source}>{source}</Markdown>,
    );

    expect(getByLabelText(source)).toBeTruthy();
  });
});

describe('rendering outside a theme provider', () => {
  it('still renders, because colour comes from className', () => {
    // What lets the same renderer work in an overlay window that shares no ancestor with the app. If this needed
    // `useTheme()` it would throw here, and the Orion Assist panel would be blank.
    const { getByText } = render(<Markdown>{'hello'}</Markdown>);

    expect(getByText('hello')).toBeTruthy();
  });
});
