import { TOOL_NAMES } from '@mobile-automation/tool-sdk';

import { TOOL_CAPABILITY, toolGroups, toolLabel } from '../toolCapabilities';

/**
 * Which permission each tool needs.
 *
 * The map exists because the tools page used to be a hand-kept list that named a permission for only five of
 * the twenty-four tools — so a tool failing for want of a permission looked like a broken tool.
 *
 * The rule these tests protect is the one that was actually wrong in the code: **most tools need no
 * permission at all.** The bridge used to reject every call when the accessibility service was off, which
 * claimed the opposite for fourteen of them.
 */

describe('the map', () => {
  it('covers every tool', () => {
    // Typed as `Record<ToolName, …>`, so this cannot fail at runtime without also failing to compile — which
    // is the point: adding a tool forces the decision rather than defaulting it.
    for (const name of TOOL_NAMES) {
      expect(TOOL_CAPABILITY).toHaveProperty(name);
    }
  });

  it('requires no permission for the tools that genuinely need none', () => {
    // The correction. Opening an app, listing apps, the clipboard, an intent, a settings read and media
    // control all work on a device where the user has granted nothing.
    expect(TOOL_CAPABILITY.openApp).toBeNull();
    expect(TOOL_CAPABILITY.openAppByName).toBeNull();
    expect(TOOL_CAPABILITY.listApps).toBeNull();
    expect(TOOL_CAPABILITY.readClipboard).toBeNull();
    expect(TOOL_CAPABILITY.writeClipboard).toBeNull();
    expect(TOOL_CAPABILITY.launchIntent).toBeNull();
    expect(TOOL_CAPABILITY.getSystemSetting).toBeNull();
    expect(TOOL_CAPABILITY.controlMedia).toBeNull();
    expect(TOOL_CAPABILITY.adjustVolume).toBeNull();
  });

  it('puts the screen tools behind accessibility', () => {
    expect(TOOL_CAPABILITY.click).toBe('accessibility');
    expect(TOOL_CAPABILITY.typeText).toBe('accessibility');
    expect(TOOL_CAPABILITY.getUiTree).toBe('accessibility');
    expect(TOOL_CAPABILITY.pressBack).toBe('accessibility');
  });

  it('puts a screenshot behind screen capture, not accessibility', () => {
    // A distinct grant with a distinct mechanism — per session, and unrelated to reading the tree.
    expect(TOOL_CAPABILITY.takeScreenshot).toBe('screen_capture');
  });

  it('maps the remaining device permissions', () => {
    expect(TOOL_CAPABILITY.getContacts).toBe('contacts');
    expect(TOOL_CAPABILITY.findContacts).toBe('contacts');
    expect(TOOL_CAPABILITY.createAlarm).toBe('exact_alarm');
    expect(TOOL_CAPABILITY.sendNotification).toBe('notifications');
  });
});

describe('grouping for the page', () => {
  it('lists every tool exactly once', () => {
    // A tool in two cards would be togglable from two places, and the two would disagree.
    const grouped = toolGroups().flatMap((group) => group.tools);

    expect(grouped).toHaveLength(TOOL_NAMES.length);
    expect(new Set(grouped).size).toBe(TOOL_NAMES.length);
  });

  it('puts screen access first, because nothing works without it', () => {
    expect(toolGroups()[0]?.capability).toBe('accessibility');
  });

  it('puts the no-permission group last', () => {
    expect(toolGroups().at(-1)?.capability).toBeNull();
  });

  it('gives every group a title and a summary', () => {
    // An untitled card is an unexplained one, and this page exists to explain.
    for (const group of toolGroups()) {
      expect(group.title.length).toBeGreaterThan(0);
      expect(group.summary.length).toBeGreaterThan(0);
    }
  });

  it('drops no tool into an empty group', () => {
    for (const group of toolGroups()) {
      expect(group.tools.length).toBeGreaterThan(0);
    }
  });
});

describe('labels', () => {
  it('phrases every tool rather than showing its identifier', () => {
    // `camelCase` is developer vocabulary. The page shows names only, so the name has to be readable.
    for (const name of TOOL_NAMES) {
      expect(toolLabel(name)).not.toBe(name);
    }
  });

  it('keeps them short enough for one line', () => {
    for (const name of TOOL_NAMES) {
      expect(toolLabel(name).length).toBeLessThanOrEqual(30);
    }
  });
});
