/**
 * Agent Mode's tool toggles and run bounds.
 *
 * The rule these protect is stated in the step file and is easy to get subtly wrong: **a toggle must reach the
 * prompt, not just the UI.** A tool the model is told about but which is disabled produces a call that fails
 * mid-run, and that reads as the agent malfunctioning rather than as a setting being respected.
 *
 * `react-native` is mocked because the subject reads `NativeModules` at import time — the defensive lookup
 * adopted after the launch crash, where touching a malformed module validates its whole method table and takes
 * the process down. The mock has to be in place before the import, which is why it is not assigned in a
 * `beforeEach`.
 */

const mockStore = new Map<string, string>();

jest.mock('react-native', () => ({
  NativeModules: {
    AppPreferences: {
      getString: (key: string, fallback: string) => mockStore.get(key) ?? fallback,
      setString: async (key: string, value: string) => {
        mockStore.set(key, value);
      },
    },
  },
}));

import { TOOL_NAMES } from '@mobile-automation/tool-sdk';

import {
  DEFAULT_AGENT_SETTINGS,
  DEFAULT_DEADLINE_MS,
  DEFAULT_MAX_STEPS,
  MAX_DEADLINE_MS,
  MAX_MAX_STEPS,
  MIN_DEADLINE_MS,
  MIN_MAX_STEPS,
  enabledToolNames,
  isToolEnabled,
  readAgentSettings,
  toggleTool,
  toolsWithImpact,
  writeDeadlineMs,
  writeDisabledTools,
  writeMaxSteps,
  writeRecordTraces,
} from '../agentSettings';

beforeEach(() => {
  mockStore.clear();
});

describe('defaults', () => {
  it('starts with every tool available', () => {
    // A fresh install must not have to visit this page for the agent to work.
    expect(readAgentSettings().disabledTools).toEqual([]);
    expect(enabledToolNames(readAgentSettings())).toHaveLength(TOOL_NAMES.length);
  });

  it('records traces by default', () => {
    // Recording is what makes a run compilable into a workflow, which is a headline feature — off by default
    // would mean the feature appears not to exist.
    expect(readAgentSettings().recordTraces).toBe(true);
  });

  it('matches the loop’s own bounds', () => {
    // A settings screen showing a default the engine does not use would be lying.
    expect(DEFAULT_AGENT_SETTINGS.maxSteps).toBe(DEFAULT_MAX_STEPS);
    expect(DEFAULT_AGENT_SETTINGS.deadlineMs).toBe(DEFAULT_DEADLINE_MS);
  });
});

describe('the enabled tool list', () => {
  it('excludes a disabled tool', () => {
    const settings = { ...DEFAULT_AGENT_SETTINGS, disabledTools: ['click' as const] };

    expect(enabledToolNames(settings)).not.toContain('click');
  });

  it('keeps everything else', () => {
    const settings = { ...DEFAULT_AGENT_SETTINGS, disabledTools: ['click' as const] };

    expect(enabledToolNames(settings)).toHaveLength(TOOL_NAMES.length - 1);
  });

  it('is derived from the canonical tool list, so a new tool is enabled by default', () => {
    // The reason the stored set is the *disabled* one. With an enabled-list, every tool shipped after the
    // user's last visit here would be silently unavailable — and that bug would look like the new feature
    // simply not working.
    expect(enabledToolNames(DEFAULT_AGENT_SETTINGS)).toEqual([...TOOL_NAMES]);
  });

  it('reports whether one tool is enabled', () => {
    const settings = { ...DEFAULT_AGENT_SETTINGS, disabledTools: ['swipe' as const] };

    expect(isToolEnabled(settings, 'swipe')).toBe(false);
    expect(isToolEnabled(settings, 'click')).toBe(true);
  });
});

describe('toggling', () => {
  it('disables a tool', () => {
    expect(toggleTool(DEFAULT_AGENT_SETTINGS, 'click', false)).toEqual(['click']);
  });

  it('re-enables a tool', () => {
    const settings = {
      ...DEFAULT_AGENT_SETTINGS,
      disabledTools: ['click' as const, 'swipe' as const],
    };

    expect(toggleTool(settings, 'click', true)).toEqual(['swipe']);
  });

  it('does not duplicate an already-disabled tool', () => {
    // A double tap would otherwise store the same name twice, which is harmless but makes the count wrong in
    // the settings summary.
    const settings = { ...DEFAULT_AGENT_SETTINGS, disabledTools: ['click' as const] };

    expect(toggleTool(settings, 'click', false)).toEqual(['click']);
  });
});

describe('persistence', () => {
  it('round trips the disabled list', async () => {
    await writeDisabledTools(['click', 'typeText']);

    expect(readAgentSettings().disabledTools).toEqual(['click', 'typeText']);
  });

  it('drops a stored name that is no longer a tool', async () => {
    // A renamed or removed tool would otherwise sit in the list forever — and worse, reach `allowedTools`,
    // narrowing what the model may call for a reason nobody could see in the UI.
    mockStore.set('agent.disabledTools', 'click,thisToolWasRemoved');

    expect(readAgentSettings().disabledTools).toEqual(['click']);
  });

  it('treats an empty stored list as nothing disabled', () => {
    mockStore.set('agent.disabledTools', '');

    expect(readAgentSettings().disabledTools).toEqual([]);
  });

  it('round trips the step ceiling', async () => {
    await writeMaxSteps(20);

    expect(readAgentSettings().maxSteps).toBe(20);
  });

  it('clamps a step ceiling that is too low', async () => {
    // These limits are the user's protection against a confused model driving their phone, so the stored value
    // has to stay inside a range that is actually usable.
    await writeMaxSteps(1);

    expect(readAgentSettings().maxSteps).toBe(MIN_MAX_STEPS);
  });

  it('clamps a step ceiling that is absurd', async () => {
    await writeMaxSteps(100_000);

    expect(readAgentSettings().maxSteps).toBe(MAX_MAX_STEPS);
  });

  it('clamps the deadline both ways', async () => {
    await writeDeadlineMs(1);
    expect(readAgentSettings().deadlineMs).toBe(MIN_DEADLINE_MS);

    await writeDeadlineMs(Number.MAX_SAFE_INTEGER);
    expect(readAgentSettings().deadlineMs).toBe(MAX_DEADLINE_MS);
  });

  it('falls back to the default when a stored bound is unreadable', () => {
    // A corrupted preference must not leave the agent with NaN as its ceiling, which would end the run
    // immediately and look like an instant failure.
    mockStore.set('agent.maxSteps', 'not a number');

    expect(readAgentSettings().maxSteps).toBe(DEFAULT_MAX_STEPS);
  });

  it('round trips trace recording', async () => {
    await writeRecordTraces(false);
    expect(readAgentSettings().recordTraces).toBe(false);

    await writeRecordTraces(true);
    expect(readAgentSettings().recordTraces).toBe(true);
  });

  it('treats a missing recording preference as on', () => {
    // Only an explicit "false" turns it off. A missing value means the default, and the default is to record.
    expect(readAgentSettings().recordTraces).toBe(true);
  });
});

describe('grouping for the tools page', () => {
  it('covers every tool across the impact groups', () => {
    // A tool with an impact no group covers would be invisible on the page — present in the prompt but
    // impossible to switch off.
    const grouped = ['read', 'interact', 'write', 'system'].flatMap((impact) =>
      toolsWithImpact(impact),
    );

    expect(new Set(grouped).size).toBe(TOOL_NAMES.length);
  });

  it('puts a read-only tool in the reading group', () => {
    expect(toolsWithImpact('read')).toContain('getUiTree');
  });

  it('puts a screen-touching tool in the interact group', () => {
    expect(toolsWithImpact('interact')).toContain('click');
  });
});
