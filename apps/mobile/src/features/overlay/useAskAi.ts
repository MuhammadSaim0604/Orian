import { createChatCompletionsProvider } from '@mobile-automation/ai-agent';
import { invokeTool } from '@mobile-automation/native-automation';
import { type AnyNodeDefinition } from '@mobile-automation/node-sdk';
import { buildNodeConfigContext, parseStructured } from '@mobile-automation/prompt-engine';
import { readOnlyTools, toolDefinition } from '@mobile-automation/tool-sdk';
import { useCallback } from 'react';

import { loadProviderSettings, readApiKey } from '../agent/providerSettings';
import { useCanvasStore } from '../canvas/canvasStore';
import { definitionFor } from '../canvas/registry';

import { configJsonSchemaFor } from './configJsonSchema';
import { useOverlayStore } from './overlayStore';

/**
 * Ask AI: turn an instruction plus the live screen into a validated node configuration.
 *
 * The contract that makes this safe is that the model's output is validated against **the node's
 * own Zod schema** before it goes anywhere near the workflow. Prose cannot be applied, and an
 * invalid config would fail at load time with the user having no idea why. So the output is
 * parsed, validated, and only then offered - and it is offered rather than applied, because the
 * user is looking at another app and cannot see what changed.
 *
 * Everything on the prompt side already existed: `buildNodeConfigContext` assembles the
 * Data_Models payload and `parseStructured` distinguishes "no JSON" from "wrong shape". This hook
 * is the wiring.
 */

/**
 * Attempts before giving up.
 *
 * Two. The second carries the validation error as a correction, which is the attempt most likely
 * to succeed; a third rarely adds anything and the user is waiting.
 */
const MAX_ATTEMPTS = 2;

export type AskAiState = {
  ask: (instruction: string) => Promise<void>;
  /** Applies the proposal to the node and closes it. */
  accept: () => void;
};

export const useAskAi = (): AskAiState => {
  const nodeId = useOverlayStore((state) => state.nodeId);

  const ask = useCallback(
    async (instruction: string) => {
      const overlay = useOverlayStore.getState();

      if (nodeId === null || instruction.trim() === '') return;

      const node = useCanvasStore.getState().nodes[nodeId];
      const definition = node === undefined ? undefined : definitionFor(node.type);

      if (node === undefined || definition === undefined) {
        // The node can be deleted while the overlay is open over another app.
        overlay.setProposalError('That step no longer exists.');
        return;
      }

      overlay.setAsking(true);
      overlay.setProposalError(null);

      try {
        const settings = await loadProviderSettings();

        if (!settings.hasApiKey) {
          overlay.setProposalError('Add an AI provider key in settings first.');
          return;
        }

        const provider = createChatCompletionsProvider({
          baseUrl: settings.baseUrl,
          model: settings.model,
          // Read at call time from the Keystore, never held. The overlay renders model output,
          // so a key in its state would be one step from being displayed (ADR 0007).
          apiKey: readApiKey,
        });

        // Read fresh rather than reusing a cached reading: the user navigated somewhere to ask
        // this question, and a stale tree would describe the screen they left.
        const screen = await readScreenForPrompt();

        let correction: { output: string; error: string } | null = null;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          const response = await provider.complete({
            messages: buildNodeConfigContext({
              node: {
                id: node.id,
                type: node.type,
                label: node.metadata.label,
                description: definition.display.description,
                currentConfig: node.config,
              },
              instruction: instruction.trim(),
              screen: {
                packageName: screen.packageName,
                activityName: screen.activityName,
                uiTree: screen.uiTree,
                screenshotPath: useOverlayStore.getState().screenshotPath,
              },
              configJsonSchema: configJsonSchemaFor(definition.configSchema),
              // Only read-only tools: a node config names a tool to describe intent, and
              // offering destructive ones invites a config that acts rather than checks.
              availableTools: readOnlyTools().map((name) => toolDefinition(name)),
              previousAttempt: correction,
            }),
          });

          const text = response.content ?? '';

          // Validated against the node's own schema, which is the same schema the executor will
          // apply. Anything else would move the failure to run time.
          const parsed = parseStructured(definition.configSchema, text);

          if (parsed.ok) {
            useOverlayStore
              .getState()
              .setProposal(parsed.value, summarise(parsed.value, definition));
            return;
          }

          correction = { output: truncate(text, 600), error: parsed.message };
        }

        useOverlayStore
          .getState()
          .setProposalError(
            correction?.error ?? 'The AI did not return a configuration this step accepts.',
          );
      } catch (error) {
        useOverlayStore
          .getState()
          .setProposalError(
            error instanceof Error ? error.message : 'The AI could not be reached.',
          );
      }
    },
    [nodeId],
  );

  const accept = useCallback(() => {
    const overlay = useOverlayStore.getState();
    const proposal = overlay.proposal;

    if (nodeId === null || proposal === null) return;

    // Written straight into the canvas store, which both React roots share. That is what makes
    // the node editor update itself with no navigation or message passing.
    useCanvasStore.getState().updateNodeConfig(nodeId, proposal.config);
    overlay.clearProposal();
  }, [nodeId]);

  return { ask, accept };
};

/** The screen as the prompt needs it: compact tree plus identity. */
const readScreenForPrompt = async (): Promise<{
  packageName: string | null;
  activityName: string | null;
  uiTree: unknown;
}> => {
  const [current, tree] = await Promise.all([
    invokeTool('getCurrentScreen', {}) as Promise<{
      packageName: string | null;
      activityName: string | null;
    }>,
    // Compact, because the full tree of a busy screen is tens of thousands of tokens and the
    // omitted fields carry nothing the model can use.
    invokeTool('getUiTree', { compact: true }),
  ]);

  return {
    packageName: current.packageName,
    activityName: current.activityName,
    uiTree: tree,
  };
};

/**
 * A one-line description of what the AI proposed.
 *
 * The user is standing in another app and cannot see the node, so "Tap the element with id
 * com.whatsapp:id/send" is the difference between an informed acceptance and a blind one.
 */
const summarise = (config: unknown, definition: AnyNodeDefinition): string => {
  if (config === null || typeof config !== 'object') return definition.display.label;

  const record = config as Record<string, unknown>;
  const selector = record.selector as Record<string, unknown> | undefined;

  const target =
    typeof selector?.resourceId === 'string'
      ? `id ${selector.resourceId}`
      : typeof selector?.contentDescription === 'string'
        ? `“${selector.contentDescription}”`
        : typeof selector?.text === 'string'
          ? `“${selector.text}”`
          : selector?.coordinates !== undefined
            ? 'a screen position'
            : null;

  const condition = record.condition as Record<string, unknown> | undefined;

  if (condition !== undefined && typeof condition.type === 'string') {
    const conditionTarget = readSelectorLabel(condition.selector);

    return conditionTarget === null
      ? `Checks ${humanise(condition.type)}`
      : `Checks ${humanise(condition.type)} for ${conditionTarget}`;
  }

  return target === null ? definition.display.label : `${definition.display.label} — ${target}`;
};

const readSelectorLabel = (selector: unknown): string | null => {
  if (selector === null || typeof selector !== 'object') return null;

  const record = selector as Record<string, unknown>;

  for (const key of ['resourceId', 'contentDescription', 'text'] as const) {
    if (typeof record[key] === 'string' && record[key] !== '') {
      return `“${String(record[key])}”`;
    }
  }

  return null;
};

const humanise = (value: string): string =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase();

const truncate = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max)}…`;
