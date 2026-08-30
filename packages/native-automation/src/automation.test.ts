import { describe, expect, it, vi } from 'vitest';

/**
 * Event payload parsing, and the status fallbacks.
 *
 * These exist because of a device report that looked impossible: granting screen capture turned **all
 * three** capabilities off, a recording notification appeared anyway, the system's screen-monitoring
 * icon lit up, and then leaving the settings screen and returning showed everything correctly granted.
 *
 * Two different code paths, one of them broken. The synchronous `getStatus` parses its JSON; the event
 * listener did not, so `event.isReady` was read off a **string** and came back `undefined` — falsy for
 * every capability. Reopening the screen re-read status synchronously and was therefore right.
 *
 * `react-native` is mocked because vitest cannot parse its Flow-typed source. The mock's emitter
 * captures the registered listener so a test can push a raw payload through exactly as native does.
 */

const listeners = new Map<string, (payload: unknown) => void>();

let statusJson = '{"isReady":true,"canCaptureScreen":true,"canDrawOverlay":false}';

vi.mock('react-native', () => ({
  NativeModules: {
    NativeAutomation: {
      getStatus: () => statusJson,
    },
  },
  NativeEventEmitter: class {
    addListener(name: string, listener: (payload: unknown) => void) {
      listeners.set(name, listener);
      return { remove: () => listeners.delete(name) };
    }
  },
  TurboModuleRegistry: {
    get: () => ({ getStatus: () => statusJson }),
    getEnforcing: () => ({ getStatus: () => statusJson }),
  },
}));

const { addAutomationListener, getStatus } = await import('./automation');

describe('event payloads', () => {
  it('parses a JSON string into an object', () => {
    // The bug, directly. Structured data crosses this bridge as JSON, and a listener typed against
    // AutomationEventMap expects an object - so without parsing, every property read is undefined.
    const received: unknown[] = [];

    addAutomationListener('automationStatusChanged', (event) => received.push(event));

    listeners.get('automationStatusChanged')?.(
      '{"isReady":true,"canCaptureScreen":true,"canDrawOverlay":true}',
    );

    expect(received).toEqual([{ isReady: true, canCaptureScreen: true, canDrawOverlay: true }]);
  });

  it('delivers each capability as a real boolean', () => {
    // What the user saw: three capabilities all reading false because the payload was a string.
    let event: { isReady?: boolean; canCaptureScreen?: boolean } = {};

    addAutomationListener('automationStatusChanged', (payload) => {
      event = payload;
    });

    listeners.get('automationStatusChanged')?.(
      '{"isReady":true,"canCaptureScreen":true,"canDrawOverlay":true}',
    );

    expect(event.isReady).toBe(true);
    expect(event.canCaptureScreen).toBe(true);
  });

  it('passes an object through untouched', () => {
    // Tolerated so a future native change to a WritableMap does not silently stop delivering events.
    const received: unknown[] = [];

    addAutomationListener('automationStatusChanged', (event) => received.push(event));

    listeners.get('automationStatusChanged')?.({
      isReady: false,
      canCaptureScreen: true,
      canDrawOverlay: false,
    });

    expect(received).toEqual([{ isReady: false, canCaptureScreen: true, canDrawOverlay: false }]);
  });

  it('drops an unreadable payload rather than throwing', () => {
    // An emit happens on the native side's schedule, so there is no caller to catch a throw - and
    // throwing would take out the emitter for every other subscriber.
    const received: unknown[] = [];

    addAutomationListener('automationStatusChanged', (event) => received.push(event));

    expect(() => listeners.get('automationStatusChanged')?.('not json')).not.toThrow();
    expect(received).toEqual([]);
  });

  it('keeps delivering after a bad payload', () => {
    const received: unknown[] = [];

    addAutomationListener('automationStatusChanged', (event) => received.push(event));

    listeners.get('automationStatusChanged')?.('{oops');
    listeners.get('automationStatusChanged')?.(
      '{"isReady":true,"canCaptureScreen":false,"canDrawOverlay":false}',
    );

    expect(received).toHaveLength(1);
  });
});

describe('getStatus', () => {
  it('parses the synchronous read', () => {
    statusJson = '{"isReady":true,"canCaptureScreen":false,"canDrawOverlay":true}';

    expect(getStatus()).toEqual({
      isReady: true,
      canCaptureScreen: false,
      canDrawOverlay: true,
    });
  });

  it('reports unknown rather than off when the payload is unreadable', () => {
    // The distinction that matters to the UI: `false` is a fact about the user's choices, `statusKnown`
    // false is an admission we could not tell. Rendering the second as the first sends someone to
    // Settings to fix what was never broken.
    statusJson = 'not json';

    expect(getStatus().statusKnown).toBe(false);
  });
});
