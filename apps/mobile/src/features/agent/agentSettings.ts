import { TOOL_DEFINITIONS, TOOL_NAMES, type ToolName } from '@mobile-automation/tool-sdk';
import { NativeModules } from 'react-native';

/**
 * Which tools the agent may use, and Agent Mode's run bounds.
 *
 * The user could not previously see which tools existed, let alone disable one (issue B4). This is the state
 * behind that page — and the step file is emphatic about the part that matters: **a toggle must reach the
 * prompt, not just the UI**. A tool the model is told about but which is disabled produces a call that fails
 * mid-run, which reads as the agent being broken rather than as a setting being respected.
 *
 * Stored in SharedPreferences rather than Room. These are startup scalars read before the first paint, the
 * same reasoning as the shell's preferences: a database round trip to find out whether to show a toggle as on
 * would make the page flicker.
 *
 * ## Disabled, not enabled
 *
 * The stored set is the **disabled** ones. Two reasons, and the second is the real one:
 *
 * - A fresh install has everything available, which is the sensible default and needs no stored value.
 * - **A newly added tool is enabled by default.** With an enabled-list, every tool shipped after the user's
 *   last visit to this page would be silently unavailable, and the bug would look like the new feature
 *   simply not working.
 */

type AgentSettingsNative = {
  getString: (key: string, fallback: string) => string;
  setString: (key: string, value: string) => Promise<void>;
};

const native = ((): AgentSettingsNative | undefined => {
  try {
    return (NativeModules as { AppPreferences?: AgentSettingsNative }).AppPreferences;
  } catch {
    return undefined;
  }
})();

const DISABLED_TOOLS_KEY = 'agent.disabledTools';
const MAX_STEPS_KEY = 'agent.maxSteps';
const DEADLINE_KEY = 'agent.deadlineMs';
const RECORD_TRACES_KEY = 'agent.recordTraces';

/**
 * Defaults matching the loop's own.
 *
 * Restated rather than imported so this module does not depend on `ai-agent` for two numbers — but they are
 * deliberately the same values, because a settings screen showing a default the engine does not use would be
 * lying.
 */
export const DEFAULT_MAX_STEPS = 40;
export const DEFAULT_DEADLINE_MS = 600_000;

/** Bounds on the bounds. A ceiling of one is useless; a ceiling of a thousand is not a ceiling. */
export const MIN_MAX_STEPS = 5;
export const MAX_MAX_STEPS = 200;
export const MIN_DEADLINE_MS = 60_000;
export const MAX_DEADLINE_MS = 3_600_000;

export type AgentSettings = {
  /** Tools the user has switched off. Everything else is available. */
  readonly disabledTools: readonly ToolName[];
  readonly maxSteps: number;
  readonly deadlineMs: number;
  /** Whether to keep a recording of each run, for compiling into a workflow. */
  readonly recordTraces: boolean;
};

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  disabledTools: [],
  maxSteps: DEFAULT_MAX_STEPS,
  deadlineMs: DEFAULT_DEADLINE_MS,
  recordTraces: true,
};

/**
 * Reads the settings synchronously.
 *
 * Synchronous because the tools page and the settings screen both read it during render, and a promise would
 * make every toggle flash its default before correcting itself.
 */
export const readAgentSettings = (): AgentSettings => {
  if (native === undefined) return DEFAULT_AGENT_SETTINGS;

  try {
    return {
      disabledTools: decodeToolNames(native.getString(DISABLED_TOOLS_KEY, '')),
      maxSteps: clampSteps(Number.parseInt(native.getString(MAX_STEPS_KEY, ''), 10)),
      deadlineMs: clampDeadline(Number.parseInt(native.getString(DEADLINE_KEY, ''), 10)),
      // Anything other than an explicit "false" means on. A missing value must mean the default, and the
      // default is to record.
      recordTraces: native.getString(RECORD_TRACES_KEY, 'true') !== 'false',
    };
  } catch {
    return DEFAULT_AGENT_SETTINGS;
  }
};

export const writeDisabledTools = async (disabled: readonly ToolName[]): Promise<void> => {
  await native?.setString(DISABLED_TOOLS_KEY, disabled.join(','));
};

export const writeMaxSteps = async (maxSteps: number): Promise<void> => {
  await native?.setString(MAX_STEPS_KEY, String(clampSteps(maxSteps)));
};

export const writeDeadlineMs = async (deadlineMs: number): Promise<void> => {
  await native?.setString(DEADLINE_KEY, String(clampDeadline(deadlineMs)));
};

export const writeRecordTraces = async (record: boolean): Promise<void> => {
  await native?.setString(RECORD_TRACES_KEY, record ? 'true' : 'false');
};

/**
 * The tools the model may be told about.
 *
 * **This is the function that makes a toggle mean something.** It is passed to `runAgent` as `allowedTools`,
 * which filters both the tool list in the prompt and the validator — so a disabled tool is not merely
 * unavailable, the model never learns it exists and therefore never tries it.
 *
 * Derived from the canonical `TOOL_NAMES` rather than from a stored enabled-list, which is what makes a newly
 * shipped tool available without the user having to go and find it.
 */
export const enabledToolNames = (settings: AgentSettings): readonly ToolName[] => {
  const disabled = new Set(settings.disabledTools);
  return TOOL_NAMES.filter((name) => !disabled.has(name));
};

export const isToolEnabled = (settings: AgentSettings, name: ToolName): boolean =>
  !settings.disabledTools.includes(name);

/**
 * Toggles one tool.
 *
 * Returns the new disabled list rather than mutating, so a caller can persist and set state from one value.
 */
export const toggleTool = (
  settings: AgentSettings,
  name: ToolName,
  enabled: boolean,
): readonly ToolName[] =>
  enabled
    ? settings.disabledTools.filter((candidate) => candidate !== name)
    : settings.disabledTools.includes(name)
      ? settings.disabledTools
      : [...settings.disabledTools, name];

/**
 * Parses the stored list, dropping anything that is not a current tool.
 *
 * A tool that was disabled and has since been renamed or removed would otherwise sit in the list forever,
 * and — worse — a stale name reaching `allowedTools` would narrow the model's tool set for a reason nobody
 * could see in the UI.
 */
const decodeToolNames = (stored: string): readonly ToolName[] => {
  if (stored.trim() === '') return [];

  const known = new Set<string>(TOOL_NAMES);

  return stored
    .split(',')
    .map((name) => name.trim())
    .filter((name): name is ToolName => known.has(name));
};

const clampSteps = (value: number): number =>
  Number.isFinite(value)
    ? Math.min(Math.max(value, MIN_MAX_STEPS), MAX_MAX_STEPS)
    : DEFAULT_MAX_STEPS;

const clampDeadline = (value: number): number =>
  Number.isFinite(value)
    ? Math.min(Math.max(value, MIN_DEADLINE_MS), MAX_DEADLINE_MS)
    : DEFAULT_DEADLINE_MS;

/**
 * Tools grouped for the management page, by what they can do to the device.
 *
 * By impact rather than alphabetically, because that is the question a user has when deciding what to switch
 * off: a `read` tool observes, an `interact` tool touches the screen, a `write` tool changes something
 * outside the app. Twenty-four tools in one flat list is a wall to read.
 */
export const TOOL_GROUPS: readonly {
  readonly impact: 'read' | 'interact' | 'write' | 'system';
  readonly label: string;
  readonly explanation: string;
}[] = [
  {
    impact: 'read',
    label: 'Reading',
    explanation: 'Observe the screen and the device. These change nothing.',
  },
  {
    impact: 'interact',
    label: 'Touching the screen',
    explanation: 'Tap, type, swipe, and open apps — how the agent operates your phone.',
  },
  {
    impact: 'write',
    label: 'Changing things',
    explanation: 'Create or modify something outside this app, such as an alarm or the clipboard.',
  },
  {
    impact: 'system',
    label: 'System',
    explanation: 'Hand something to Android itself. Broad, so worth reviewing.',
  },
];

/** Tool names for one impact group, in declaration order. */
export const toolsWithImpact = (impact: string): readonly ToolName[] =>
  TOOL_NAMES.filter((name) => TOOL_DEFINITIONS[name].impact === impact);
