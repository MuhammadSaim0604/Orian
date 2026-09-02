import { z } from 'zod';

/**
 * Planning as tools, not as a JSON reply.
 *
 * ## Why this is a tool and not a parsed response
 *
 * Planning used to be a separate model call with its own system prompt, no tools attached, whose reply was
 * parsed as `{ "steps": [...] }`. That produced three problems at once:
 *
 * - **The first call looked nothing like the rest.** Different system prompt, no tool array — so the agent the
 *   user's first request met was not the agent that carried it out.
 * - **A plan cost a whole extra round trip** before anything could happen, even when the model was ready to act.
 * - **Asking for JSON in content fights the protocol.** A model given tools and asked for prose-shaped JSON
 *   sometimes returns a tool call anyway, sometimes wraps the JSON in prose, and sometimes does both.
 *
 * As a tool the plan is just another call in the same conversation, on the same turn the model decides to act.
 * It can plan and take its first action in one turn, and the plan arrives already-validated by the same
 * mechanism as every other call.
 *
 * ## Why these are not device tools
 *
 * They never reach `invokeTool`, and they are deliberately not in `tool-sdk`'s `TOOL_NAMES`. Two reasons, and
 * the second is the one that matters:
 *
 * - There is nothing to dispatch. A plan is state the loop holds and the UI renders; the device has no part in
 *   it.
 * - **They must never be exposed over MCP.** An external agent driving this phone through the tool gateway has
 *   its own planning; offering it ours would let it write into a UI it cannot see, and `allToolDefinitions()` is
 *   what the MCP server publishes. Keeping these in `ai-agent` means they cannot leak into that list by
 *   accident.
 */

export const PLANNING_TOOL_NAMES = ['createPlan', 'updatePlan'] as const;

export type PlanningToolName = (typeof PLANNING_TOOL_NAMES)[number];

export const isPlanningTool = (name: string): name is PlanningToolName =>
  (PLANNING_TOOL_NAMES as readonly string[]).includes(name);

/**
 * Bounds on a plan.
 *
 * Twenty is a ceiling on absurdity rather than a target — the prompt asks for three to six. One is the floor
 * because an empty plan is not a plan, and it was what produced the bare `Plan:` line with nothing under it.
 */
export const MAX_PLAN_STEPS = 20;

const StepsSchema = z
  .array(z.string().trim().min(1))
  .min(1)
  .max(MAX_PLAN_STEPS)
  .describe('The steps, in order. Each one an action a person would recognise.');

export const CreatePlanArgumentsSchema = z.object({ steps: StepsSchema }).strict();

/**
 * Updating a plan replaces it wholesale, and takes a reason.
 *
 * Whole-list replacement rather than a patch operation because a model asked to amend step 3 of a plan it wrote
 * two turns ago gets it wrong often enough to matter, and a mangled plan is worse than a rewritten one.
 *
 * The reason is required. It is what the user reads when the plan they were watching changes underneath them —
 * "Changing approach: the search box is not on this screen" is an explanation, while a silently different list
 * is unsettling.
 */
export const UpdatePlanArgumentsSchema = z
  .object({
    steps: StepsSchema,
    reason: z
      .string()
      .trim()
      .min(1)
      .describe('Why the plan changed, in one short phrase, shown to the user.'),
  })
  .strict();

export type CreatePlanArguments = z.infer<typeof CreatePlanArgumentsSchema>;
export type UpdatePlanArguments = z.infer<typeof UpdatePlanArgumentsSchema>;

/**
 * The planning tools in the shape a Chat Completions request expects.
 *
 * Hand-written JSON Schema rather than generated, matching `tool-sdk`'s approach: the subset is tiny, and a
 * dependency would have to be trusted to produce something a model can follow.
 *
 * The descriptions carry the guidance that used to live in the planning system prompt. That is not duplication
 * of the agent prompt — the prompt says *when* to plan, and these say what a well-formed plan looks like at the
 * moment the model is writing one, which is when it is most likely to be read.
 */
export const planningToolsForRequest = (): readonly {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}[] => [
  {
    type: 'function',
    function: {
      name: 'createPlan',
      description:
        'Record the steps you intend to take, before you start. Use this for a goal that needs several ' +
        'actions; do not use it for a single action or a question. The user sees these steps, so write ones ' +
        'a person would recognise ("open WhatsApp", "search for the contact") rather than tool names. Three ' +
        'to six steps is usual.',
      parameters: {
        type: 'object',
        properties: {
          steps: {
            type: 'array',
            items: { type: 'string' },
            description: 'The steps, in order.',
          },
        },
        required: ['steps'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'updatePlan',
      description:
        'Replace the plan when the approach has changed, so what the user is watching stays true. Give the ' +
        'full list of steps, not just the changed one, and say briefly why it changed.',
      parameters: {
        type: 'object',
        properties: {
          steps: {
            type: 'array',
            items: { type: 'string' },
            description: 'The complete new list of steps, in order.',
          },
          reason: {
            type: 'string',
            description: 'Why the plan changed, in one short phrase. Shown to the user.',
          },
        },
        required: ['steps', 'reason'],
        additionalProperties: false,
      },
    },
  },
];

export type PlanningResult =
  | {
      readonly ok: true;
      readonly steps: readonly string[];
      readonly isReplan: boolean;
      readonly reason: string | null;
      /** What goes back to the model as the tool result. */
      readonly message: string;
    }
  | { readonly ok: false; readonly message: string };

/**
 * Validates and applies a planning call.
 *
 * Returns a message either way, because **every tool call must be answered**. A provider given an assistant
 * turn with a `tool_call` and no matching `tool` message rejects the next request outright, so there is no path
 * here that returns nothing.
 *
 * The success message is short and factual rather than encouraging. "Plan recorded with 4 steps." tells the
 * model the call landed; anything warmer invites it to reply about the plan instead of getting on with it.
 */
export const applyPlanningCall = (
  name: PlanningToolName,
  rawArguments: unknown,
): PlanningResult => {
  const parsed =
    name === 'createPlan'
      ? CreatePlanArgumentsSchema.safeParse(rawArguments)
      : UpdatePlanArgumentsSchema.safeParse(rawArguments);

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => {
        const path = issue.path.join('.');
        return path === '' ? issue.message : `${path} - ${issue.message}`;
      })
      .join('; ');

    return {
      ok: false,
      // Phrased as a correction, like the device tools' rejections, because it goes straight back to the model.
      message: `The arguments for "${name}" were not valid: ${detail}. Correct them and call it again.`,
    };
  }

  const steps = parsed.data.steps.map((step) => step.trim());
  const isReplan = name === 'updatePlan';

  return {
    ok: true,
    steps,
    isReplan,
    reason: isReplan ? (parsed.data as UpdatePlanArguments).reason : null,
    message: isReplan
      ? `Plan updated to ${steps.length} step${steps.length === 1 ? '' : 's'}.`
      : `Plan recorded with ${steps.length} step${steps.length === 1 ? '' : 's'}. Start on the first one.`,
  };
};
