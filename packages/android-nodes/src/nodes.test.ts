import {
  createRecordingToolInvoker,
  createTestContext,
  createVariableStore,
  executeNode,
  type AnyNodeDefinition,
} from '@mobile-automation/node-sdk';
import { describe, expect, it } from 'vitest';

import {
  alarmNode,
  clipboardWriteNode,
  contactNode,
  longPressNode,
  mediaNode,
  notificationNode,
  ocrNode,
  openAppNode,
  pressBackNode,
  readScreenNode,
  swipeNode,
  typeTextNode,
  volumeNode,
  waitForElementNode,
} from './index';

const selector = { resourceId: 'com.whatsapp:id/entry' };

/** Runs a node against a fake device, returning what it asked the device to do. */
const run = async (
  node: AnyNodeDefinition,
  config: unknown,
  handlers: Record<string, () => unknown> = {},
  variables = createVariableStore(),
) => {
  const tools = createRecordingToolInvoker(
    Object.keys(handlers).length > 0
      ? handlers
      : { [Object.keys(handlers)[0] ?? 'noop']: () => undefined },
  );

  const result = await executeNode(node, {
    ...createTestContext({ config: {}, tools, variables }),
    config,
  });

  return { call: tools.calls[0], calls: tools.calls, result, variables };
};

describe('openApp', () => {
  it('opens by package name when given one', async () => {
    const { call } = await run(
      openAppNode,
      { packageName: 'com.whatsapp' },
      {
        openApp: () => undefined,
      },
    );

    expect(call).toEqual({ tool: 'openApp', args: { packageName: 'com.whatsapp' } });
  });

  it('opens by human name when that is all the workflow knows', async () => {
    // A hand-built workflow says "WhatsApp"; requiring the package would make that
    // case unusable.
    const { call } = await run(
      openAppNode,
      { appName: 'WhatsApp' },
      {
        openAppByName: () => ({ packageName: 'com.whatsapp', label: 'WhatsApp' }),
      },
    );

    expect(call).toEqual({ tool: 'openAppByName', args: { name: 'WhatsApp' } });
  });

  it('rejects a config with neither', async () => {
    await expect(
      executeNode(openAppNode, { ...createTestContext({ config: {} }), config: {} }),
    ).rejects.toThrow(/invalid configuration/);
  });

  it('retries by default, since a cold start can lose the launch intent', () => {
    expect(openAppNode.defaultExecutionPolicy?.retry).toBeGreaterThan(0);
    expect(openAppNode.defaultExecutionPolicy?.onError).toBe('retry');
  });
});

describe('typeText', () => {
  it('interpolates variables into the text', async () => {
    // The one place a workflow types free text, where surrounding words are literal.
    const { call } = await run(
      typeTextNode,
      { selector, text: 'Hi {{ name }}, running late' },
      { typeText: () => undefined },
      createVariableStore({ name: 'Robert' }),
    );

    expect(call?.args.text).toBe('Hi Robert, running late');
  });

  it('fails on a reference to an unset variable', async () => {
    await expect(
      run(typeTextNode, { selector, text: '{{ missing }}' }, { typeText: () => undefined }),
    ).rejects.toThrow(/has not been set/);
  });

  it('passes plain text through unchanged', async () => {
    const { call } = await run(
      typeTextNode,
      { selector, text: 'hello' },
      {
        typeText: () => undefined,
      },
    );

    expect(call?.args.text).toBe('hello');
  });
});

describe('swipe', () => {
  it('defaults to most of the screen', async () => {
    const { call } = await run(swipeNode, { direction: 'down' }, { swipe: () => undefined });

    expect(call?.args).toEqual({ direction: 'down', distanceFraction: 0.8 });
  });

  it('accepts an explicit distance', async () => {
    const { call } = await run(
      swipeNode,
      { direction: 'up', distanceFraction: 0.3 },
      { swipe: () => undefined },
    );

    expect(call?.args.distanceFraction).toBe(0.3);
  });

  it('rejects a distance beyond the screen', async () => {
    await expect(
      run(swipeNode, { direction: 'up', distanceFraction: 2 }, { swipe: () => undefined }),
    ).rejects.toThrow(/invalid configuration/);
  });
});

describe('longPress', () => {
  it('sends zero to mean the platform default', async () => {
    // The codegen spec cannot express an optional number.
    const { call } = await run(longPressNode, { selector }, { longPress: () => undefined });

    expect(call?.args.durationMs).toBe(0);
  });

  it('passes an explicit duration', async () => {
    const { call } = await run(
      longPressNode,
      { selector, durationMs: 900 },
      { longPress: () => undefined },
    );

    expect(call?.args.durationMs).toBe(900);
  });
});

describe('waitForElement', () => {
  it('defaults to a five second budget', async () => {
    const { call } = await run(
      waitForElementNode,
      { selector },
      {
        waitForElement: () => ({ text: 'Send' }),
      },
    );

    expect(call?.args.timeoutMs).toBe(5_000);
  });

  it('caps an unreasonable wait at config validation', async () => {
    await expect(
      run(
        waitForElementNode,
        { selector, timeoutMs: 600_000 },
        {
          waitForElement: () => undefined,
        },
      ),
    ).rejects.toThrow(/invalid configuration/);
  });
});

describe('readScreen', () => {
  it('asks for the compact tree by default, since tokens cost', async () => {
    const { call } = await run(readScreenNode, {}, { getUiTree: () => ({ nodeCount: 12 }) });

    expect(call?.args.compact).toBe(true);
  });

  it('can request the full tree for the recorder', async () => {
    const { call } = await run(
      readScreenNode,
      { compact: false },
      {
        getUiTree: () => ({ nodeCount: 12 }),
      },
    );

    expect(call?.args.compact).toBe(false);
  });
});

/**
 * The OCR node.
 *
 * One node, two tools, and the config decides which — so most of what is worth testing is the dispatch and the
 * behaviour when the text is absent, which is the normal case on a screen that has changed.
 */
describe('ocr', () => {
  const match = { text: 'Continue', centerX: 550, centerY: 1250, matchKind: 'exact' };

  it('reads the whole screen when no text is configured', async () => {
    // Without a search term the workflow is branching on screen content and wants everything.
    const { call } = await run(ocrNode, {}, { runOcr: () => ({ blockCount: 3 }) });

    expect(call?.tool).toBe('runOcr');
  });

  it('looks for one string when text is configured', async () => {
    // With a search term the workflow is about to act on one thing and wants the best match.
    const { call } = await run(ocrNode, { text: 'Continue' }, { findTextOnScreen: () => match });

    expect(call?.tool).toBe('findTextOnScreen');
    expect(call?.args.text).toBe('Continue');
  });

  it('allows a fuzzy match by default', async () => {
    // OCR reads `l` as `1` and `O` as `0`, so an exact comparison fails on text a person reads without noticing.
    const { call } = await run(ocrNode, { text: 'Continue' }, { findTextOnScreen: () => match });

    expect(call?.args.exact).toBe(false);
  });

  it('can demand an exact match', async () => {
    const { call } = await run(
      ocrNode,
      { text: 'Continue', exact: true },
      { findTextOnScreen: () => match },
    );

    expect(call?.args.exact).toBe(true);
  });

  it('fails when the text is missing, by default', async () => {
    // The safer half of an asymmetric choice: a workflow that continues past a missing "Payment successful" goes
    // on to do the next thing having never confirmed the first.
    const notFound = Object.assign(new Error('Element not found'), { code: 'element_not_found' });

    await expect(
      run(
        ocrNode,
        { text: 'Continue' },
        {
          findTextOnScreen: () => {
            throw notFound;
          },
        },
      ),
    ).rejects.toThrow();
  });

  it('can continue past missing text when told to', async () => {
    // For the case where absence is the expected outcome - checking whether an error banner appeared.
    const notFound = Object.assign(new Error('Element not found'), { code: 'element_not_found' });

    const { result } = await run(
      ocrNode,
      { text: 'Continue', failIfMissing: false },
      {
        findTextOnScreen: () => {
          throw notFound;
        },
      },
    );

    expect(result.outputs?.result).toBeNull();
    expect(result.summary).toContain('not on screen');
  });

  it('still fails on a denied screen capture, even when told to continue', async () => {
    // The distinction the code checks by error *code* rather than message. Swallowing everything would swallow
    // "screen capture was denied", which is not a missing-text situation and needs the user rather than the next
    // node.
    const denied = Object.assign(new Error('needs permission'), {
      code: 'capture_consent_required',
    });

    await expect(
      run(
        ocrNode,
        { text: 'Continue', failIfMissing: false },
        {
          findTextOnScreen: () => {
            throw denied;
          },
        },
      ),
    ).rejects.toThrow();
  });

  it('assigns the match to a variable when asked', async () => {
    const { variables } = await run(
      ocrNode,
      { text: 'Continue', assignTo: 'button' },
      { findTextOnScreen: () => match },
    );

    expect(variables.get('button')).toEqual(match);
  });
});

describe('contacts', () => {
  it('lists when no query is given', async () => {
    const { call } = await run(contactNode, {}, { getContacts: () => [] });

    expect(call?.tool).toBe('getContacts');
    expect(call?.args.limit).toBe(200);
  });

  it('searches when a query is given', async () => {
    const { call } = await run(contactNode, { query: 'Robert' }, { findContacts: () => [] });

    expect(call?.tool).toBe('findContacts');
    expect(call?.args.query).toBe('Robert');
  });
});

describe('notification', () => {
  it('interpolates both the title and the body', async () => {
    const { call } = await run(
      notificationNode,
      { title: 'Done: {{ task }}', body: 'took {{ mins }} minutes' },
      { sendNotification: () => undefined },
      createVariableStore({ task: 'Message Robert', mins: 2 }),
    );

    expect(call?.args).toEqual({ title: 'Done: Message Robert', body: 'took 2 minutes' });
  });
});

describe('clipboard', () => {
  it('interpolates the text it writes', async () => {
    const { call } = await run(
      clipboardWriteNode,
      { text: 'code {{ code }}' },
      { writeClipboard: () => undefined },
      createVariableStore({ code: '123456' }),
    );

    expect(call?.args.text).toBe('code 123456');
  });
});

describe('alarm', () => {
  it('sets an alarm without opening the clock UI', async () => {
    const { call } = await run(
      alarmNode,
      { hour: 7, minute: 30, label: 'Standup', repeatDays: [1, 2, 3, 4, 5] },
      { createAlarm: () => undefined },
    );

    expect(call?.args).toEqual({
      hour: 7,
      minute: 30,
      label: 'Standup',
      repeatDays: [1, 2, 3, 4, 5],
      skipUi: true,
    });
  });

  it('rejects an impossible time', async () => {
    await expect(
      run(alarmNode, { hour: 25, minute: 0 }, { createAlarm: () => undefined }),
    ).rejects.toThrow(/invalid configuration/);
  });

  it('defaults to a one-off alarm', async () => {
    const { call } = await run(alarmNode, { hour: 7, minute: 0 }, { createAlarm: () => undefined });

    expect(call?.args.repeatDays).toEqual([]);
  });
});

describe('media and volume', () => {
  it('sends a playback command', async () => {
    const { call } = await run(
      mediaNode,
      { command: 'play_pause' },
      {
        controlMedia: () => undefined,
      },
    );

    expect(call).toEqual({ tool: 'controlMedia', args: { command: 'play_pause' } });
  });

  it('rejects an unknown command at config validation', async () => {
    await expect(
      run(mediaNode, { command: 'moonwalk' }, { controlMedia: () => undefined }),
    ).rejects.toThrow(/invalid configuration/);
  });

  it('nudges the volume', async () => {
    const { call } = await run(
      volumeNode,
      { direction: 'down' },
      {
        adjustVolume: () => undefined,
      },
    );

    expect(call).toEqual({ tool: 'adjustVolume', args: { direction: 'down' } });
  });
});

describe('no-argument nodes', () => {
  it('presses back with no arguments', async () => {
    const { call } = await run(pressBackNode, {}, { pressBack: () => undefined });

    expect(call).toEqual({ tool: 'pressBack', args: {} });
  });
});
