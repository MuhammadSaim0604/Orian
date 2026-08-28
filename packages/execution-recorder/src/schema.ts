import { SelectorSchema } from '@mobile-automation/workflow-schema';
import { z } from 'zod';

/**
 * Schemas for a recorded run.
 *
 * A trace is the raw material the generator compiles into a workflow, and the shape it
 * takes decides what a generated workflow can be. The field that matters most is the
 * **resolved selector**: a trace of coordinates compiles into a workflow that breaks on
 * the next app update, while one carrying the element that actually matched compiles into
 * one that survives (ADR 0009).
 *
 * Mirrors `ExecutionStep` in `architecture/Data_Models.md`. Validated with Zod because a
 * trace is persisted, read back by a later version of the app, and fed to a model - all
 * three are places where a malformed trace should be rejected rather than half-read.
 */

/** What a step did to the device. Mirrors the tool vocabulary, not a separate one. */
export const STEP_OUTCOMES = ['succeeded', 'failed'] as const;

export const StepOutcomeSchema = z.enum(STEP_OUTCOMES);

export type StepOutcome = z.infer<typeof StepOutcomeSchema>;

/**
 * The screen a step happened on.
 *
 * Both package and activity, because one package renders many screens: a step recorded in
 * a WhatsApp conversation must not be replayed against the chat list.
 */
export const ScreenIdentitySchema = z.object({
  packageName: z.string().min(1).nullable(),
  activityName: z.string().min(1).nullable(),
});

export type ScreenIdentity = z.infer<typeof ScreenIdentitySchema>;

/**
 * The element a step acted on, as the resolver reported it.
 *
 * Richer than a selector on purpose. The selector is what the workflow will use; this is
 * everything that was true at capture time, so the generator can choose a better selector
 * than the agent did and the review screen can explain why.
 */
export const ResolvedElementSchema = z.object({
  resourceId: z.string().nullable().optional(),
  text: z.string().nullable().optional(),
  contentDescription: z.string().nullable().optional(),
  className: z.string().nullable().optional(),
  bounds: z
    .object({
      left: z.number().int(),
      top: z.number().int(),
      right: z.number().int(),
      bottom: z.number().int(),
    })
    .optional(),
  /** Which strategy the resolver actually matched by. */
  strategy: z.string().optional(),
  clickable: z.boolean().optional(),
  editable: z.boolean().optional(),
});

export type ResolvedElement = z.infer<typeof ResolvedElementSchema>;

/**
 * One recorded step.
 *
 * `uiTree` and `screenshotPath` are held **by reference or as already-serialized data**,
 * never as image bytes (ADR 0005). A trace of twenty steps with inline screenshots would
 * be tens of megabytes in a database row.
 */
export const ExecutionStepSchema = z.object({
  /** Position in the run, from 1. */
  index: z.number().int().positive(),
  /** The tool that ran. Names come from `tool-sdk`, so the generator can map them back. */
  tool: z.string().min(1),
  /** Arguments as the agent supplied them, already validated at execution time. */
  arguments: z.record(z.unknown()),

  screen: ScreenIdentitySchema,
  /** Serialized UI tree before the action, for regenerating a better selector later. */
  uiTreeBefore: z.unknown().optional(),
  /** Filesystem path. Never bytes. */
  screenshotPath: z.string().min(1).nullable().optional(),

  /** What the selector resolved to, when the tool targeted an element. */
  resolvedElement: ResolvedElementSchema.optional(),
  /** Which strategy matched, for durability scoring. */
  matchedBy: z.string().nullable().optional(),

  outcome: StepOutcomeSchema,
  /** The tool's return value. Trimmed by the recorder before it gets here. */
  result: z.unknown().optional(),
  error: z.string().optional(),
  errorCode: z.string().optional(),

  /** Screen after the action, so the trace shows what each step changed. */
  screenAfter: z.string().nullable().optional(),

  timestampEpochMs: z.number().int().positive(),
  durationMs: z.number().int().nonnegative(),
});

export type ExecutionStep = z.infer<typeof ExecutionStepSchema>;

export const TRACE_OUTCOMES = ['succeeded', 'failed', 'cancelled', 'exhausted'] as const;

export const TraceOutcomeSchema = z.enum(TRACE_OUTCOMES);

export type TraceOutcome = z.infer<typeof TraceOutcomeSchema>;

/**
 * A complete recorded run.
 *
 * The goal is kept because it is what the run was *for*, and a generated workflow needs a
 * name and a description that mean something to the person who asked for it.
 */
export const ExecutionTraceSchema = z.object({
  id: z.string().min(1),
  /** The agent run this came from, so a trace can be tied back to its session. */
  runId: z.string().min(1),
  goal: z.string().min(1),
  outcome: TraceOutcomeSchema,
  /** The agent's own account of what it did or why it stopped. */
  summary: z.string().optional(),
  steps: z.array(ExecutionStepSchema),
  startedAtEpochMs: z.number().int().positive(),
  finishedAtEpochMs: z.number().int().positive(),
  /** Model that drove the run, for reproducing a puzzling trace. */
  model: z.string().optional(),
});

export type ExecutionTrace = z.infer<typeof ExecutionTraceSchema>;

/**
 * Tools that only look at the screen.
 *
 * The generator collapses these, because a trace is dense with observations the agent
 * needed in order to *decide* but which a workflow does not need to repeat. Left in, they
 * triple the node count and make the canvas unreadable.
 *
 * `waitForElement` is deliberately **not** here. It looks like an observation but is
 * load-bearing: removing it produces a workflow that works when replayed slowly and fails
 * on a cold start, which is the worst kind of intermittent.
 */
export const OBSERVATION_TOOLS = [
  'getUiTree',
  'takeScreenshot',
  'getCurrentScreen',
  'findElement',
  'listApps',
] as const;

export const isObservationTool = (tool: string): boolean =>
  (OBSERVATION_TOOLS as readonly string[]).includes(tool);

/**
 * A step worth generating a node from.
 *
 * A failed step is excluded: it describes something that did not work, and replaying it
 * would reproduce the failure rather than the outcome. It stays in the trace, because it
 * explains why the next step looks odd.
 */
export const isGeneratableStep = (step: ExecutionStep): boolean =>
  step.outcome === 'succeeded' && !isObservationTool(step.tool);

/** A selector as the trace recorded it, for reuse in a generated node. */
export const RecordedSelectorSchema = SelectorSchema;
