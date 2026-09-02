import { z } from 'zod';

/**
 * The template model: a prompt is data, not an inline string.
 *
 * Every prompt in the product is built here rather than concatenated at a call site,
 * which is what makes them testable and diffable. A prompt that drives someone's
 * phone is behaviour, and behaviour that only exists inside a template literal three
 * layers down cannot be reviewed.
 *
 * Templates are **named and versioned**. When agent behaviour changes because a
 * prompt changed, the version is what makes that traceable in a trace or a bug
 * report - otherwise "the agent got worse" has no attributable cause.
 */

export const MESSAGE_ROLES = ['system', 'user', 'assistant', 'tool'] as const;

export const MessageRoleSchema = z.enum(MESSAGE_ROLES);

export type MessageRole = z.infer<typeof MessageRoleSchema>;

/** Plain text in a multi-part message. */
export type TextPart = { readonly type: 'text'; readonly text: string };

/**
 * An image in a multi-part message.
 *
 * The url is a `data:` URL carrying base64 bytes, because a screenshot lives in the app's private storage and
 * no provider can fetch a `file://` path off someone's phone.
 */
export type ImagePart = {
  readonly type: 'image_url';
  readonly imageUrl: {
    readonly url: string;
    readonly detail?: 'auto' | 'low' | 'high';
  };
};

export type ContentPart = TextPart | ImagePart;

/**
 * A tool call the model asked for, as it must be sent back.
 *
 * `arguments` stays a **JSON string**, never a parsed object. The protocol defines it as a string, and a
 * re-serialized object is not guaranteed to be byte-identical — which matters because some providers hash the
 * assistant turn to match it against the tool results that answer it.
 */
export type MessageToolCall = {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
};

/**
 * One Chat Completions message (ADR 0007).
 *
 * This is the wire shape, and it deliberately covers all four roles rather than just the two the agent used to
 * send. The previous version was `{ role, content: string, toolCallId? }`, which **could not express an
 * assistant turn that called a tool** — so the loop had no way to record what the model did, and the request
 * carried only system and user messages no matter how many steps had been taken.
 *
 * `content` is nullable because an assistant message that only calls a tool has no prose, and sending `""`
 * instead of `null` reads to some providers as an empty reply rather than an absent one.
 */
export type PromptMessage = {
  readonly role: MessageRole;
  readonly content: string | readonly ContentPart[] | null;
  /** Set on an `assistant` message that called tools. */
  readonly toolCalls?: readonly MessageToolCall[];
  /** Set on a `tool` message, matching the id of the call being answered. */
  readonly toolCallId?: string;
  /**
   * The model's reasoning, when it emitted any.
   *
   * Kept on the message so the transcript holds it in the right place, but **not sent back by default** — see
   * `SEND_REASONING_BY_DEFAULT` in the provider. It is here for the UI and the trace, not for the wire.
   */
  readonly reasoning?: string;
};

/** A rendered prompt, ready to send. */
export type RenderedPrompt = {
  readonly templateName: string;
  readonly templateVersion: string;
  readonly messages: readonly PromptMessage[];
  /**
   * Rough token estimate for the whole prompt.
   *
   * Carried on the result so a caller can log it and see a context problem coming,
   * rather than discovering it as a provider error.
   */
  readonly estimatedTokens: number;
};

/**
 * A named, versioned prompt template.
 *
 * `render` returns messages rather than a single string because Chat Completions
 * distinguishes system from user content, and collapsing them loses the distinction
 * that makes a model follow instructions rather than treat them as data.
 */
export type PromptTemplate<TInput> = {
  readonly name: string;
  readonly version: string;
  /** What this prompt is for, so a reader need not reverse-engineer it. */
  readonly purpose: string;
  render: (input: TInput) => readonly PromptMessage[];
};

/**
 * Rough token count.
 *
 * Four characters per token is the usual English approximation. Deliberately not a
 * real tokenizer: shipping one to a phone costs megabytes to make a *budgeting*
 * decision that only needs to be roughly right, and every trimming decision here has
 * slack built in.
 */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

export const estimateMessagesTokens = (messages: readonly PromptMessage[]): number =>
  messages.reduce(
    // Four tokens per message covers the role and separators the provider adds.
    (total, message) => total + estimateTokens(textOf(message)) + 4,
    0,
  );

/**
 * The readable text of a message, for estimation and for a log line.
 *
 * An image part contributes its own cost to a real provider, but not one measurable from a data URL's length —
 * a 2 MB base64 string is not 500 000 tokens. Counting only the text keeps the estimate honest about what it
 * can know rather than wildly wrong.
 */
export const textOf = (message: PromptMessage): string => {
  if (message.content === null) return '';
  if (typeof message.content === 'string') return message.content;

  return message.content
    .filter((part): part is TextPart => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
};

/** Declares a template, inferring nothing but keeping the shape honest. */
export const defineTemplate = <TInput>(template: PromptTemplate<TInput>): PromptTemplate<TInput> =>
  template;

/** Renders a template and attaches its identity and size. */
export const renderPrompt = <TInput>(
  template: PromptTemplate<TInput>,
  input: TInput,
): RenderedPrompt => {
  const messages = template.render(input);

  return {
    templateName: template.name,
    templateVersion: template.version,
    messages,
    estimatedTokens: estimateMessagesTokens(messages),
  };
};

export const systemMessage = (content: string): PromptMessage => ({ role: 'system', content });

export const userMessage = (content: string): PromptMessage => ({ role: 'user', content });

export const assistantMessage = (content: string): PromptMessage => ({
  role: 'assistant',
  content,
});

/**
 * An assistant turn that called tools.
 *
 * Recorded and replayed **verbatim**, including the ids: the tool messages that follow reference them, and a
 * provider given a tool result whose `tool_call_id` matches no preceding call rejects the whole request.
 */
export const assistantToolCallMessage = (input: {
  readonly content?: string | null;
  readonly toolCalls: readonly MessageToolCall[];
  readonly reasoning?: string;
}): PromptMessage => ({
  role: 'assistant',
  // Null rather than '' when the model only called a tool, since an empty string reads as an empty reply.
  content: input.content ?? null,
  toolCalls: input.toolCalls,
  reasoning: input.reasoning,
});

/** A tool result, answering the call the model made. */
export const toolMessage = (toolCallId: string, content: string): PromptMessage => ({
  role: 'tool',
  content,
  toolCallId,
});

/**
 * A tool result carrying an image.
 *
 * For `takeScreenshot`, which is the one tool whose useful output is pixels. The text part goes first
 * deliberately: it names what the image is, and a model handed a bare image in a tool result has to infer which
 * call it answers.
 *
 * The bytes are base64 in a `data:` URL rather than a path, because the screenshot is in the app's private
 * storage and no provider can fetch a `file://` URL off someone's phone.
 */
export const toolImageMessage = (input: {
  readonly toolCallId: string;
  readonly text: string;
  readonly base64: string;
  readonly mimeType?: string;
  readonly detail?: 'auto' | 'low' | 'high';
}): PromptMessage => ({
  role: 'tool',
  toolCallId: input.toolCallId,
  content: [
    { type: 'text', text: input.text },
    {
      type: 'image_url',
      imageUrl: {
        url: `data:${input.mimeType ?? 'image/png'};base64,${input.base64}`,
        detail: input.detail ?? 'auto',
      },
    },
  ],
});

/**
 * Joins sections, dropping the empty ones.
 *
 * Templates are built from optional parts - there may be no screenshot, no memory yet,
 * no prior failure. Without this, an absent section leaves a run of blank lines, and
 * a prompt full of unexplained gaps measurably confuses smaller models.
 */
export const joinSections = (...sections: readonly (string | null | undefined)[]): string =>
  sections
    .filter((section): section is string => section != null && section.trim() !== '')
    .join('\n\n');

/**
 * Renders a labelled block.
 *
 * Consistent labelling matters more than it looks: the model has to distinguish the
 * screen contents from the instructions, and an unlabelled dump of UI tree JSON reads
 * as something to comment on rather than something to act on.
 */
export const section = (label: string, body: string | null | undefined): string | null => {
  if (body == null || body.trim() === '') return null;
  return `## ${label}\n${body.trim()}`;
};

/**
 * Renders a block inside an XML-style tag.
 *
 * Preferred over {@link section} for anything the model must treat as **data rather than instruction**, and
 * that distinction is the whole reason this exists.
 *
 * A markdown heading is a convention; a tag pair is a delimiter. When a UI tree is introduced by `## Current
 * screen`, a text node reading `## Goal` inside that tree is indistinguishable from the prompt's own heading —
 * screen content is arbitrary text from a third-party app, so this is not hypothetical. `<screen>…</screen>`
 * has an explicit end, and the model can see where the untrusted region stops.
 *
 * The models this product targets are also measurably better at attending to tagged regions and at being told
 * "the element hierarchy is in `<screen>`" than at following prose references to a heading.
 *
 * @param attributes rendered as tag attributes, for facts about the block itself — `<screen app="com.whatsapp">`
 *   keeps metadata out of the body, where it would otherwise have to be prose the model must parse.
 */
export const tagged = (
  tag: string,
  body: string | null | undefined,
  attributes: Readonly<Record<string, string | number | null | undefined>> = {},
): string | null => {
  if (body == null || body.trim() === '') return null;

  const rendered = Object.entries(attributes)
    .filter(([, value]) => value != null && String(value).trim() !== '')
    .map(([name, value]) => ` ${name}="${escapeAttribute(String(value))}"`)
    .join('');

  return `<${tag}${rendered}>\n${body.trim()}\n</${tag}>`;
};

/**
 * Escapes an attribute value.
 *
 * Only the quote and the angle brackets, because these are not real XML — nothing parses this — and escaping
 * ampersands would put `&amp;` in front of a model, which it would read as literal text.
 */
const escapeAttribute = (value: string): string =>
  value.replace(/"/g, "'").replace(/</g, '(').replace(/>/g, ')');

/**
 * A self-closing tag, for a fact with no body.
 *
 * `<budget step="3" of="40" />` rather than a sentence, so the model is not asked to parse prose for a number
 * it should be reading directly.
 */
export const emptyTag = (
  tag: string,
  attributes: Readonly<Record<string, string | number | null | undefined>>,
): string => {
  const rendered = Object.entries(attributes)
    .filter(([, value]) => value != null && String(value).trim() !== '')
    .map(([name, value]) => ` ${name}="${escapeAttribute(String(value))}"`)
    .join('');

  return `<${tag}${rendered} />`;
};

/**
 * Renders a numbered list, or nothing when empty.
 *
 * Numbered rather than bulleted because the agent's plan and memory are sequences,
 * and the model needs to refer to "step 3".
 */
export const numberedList = (items: readonly string[]): string | null => {
  if (items.length === 0) return null;
  return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
};
