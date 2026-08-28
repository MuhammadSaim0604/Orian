import { createChatCompletionsProvider } from '@mobile-automation/ai-agent';
import { type AnyNodeDefinition } from '@mobile-automation/node-sdk';
import { buildGenerationContext, parseStructured } from '@mobile-automation/prompt-engine';
import { type Workflow, WorkflowSchema } from '@mobile-automation/workflow-schema';
import { useCallback, useState } from 'react';

import { loadProviderSettings, readApiKey } from '../agent/providerSettings';
import { nodeRegistry } from '../canvas/registry';

/**
 * Create-by-AI: a goal in, a workflow document out.
 *
 * Deliberately **not** the agent loop. The agent drives the device to achieve a goal now;
 * this produces a reusable workflow without touching the phone, which is what a user asking
 * to "create a workflow" means. Running the agent and compiling its trace is a different and
 * better path for a task the user is doing anyway - that is Phase 9.
 *
 * The model's output is validated against `WorkflowSchema` and every node's own config schema
 * before it reaches the canvas. A generated workflow is exactly the case where unchecked
 * output would be most damaging: it looks authoritative, and the user did not write it.
 */

export type GenerationState = {
  readonly generating: boolean;
  readonly error: string | null;
  /** Problems in what the model produced, so a retry can be informed. */
  readonly issues: readonly string[];
  generate: (goal: string) => Promise<Workflow | null>;
  reset: () => void;
};

/**
 * How many attempts to give the model.
 *
 * Two. A model that produced an unusable document twice will usually do so again, and each
 * attempt costs the user money and a wait.
 */
const MAX_ATTEMPTS = 2;

export const useWorkflowGeneration = (): GenerationState => {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<readonly string[]>([]);

  const generate = useCallback(async (goal: string): Promise<Workflow | null> => {
    if (goal.trim() === '') return null;

    setGenerating(true);
    setError(null);
    setIssues([]);

    try {
      const settings = await loadProviderSettings();

      if (!settings.hasApiKey) {
        setError('Add an AI provider key in settings to generate workflows.');
        return null;
      }

      const provider = createChatCompletionsProvider({
        baseUrl: settings.baseUrl,
        model: settings.model,
        apiKey: readApiKey,
      });

      const definitions = nodeRegistry.all();

      let correction: { output: string; error: string } | null = null;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const response = await provider.complete({
          messages: buildGenerationContext({
            goal,
            // No trace: the model is planning from the goal rather than compiling a recording.
            // The same context builder serves both, so Phase 9 reuses this path unchanged.
            steps: [],
            workflowJsonSchema: workflowShapeForPrompt(definitions),
            availableNodeTypes: definitions.map((definition) => ({
              type: definition.type,
              description: describeForPrompt(definition),
            })),
            previousAttempt: correction,
          }),
        });

        const text = response.content ?? '';
        const parsed = parseStructured(WorkflowSchema, text);

        if (parsed.ok) {
          setIssues([]);
          return parsed.value;
        }

        correction = { output: truncate(text, 800), error: parsed.message };
        setIssues([parsed.message]);
      }

      setError('The AI could not produce a valid workflow. Try describing the task differently.');
      return null;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The workflow could not be generated.');
      return null;
    } finally {
      setGenerating(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setIssues([]);
  }, []);

  return { generating, error, issues, generate, reset };
};

/**
 * The document shape, described for the model.
 *
 * Hand-written rather than a full JSON Schema conversion of `WorkflowSchema`. The complete
 * schema is thousands of tokens of recursive definitions and discriminated unions, most of it
 * irrelevant to producing a document - and a model given all of it reliably spends its
 * attention on the wrong parts. This states the shape and the rules that actually get broken.
 */
const workflowShapeForPrompt = (
  definitions: readonly AnyNodeDefinition[],
): Record<string, unknown> => ({
  type: 'object',
  required: ['id', 'metadata', 'nodes', 'edges'],
  properties: {
    id: { type: 'string', description: 'A short identifier, e.g. wf_message_robert' },
    metadata: {
      type: 'object',
      required: ['name', 'createdAt', 'updatedAt'],
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        createdAt: { type: 'string', description: 'ISO 8601 timestamp' },
        updatedAt: { type: 'string', description: 'ISO 8601 timestamp' },
      },
    },
    variables: {
      type: 'array',
      description:
        'Values the user supplies at run time. Use these for anything task-specific, ' +
        'such as a contact name or a message, so the workflow is reusable.',
      items: {
        type: 'object',
        required: ['name', 'type'],
        properties: {
          name: { type: 'string' },
          type: { enum: ['string', 'number', 'boolean', 'object', 'array'] },
          defaultValue: {},
        },
      },
    },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'type', 'metadata'],
        properties: {
          id: { type: 'string' },
          type: { enum: definitions.map((definition) => definition.type) },
          config: { type: 'object', description: "Matches that node type's configuration" },
          metadata: {
            type: 'object',
            required: ['label'],
            properties: {
              label: { type: 'string', description: 'What this step does, in a few words' },
              position: {
                type: 'object',
                properties: { x: { type: 'number' }, y: { type: 'number' } },
                description: 'Lay steps out left to right, about 220 apart',
              },
            },
          },
        },
      },
    },
    edges: {
      type: 'array',
      description:
        'Connections. Exactly one node must have no incoming edge - that is where the ' +
        'workflow starts. Do not create a loop by connecting a later node back to an ' +
        'earlier one; use a loop node instead.',
      items: {
        type: 'object',
        required: ['id', 'source', 'target'],
        properties: {
          id: { type: 'string' },
          source: { type: 'string' },
          sourceHandle: {
            type: 'string',
            description:
              'Defaults to "next". Use "true"/"false" from a condition, "body"/"done" from a loop.',
          },
          target: { type: 'string' },
          targetHandle: { type: 'string', description: 'Defaults to "in"' },
        },
      },
    },
  },
});

/**
 * A node type, described with its config fields.
 *
 * Field names are included because a type name alone leaves the model guessing at config keys,
 * and a guessed key fails validation for a reason it cannot see. The list is truncated: a node
 * with twenty fields would crowd out the other twenty-seven node types.
 */
const describeForPrompt = (definition: AnyNodeDefinition): string => {
  const outputs = definition.outputs.map((port) => port.handle).join('/');

  const fields = configFieldNames(definition).slice(0, 6);

  return [
    definition.display.description,
    fields.length > 0 ? `config: ${fields.join(', ')}` : null,
    definition.outputs.length > 1 ? `outputs: ${outputs}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join('. ');
};

const configFieldNames = (definition: AnyNodeDefinition): readonly string[] => {
  const schema = definition.configSchema as unknown as { shape?: Record<string, unknown> };
  return schema.shape === undefined ? [] : Object.keys(schema.shape);
};

const truncate = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max)}…`;
