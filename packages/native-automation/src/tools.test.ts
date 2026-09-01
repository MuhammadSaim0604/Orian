import { describe, expect, it, vi } from 'vitest';

/**
 * Dispatching a tool call by name.
 *
 * The interesting risk here is a tool that is in the vocabulary but wired to nothing, or
 * wired to the wrong function. Both fail only when someone runs that step on a real
 * phone, so these tests check the mapping directly against a mocked module.
 */

const calls: { fn: string; args: unknown[] }[] = [];

const record =
  (fn: string) =>
  (...args: unknown[]) => {
    calls.push({ fn, args });
    return Promise.resolve(undefined);
  };

vi.mock('./automation', () => ({
  click: record('click'),
  clickAt: record('clickAt'),
  longPress: record('longPress'),
  swipe: record('swipe'),
  typeText: record('typeText'),
  pressBack: record('pressBack'),
  pressHome: record('pressHome'),
  findElement: record('findElement'),
  waitForElement: record('waitForElement'),
  getUiTree: record('getUiTree'),
  takeScreenshot: record('takeScreenshot'),
  runOcr: record('runOcr'),
  findTextOnScreen: record('findTextOnScreen'),
  getCurrentScreen: record('getCurrentScreen'),
  openApp: record('openApp'),
  openAppByName: record('openAppByName'),
  listApps: record('listApps'),
  getContacts: record('getContacts'),
  findContacts: record('findContacts'),
  createAlarm: record('createAlarm'),
  readClipboard: record('readClipboard'),
  writeClipboard: record('writeClipboard'),
  sendNotification: record('sendNotification'),
  launchIntent: record('launchIntent'),
  getSystemSetting: record('getSystemSetting'),
  controlMedia: record('controlMedia'),
  adjustVolume: record('adjustVolume'),
  sendSms: record('sendSms'),
  readSms: record('readSms'),
  placeCall: record('placeCall'),
  endCall: record('endCall'),
  setSystemSetting: record('setSystemSetting'),
  setRingerMode: record('setRingerMode'),
}));

const { invokeTool } = await import('./tools');
const { TOOL_NAMES } = await import('@mobile-automation/tool-sdk');

const lastCall = () => calls.at(-1)!;

describe('dispatch', () => {
  it('routes a click to the click function', async () => {
    await invokeTool('click', { selector: { text: 'Send' } });

    expect(lastCall()).toEqual({ fn: 'click', args: [{ text: 'Send' }] });
  });

  it('routes typeText with its selector and text', async () => {
    await invokeTool('typeText', { selector: { resourceId: 'entry' }, text: 'hello' });

    expect(lastCall()).toEqual({ fn: 'typeText', args: [{ resourceId: 'entry' }, 'hello'] });
  });

  it('routes a swipe with its direction', async () => {
    await invokeTool('swipe', { direction: 'down', distanceFraction: 0.5 });

    expect(lastCall()).toEqual({ fn: 'swipe', args: ['down', 0.5] });
  });

  it('maps getUiTree to the compact tree by default', async () => {
    // The caller is almost always assembling model context, where the omitted fields
    // cost tokens and carry nothing.
    await invokeTool('getUiTree', {});

    expect(lastCall()).toEqual({ fn: 'getUiTree', args: [true] });
  });

  it('honours an explicit request for the full tree', async () => {
    await invokeTool('getUiTree', { compact: false });

    expect(lastCall()).toEqual({ fn: 'getUiTree', args: [false] });
  });

  it('routes readScreen-style tools with no arguments', async () => {
    await invokeTool('pressBack', {});

    expect(lastCall()).toEqual({ fn: 'pressBack', args: [] });
  });

  it('builds an alarm request that sets the alarm silently', async () => {
    // An agent that opened a half-filled clock form would have failed the task.
    await invokeTool('createAlarm', { hour: 7, minute: 30, label: 'Standup' });

    expect(lastCall().fn).toBe('createAlarm');
    expect(lastCall().args[0]).toEqual({
      hour: 7,
      minute: 30,
      label: 'Standup',
      repeatDays: undefined,
      skipUi: true,
    });
  });

  it('builds an intent request from named fields rather than passing the object through', async () => {
    // Passing the argument object straight through would smuggle any extra key into the
    // native layer.
    await invokeTool('launchIntent', {
      action: 'android.intent.action.VIEW',
      dataUri: 'https://example.com',
    });

    expect(lastCall().args[0]).toEqual({
      action: 'android.intent.action.VIEW',
      dataUri: 'https://example.com',
      packageName: undefined,
      extras: undefined,
      requireChooser: undefined,
    });
  });

  it('fails loudly for a tool with no wiring', async () => {
    // Silently ignoring it would leave the agent believing it had acted, and it would
    // then reason about a screen that never changed.
    await expect(invokeTool('teleport', {})).rejects.toThrow(/No device function is wired/);
  });

  it('wires every tool in the vocabulary', async () => {
    // The test that would have caught a tool added to TOOL_NAMES but never connected.
    const argumentsFor: Record<string, Record<string, unknown>> = {
      click: { selector: { text: 'x' } },
      longPress: { selector: { text: 'x' } },
      swipe: { direction: 'down' },
      typeText: { selector: { text: 'x' }, text: 'y' },
      pressBack: {},
      pressHome: {},
      findElement: { selector: { text: 'x' } },
      waitForElement: { selector: { text: 'x' } },
      getUiTree: {},
      takeScreenshot: {},
      runOcr: {},
      findTextOnScreen: { text: 'Send' },
      getCurrentScreen: {},
      openApp: { packageName: 'com.x' },
      openAppByName: { name: 'X' },
      listApps: {},
      getContacts: {},
      findContacts: { query: 'x' },
      createAlarm: { hour: 1, minute: 0 },
      readClipboard: {},
      writeClipboard: { text: 'x' },
      sendNotification: { title: 'x', body: 'y' },
      launchIntent: { action: 'x' },
      getSystemSetting: { key: 'x' },
      controlMedia: { command: 'play' },
      adjustVolume: { direction: 'up' },
      sendSms: { phoneNumber: '+447700900123', body: 'x' },
      readSms: {},
      placeCall: { phoneNumber: '+447700900123' },
      endCall: {},
      setSystemSetting: { key: 'screen_brightness', value: '128' },
      setRingerMode: { mode: 'silent' },
    };

    for (const name of TOOL_NAMES) {
      await expect(invokeTool(name, argumentsFor[name] ?? {})).resolves.toBeUndefined();
    }
  });
});
