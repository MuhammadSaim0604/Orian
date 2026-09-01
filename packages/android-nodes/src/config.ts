import { SelectorSchema } from '@mobile-automation/workflow-schema';
import { z } from 'zod';

/**
 * Config schemas for the Android nodes.
 *
 * Kept out of `workflow-schema` on purpose: that package is device-agnostic, and
 * these shapes only mean anything on Android (ADR 0008). Each node validates its own
 * config, so a workflow with a malformed device step is rejected at load time naming
 * the field rather than failing against someone's phone.
 */

/** Every device node may store its result. */
const withAssignTo = {
  assignTo: z.string().min(1).optional(),
};

/** A step that acts on an element the selector resolves to. */
export const SelectorConfigSchema = z.object({
  selector: SelectorSchema,
  ...withAssignTo,
});

export type SelectorConfig = z.infer<typeof SelectorConfigSchema>;

export const OpenAppConfigSchema = z
  .object({
    /**
     * Either a package name or a human name.
     *
     * Both, because a workflow a user built by hand says "WhatsApp" while one the
     * recorder generated knows the exact package. Requiring the package would make the
     * manual case unusable; requiring the label would make the generated case fragile.
     */
    packageName: z.string().min(1).optional(),
    appName: z.string().min(1).optional(),
    ...withAssignTo,
  })
  .refine((config) => config.packageName !== undefined || config.appName !== undefined, {
    message: 'supply either a packageName or an appName',
  });

export type OpenAppConfig = z.infer<typeof OpenAppConfigSchema>;

export const LongPressConfigSchema = z.object({
  selector: SelectorSchema,
  /** Omit to use the platform's long-press threshold. */
  durationMs: z.number().int().positive().max(10_000).optional(),
  ...withAssignTo,
});

export type LongPressConfig = z.infer<typeof LongPressConfigSchema>;

export const SwipeConfigSchema = z.object({
  /** Direction the *content* moves; the native layer inverts it for the finger. */
  direction: z.enum(['up', 'down', 'left', 'right']),
  /** How far to travel, as a fraction of the screen. */
  distanceFraction: z.number().positive().max(1).default(0.8),
  ...withAssignTo,
});

export type SwipeConfig = z.infer<typeof SwipeConfigSchema>;

export const TypeTextConfigSchema = z.object({
  selector: SelectorSchema,
  /** Supports `{{ variable }}` interpolation, since a message is mostly literal text. */
  text: z.string(),
  ...withAssignTo,
});

export type TypeTextConfig = z.infer<typeof TypeTextConfigSchema>;

export const WaitForElementConfigSchema = z.object({
  selector: SelectorSchema,
  timeoutMs: z.number().int().positive().max(120_000).default(5_000),
  ...withAssignTo,
});

export type WaitForElementConfig = z.infer<typeof WaitForElementConfigSchema>;

export const ReadScreenConfigSchema = z.object({
  /**
   * Omit fields at their defaults.
   *
   * Defaults to true because the usual consumer is a model context where every token
   * costs; the recorder asks for the full tree explicitly.
   */
  compact: z.boolean().default(true),
  ...withAssignTo,
});

export type ReadScreenConfig = z.infer<typeof ReadScreenConfigSchema>;

/**
 * Reading a screen with OCR.
 *
 * Its own config rather than a flag on `ReadScreenConfigSchema`, because the two answer different questions. Read
 * Screen asks "what is the element hierarchy"; this asks "what text can be seen, and where". A node that did both
 * behind a boolean would have one output shape meaning two different things.
 *
 * The interesting fields are the ones that decide what happens when the text is **not** found, since that is the
 * normal case on a screen that has changed — a workflow that always failed there would be unusable, and one that
 * always continued would silently do nothing.
 */
export const OcrConfigSchema = z.object({
  /**
   * Text to look for. Omit to read the whole screen.
   *
   * When absent the node returns every recognised line, which is what a workflow branching on screen content
   * wants. When present it returns the single best match, which is what a workflow about to tap something wants.
   */
  text: z.string().min(1).optional(),

  /**
   * Refuse a fuzzy match.
   *
   * Off by default, because OCR reads `l` as `1` and `O` as `0`, so an exact comparison fails on text a person
   * reads without noticing. On for a workflow that would rather fail than act on an approximate match.
   */
  exact: z.boolean().default(false),

  /**
   * Whether absent text fails the node or lets the workflow continue.
   *
   * Defaults to failing, which is the safer half of an asymmetric choice: a workflow that continues past a
   * missing "Payment successful" goes on to do the next thing having never confirmed the first. Continuing is
   * available for the case where absence is the expected outcome — checking whether an error banner appeared.
   */
  failIfMissing: z.boolean().default(true),

  ...withAssignTo,
});

export type OcrConfig = z.infer<typeof OcrConfigSchema>;

/** A node that needs no arguments at all, such as pressBack. */
export const NoArgumentConfigSchema = z.object({ ...withAssignTo });

export type NoArgumentConfig = z.infer<typeof NoArgumentConfigSchema>;

export const NotificationConfigSchema = z.object({
  title: z.string().min(1),
  body: z.string(),
  ...withAssignTo,
});

export type NotificationConfig = z.infer<typeof NotificationConfigSchema>;

export const ContactsConfigSchema = z.object({
  /** When present, searches instead of listing. */
  query: z.string().min(1).optional(),
  limit: z.number().int().positive().max(1_000).default(200),
  ...withAssignTo,
});

export type ContactsConfig = z.infer<typeof ContactsConfigSchema>;

export const ClipboardWriteConfigSchema = z.object({
  text: z.string(),
  ...withAssignTo,
});

export type ClipboardWriteConfig = z.infer<typeof ClipboardWriteConfigSchema>;

export const AlarmConfigSchema = z.object({
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  label: z.string().min(1).optional(),
  /** ISO days: 1 = Monday through 7 = Sunday. Empty means a one-off alarm. */
  repeatDays: z.array(z.number().int().min(1).max(7)).default([]),
  ...withAssignTo,
});

export type AlarmConfig = z.infer<typeof AlarmConfigSchema>;

export const MediaConfigSchema = z.object({
  command: z.enum([
    'play_pause',
    'play',
    'pause',
    'stop',
    'next',
    'previous',
    'fast_forward',
    'rewind',
  ]),
  ...withAssignTo,
});

export type MediaConfig = z.infer<typeof MediaConfigSchema>;

export const VolumeConfigSchema = z.object({
  direction: z.enum(['up', 'down']),
  ...withAssignTo,
});

export type VolumeConfig = z.infer<typeof VolumeConfigSchema>;

export const LaunchIntentConfigSchema = z.object({
  action: z.string().min(1),
  dataUri: z.string().min(1).optional(),
  packageName: z.string().min(1).optional(),
  extras: z.record(z.string()).default({}),
  requireChooser: z.boolean().default(false),
  ...withAssignTo,
});

export type LaunchIntentConfig = z.infer<typeof LaunchIntentConfigSchema>;

export const SystemSettingConfigSchema = z.object({
  key: z.string().min(1),
  ...withAssignTo,
});

export type SystemSettingConfig = z.infer<typeof SystemSettingConfigSchema>;
