import { type ToolDefinition } from '@mobile-automation/tool-sdk';

import { toPromptJson, truncateToTokens } from './redaction';
import { type PromptMessage, joinSections, systemMessage, tagged, userMessage } from './template';

/**
 * Context for the Configure-with-AI overlay (Phase 8).
 *
 * Built now, with the agent, because the payload is specified in
 * `architecture/Data_Models.md` and the parser that validates the response is the same
 * one the agent uses. Writing it here means Phase 8 is UI work rather than UI plus a
 * second prompt pipeline.
 *
 * The defining constraint: the model must return a **node configuration**, validated
 * against that node's own Zod schema - never prose. The node's schema already exists
 * and is strict, so the prompt's job is to describe the target, not to re-specify the
 * shape.
 */

export type NodeConfigContextInput = {
  /** The node being configured, with whatever config it already has. */
  readonly node: {
    readonly id: string;
    readonly type: string;
    readonly label: string;
    readonly description: string;
    readonly currentConfig: unknown;
  };

  /** What the user typed in the overlay. */
  readonly instruction: string;

  /** The screen the user navigated to, which is the point of the overlay. */
  readonly screen: {
    readonly packageName: string | null;
    readonly activityName: string | null;
    readonly uiTree: unknown;
    readonly screenshotPath?: string | null;
  };

  /** JSON Schema for this node's config, so the model knows the exact shape. */
  readonly configJsonSchema: Record<string, unknown>;

  /** Tools available, for a node whose config names one. */
  readonly availableTools?: readonly ToolDefinition[];

  readonly uiTreeTokens?: number;

  /** Set when a previous attempt failed validation, so the retry is a correction. */
  readonly previousAttempt?: {
    readonly output: string;
    readonly error: string;
  } | null;
};

/**
 * Instructions for node configuration.
 *
 * Emphatic about JSON-only because this output is applied directly to a node in the
 * user's workflow: prose wrapped in an explanation cannot be applied, and a model
 * asked to "configure a node" will otherwise helpfully explain what it did.
 *
 * The selector guidance is repeated here rather than assumed, because this is where
 * durable selectors are actually chosen - the user is standing on the real screen, and
 * a config that captures a resourceId now is one that still works after an app update.
 */
export const NODE_CONFIG_SYSTEM_PROMPT = `<role>
You configure a single node in a mobile automation workflow.
</role>

<input>
You are given the node in <node>, what the user asked for in <instruction>, the screen they are looking at in <screen>, and a JSON Schema in <schema>.
</input>

<output>
Return only a JSON object matching <schema>. No explanation, no markdown fences, no commentary.
</output>

<identifying_elements>
When the configuration identifies an element on screen:
- Use resourceId when the element has one. It survives app updates and language changes.
- Otherwise use contentDescription, then text.
- Include coordinates only when nothing else identifies the element, and never as the only clue if a better one exists.
- Take the values from <screen>. Never invent an id or a label that is not there.
</identifying_elements>

<when_it_does_not_fit>
If <instruction> cannot be expressed by this node's schema, return the closest valid configuration rather than an invalid one.
</when_it_does_not_fit>`;

export const buildNodeConfigContext = (input: NodeConfigContextInput): readonly PromptMessage[] => {
  const uiTreeTokens = input.uiTreeTokens ?? 6_000;

  const nodeSection = tagged(
    'node',
    joinSections(
      `What it does: ${input.node.description}`,
      `Current configuration:\n${toPromptJson(input.node.currentConfig, 2)}`,
    ),
    { type: input.node.type, label: input.node.label },
  );

  const instructionSection = tagged('instruction', input.instruction);

  const schemaSection = tagged('schema', toPromptJson(input.configJsonSchema, 2));

  const screenSection = tagged(
    'screen',
    joinSections(
      truncateToTokens(toPromptJson(input.screen.uiTree), uiTreeTokens),
      input.screen.screenshotPath == null
        ? null
        : `<screenshot path="${input.screen.screenshotPath}" />`,
    ),
    {
      app: input.screen.packageName ?? 'unknown',
      activity: input.screen.activityName,
    },
  );

  const toolSection =
    input.availableTools === undefined || input.availableTools.length === 0
      ? null
      : tagged(
          'tools',
          input.availableTools.map((tool) => `- ${tool.name}: ${tool.description}`).join('\n'),
        );

  const retrySection =
    input.previousAttempt == null
      ? null
      : tagged(
          'rejected_attempt',
          joinSections(
            input.previousAttempt.output,
            `Problem: ${input.previousAttempt.error}`,
            'Return a corrected JSON object.',
          ),
        );

  return [
    systemMessage(NODE_CONFIG_SYSTEM_PROMPT),
    userMessage(
      joinSections(
        nodeSection,
        instructionSection,
        schemaSection,
        toolSection,
        retrySection,
        screenSection,
      ),
    ),
  ];
};
