import { TOOL_NAMES, type ToolName } from '@mobile-automation/tool-sdk';

import { type CapabilityId } from './capabilities';

/**
 * Which permission each device tool actually needs.
 *
 * One map, and the tools page is built from it rather than from a hand-kept list of rows. That is the point:
 * the previous page listed twenty-four tools with a toggle each and stated a permission only for the five it
 * happened to know about, so a tool that failed for want of a permission looked like a broken tool.
 *
 * ## Why this lives in the app
 *
 * `tool-sdk` is device-agnostic and publishable — it describes what a tool *does*, for a model. Android
 * permission ids are a property of this product on this platform, and teaching the SDK about them would
 * pollute a package that has no business knowing what an appop is. Same reasoning as `nodeCapabilities.ts`.
 *
 * ## Why some tools map to nothing
 *
 * Nine of them genuinely need no permission: opening an app, listing apps, the clipboard, an intent, a
 * settings read, and media control all work on a device where the user has granted nothing at all. Marking
 * them as needing accessibility — which the code effectively did, by refusing every call when the service was
 * off — sent users to fix something unrelated to what had failed.
 */

/** The capability a tool needs, or null when it needs none. */
export const TOOL_CAPABILITY: Readonly<Record<ToolName, CapabilityId | null>> = {
  // Reading and driving the screen. All of these go through the accessibility service, and none of them can
  // do anything without it.
  click: 'accessibility',
  longPress: 'accessibility',
  swipe: 'accessibility',
  typeText: 'accessibility',
  findElement: 'accessibility',
  waitForElement: 'accessibility',
  getUiTree: 'accessibility',
  pressBack: 'accessibility',
  pressHome: 'accessibility',
  getCurrentScreen: 'accessibility',

  // A screenshot needs a MediaProjection session, which is granted per session and has nothing to do with
  // accessibility.
  takeScreenshot: 'screen_capture',

  getContacts: 'contacts',
  findContacts: 'contacts',

  createAlarm: 'exact_alarm',

  sendNotification: 'notifications',

  // Nothing below needs a permission. Listed explicitly rather than defaulted, so adding a tool forces the
  // decision — a `Record<ToolName, …>` will not compile until every name is present.
  openApp: null,
  openAppByName: null,
  listApps: null,
  readClipboard: null,
  writeClipboard: null,
  launchIntent: null,
  getSystemSetting: null,
  controlMedia: null,
  adjustVolume: null,
};

export type ToolGroup = {
  /** The permission this group is gated on, or null for the tools that need none. */
  readonly capability: CapabilityId | null;
  readonly title: string;
  /** What this permission lets the agent do, in the user's terms. */
  readonly summary: string;
  readonly tools: readonly ToolName[];
};

/**
 * Copy per group.
 *
 * Written here rather than taken from `PermissionRationale` on the Kotlin side, because that copy answers
 * "why should I allow this" during onboarding while this answers "what will I lose if I switch it off" on a
 * settings page. The same sentence cannot do both jobs well.
 */
const GROUP_COPY: Readonly<Record<string, { readonly title: string; readonly summary: string }>> = {
  accessibility: {
    title: 'Screen access',
    summary:
      'Read what is on screen, tap, type, and swipe. Without this the agent cannot act at all.',
  },
  screen_capture: {
    title: 'Screen recording',
    summary: 'Take a screenshot, for screens that do not describe their contents any other way.',
  },
  contacts: {
    title: 'Contacts',
    summary: 'Look up a person by name or number, for goals like “message Robert”.',
  },
  exact_alarm: {
    title: 'Alarms',
    summary: 'Set an alarm in your clock app.',
  },
  notifications: {
    title: 'Notifications',
    summary: 'Tell you something by posting a notification.',
  },
  none: {
    title: 'No permission needed',
    summary:
      'These work without granting anything. Switch one off to keep the agent from using it.',
  },
};

/**
 * The tools grouped by the permission they need.
 *
 * Ordered by how much the group matters rather than alphabetically: screen access first because nothing works
 * without it, then the optional grants, then the tools that need nothing. Groups with no tools are dropped, so
 * removing the last tool of a kind removes its card rather than leaving an empty one.
 */
export const toolGroups = (): readonly ToolGroup[] => {
  const order: readonly (CapabilityId | null)[] = [
    'accessibility',
    'screen_capture',
    'contacts',
    'exact_alarm',
    'notifications',
    null,
  ];

  return order
    .map((capability): ToolGroup => {
      const copy = GROUP_COPY[capability ?? 'none'] ?? {
        title: capability ?? 'Other',
        summary: '',
      };

      return {
        capability,
        title: copy.title,
        summary: copy.summary,
        tools: TOOL_NAMES.filter((name) => TOOL_CAPABILITY[name] === capability),
      };
    })
    .filter((group) => group.tools.length > 0);
};

/**
 * A tool name as a short phrase.
 *
 * The page shows names only — the device pass asked for that specifically, and a description per row turned
 * twenty-four rows into a wall of prose. But a bare camelCase identifier is developer vocabulary, so each one
 * is given the shortest phrase that still says what it does.
 *
 * Falls back to the raw name rather than to a prettified one: a tool added without a label here should look
 * unfinished rather than plausible.
 */
export const toolLabel = (name: ToolName): string => TOOL_LABELS[name] ?? name;

const TOOL_LABELS: Readonly<Record<ToolName, string>> = {
  click: 'Tap something',
  longPress: 'Press and hold',
  swipe: 'Swipe or scroll',
  typeText: 'Type text',
  findElement: 'Find an element',
  waitForElement: 'Wait for an element',
  getUiTree: 'Read the screen',
  takeScreenshot: 'Take a screenshot',
  pressBack: 'Press back',
  pressHome: 'Go to the home screen',
  openApp: 'Open an app by package',
  openAppByName: 'Open an app by name',
  listApps: 'List installed apps',
  getCurrentScreen: 'Check the current app',
  getContacts: 'List contacts',
  findContacts: 'Search contacts',
  createAlarm: 'Set an alarm',
  readClipboard: 'Read the clipboard',
  writeClipboard: 'Copy to the clipboard',
  sendNotification: 'Send a notification',
  launchIntent: 'Hand something to Android',
  getSystemSetting: 'Read a system setting',
  controlMedia: 'Control playback',
  adjustVolume: 'Change the volume',
};
