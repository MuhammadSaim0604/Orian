import { z } from 'zod';

/**
 * Argument schemas for the device tools.
 *
 * These are what the model's tool calls are validated against, and the same
 * definitions the MCP server exposes to external clients (ADR 0008). Writing them
 * once is not just tidiness: a tool described differently in two places lets the AI
 * produce arguments one side accepts and the other rejects, which surfaces as an
 * agent that mysteriously fails on some steps.
 *
 * Every schema is `.strict()`. A model that invents an extra field is
 * misunderstanding the tool, and silently dropping the field would hide that while
 * doing something other than what the model intended.
 */

/** Screen rectangle in device pixels. */
export const BoundsArgSchema = z
  .object({
    left: z.number().int(),
    top: z.number().int(),
    right: z.number().int(),
    bottom: z.number().int(),
  })
  .strict();

/** Screen point in device pixels. */
export const PointArgSchema = z
  .object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
  })
  .strict();

/**
 * How the model describes the element it wants to act on.
 *
 * Mirrors the `Selector` in `workflow-schema` and the Kotlin `Selector`, and carries
 * the same rule: a selector with nothing to locate by is rejected rather than being
 * left to fail on the device. That check matters more here than anywhere else,
 * because a model will happily emit `{ className: 'Button' }` and a resulting
 * "element not found" would send the agent replanning against a phantom problem.
 */
const SelectorShape = z
  .object({
    resourceId: z.string().min(1).optional(),
    contentDescription: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
    className: z.string().min(1).optional(),
    structuralPath: z
      .string()
      .regex(/^\d+(\.\d+)*$/, 'structuralPath must be dot-separated child indices')
      .optional(),
    bounds: BoundsArgSchema.optional(),
    coordinates: PointArgSchema.optional(),
    packageName: z.string().min(1).optional(),
    activityName: z.string().min(1).optional(),
    requireActionable: z.boolean().optional(),
    exactText: z.boolean().optional(),
  })
  .strict();

const LOCATING_FIELDS = [
  'resourceId',
  'contentDescription',
  'text',
  'structuralPath',
  'bounds',
  'coordinates',
] as const;

export const SelectorArgSchema = SelectorShape.refine(
  (selector) => LOCATING_FIELDS.some((field) => selector[field] != null),
  {
    message:
      'selector needs at least one of resourceId, contentDescription, text, ' +
      'structuralPath, bounds, or coordinates',
  },
);

export type SelectorArg = z.infer<typeof SelectorArgSchema>;

/** A tool that acts on one element. */
const selectorOnly = z.object({ selector: SelectorArgSchema }).strict();

export const SWIPE_DIRECTIONS = ['up', 'down', 'left', 'right'] as const;

export const MEDIA_COMMANDS = [
  'play_pause',
  'play',
  'pause',
  'stop',
  'next',
  'previous',
  'fast_forward',
  'rewind',
] as const;

export const VOLUME_DIRECTIONS = ['up', 'down'] as const;

/**
 * Argument schema per tool.
 *
 * Keyed by tool name so the agent can look one up from a model's tool call, and so a
 * missing entry is a compile error rather than a runtime surprise - the parity test
 * asserts every name in `TOOL_NAMES` appears here.
 */
export const TOOL_ARGUMENT_SCHEMAS = {
  // --- acting on the screen ---------------------------------------------

  click: selectorOnly,

  longPress: z
    .object({
      selector: SelectorArgSchema,
      /** Omit for the platform's long-press threshold. */
      durationMs: z.number().int().positive().max(10_000).optional(),
    })
    .strict(),

  swipe: z
    .object({
      /** The direction the *content* moves; the finger inversion is handled natively. */
      direction: z.enum(SWIPE_DIRECTIONS),
      distanceFraction: z.number().positive().max(1).optional(),
    })
    .strict(),

  typeText: z
    .object({
      selector: SelectorArgSchema,
      text: z.string(),
    })
    .strict(),

  pressBack: z.object({}).strict(),

  pressHome: z.object({}).strict(),

  // --- reading the screen -----------------------------------------------

  findElement: selectorOnly,

  waitForElement: z
    .object({
      selector: SelectorArgSchema,
      timeoutMs: z.number().int().positive().max(120_000).optional(),
    })
    .strict(),

  getUiTree: z
    .object({
      /**
       * Omit null and default-valued fields.
       *
       * The agent should almost always want this: the full tree of a busy screen can
       * be tens of thousands of tokens, and the omitted fields carry no information.
       */
      compact: z.boolean().optional(),
    })
    .strict(),

  takeScreenshot: z.object({}).strict(),

  getCurrentScreen: z.object({}).strict(),

  // --- apps -------------------------------------------------------------

  openApp: z.object({ packageName: z.string().min(1) }).strict(),

  /** For when the model knows a human name but not the package. */
  openAppByName: z.object({ name: z.string().min(1) }).strict(),

  listApps: z.object({ includeSystem: z.boolean().optional() }).strict(),

  // --- device data ------------------------------------------------------

  getContacts: z.object({ limit: z.number().int().positive().max(1_000).optional() }).strict(),

  findContacts: z.object({ query: z.string().min(1) }).strict(),

  createAlarm: z
    .object({
      hour: z.number().int().min(0).max(23),
      minute: z.number().int().min(0).max(59),
      label: z.string().min(1).optional(),
      /** ISO days: 1 = Monday through 7 = Sunday. Empty means a one-off alarm. */
      repeatDays: z.array(z.number().int().min(1).max(7)).optional(),
    })
    .strict(),

  readClipboard: z.object({}).strict(),

  writeClipboard: z.object({ text: z.string() }).strict(),

  sendNotification: z.object({ title: z.string().min(1), body: z.string() }).strict(),

  launchIntent: z
    .object({
      action: z.string().min(1),
      dataUri: z.string().min(1).optional(),
      packageName: z.string().min(1).optional(),
      extras: z.record(z.string()).optional(),
      requireChooser: z.boolean().optional(),
    })
    .strict(),

  getSystemSetting: z.object({ key: z.string().min(1) }).strict(),

  // --- media ------------------------------------------------------------

  controlMedia: z.object({ command: z.enum(MEDIA_COMMANDS) }).strict(),

  adjustVolume: z.object({ direction: z.enum(VOLUME_DIRECTIONS) }).strict(),
} as const;

export type ToolArgumentSchemas = typeof TOOL_ARGUMENT_SCHEMAS;
