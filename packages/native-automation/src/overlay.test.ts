import { describe, expect, it, vi } from 'vitest';

/**
 * The overlay wrapper's error handling and its behaviour without the native module.
 *
 * `react-native` is mocked because vitest cannot parse its Flow-typed source, and because the point
 * of these tests is the wrapper's own logic rather than the bridge. The mock supplies **no**
 * `ConfigureOverlay` module, which is the case that matters most: a build lacking it must degrade
 * rather than throw on import.
 *
 * The behaviour being protected is that the rejection **code** survives the crossing, since the
 * code decides the UI's response - a permission denial offers a settings link, and anything else is
 * merely reported. A single message string would force the UI to match on prose.
 */

vi.mock('react-native', () => ({
  NativeModules: {},
  NativeEventEmitter: class {
    addListener() {
      return { remove: () => undefined };
    }
  },
}));

const { OVERLAY_ERROR_CODES, OverlayError, ...overlay } = await import('./overlay');

describe('OverlayError', () => {
  it('keeps the native rejection code', () => {
    const error = new OverlayError('overlay_permission_denied', 'Allow display over other apps.');

    expect(error.code).toBe('overlay_permission_denied');
  });

  it('is an Error, so it can be thrown and caught normally', () => {
    expect(new OverlayError('overlay_window_rejected', 'nope')).toBeInstanceOf(Error);
  });

  it('flags a permission denial as needing the user', () => {
    // The only case with a remedy the app cannot perform itself.
    expect(new OverlayError('overlay_permission_denied', 'x').needsUserAction).toBe(true);
  });

  it('does not flag a window failure as the user’s problem', () => {
    expect(new OverlayError('overlay_window_rejected', 'x').needsUserAction).toBe(false);
  });

  it('does not flag a missing node id as the user’s problem', () => {
    // That one is a programming error.
    expect(new OverlayError('overlay_no_bound_node', 'x').needsUserAction).toBe(false);
  });

  it('names every code the native module can reject with', () => {
    // If Kotlin gains a failure reason and this list does not, the UI silently treats it as a
    // window rejection.
    expect(OVERLAY_ERROR_CODES).toEqual([
      'overlay_permission_denied',
      'overlay_no_bound_node',
      'overlay_window_rejected',
      'overlay_not_showing',
      'overlay_settings_unavailable',
      'overlay_unavailable',
    ]);
  });
});

describe('without the native module', () => {
  it('reports the overlay as unavailable rather than throwing on import', () => {
    expect(overlay.isOverlayAvailable()).toBe(false);
  });

  it('reports no permission rather than throwing', async () => {
    await expect(overlay.hasOverlayPermission()).resolves.toBe(false);
  });

  it('reports a hidden state rather than throwing', async () => {
    const state = await overlay.getOverlayState();

    expect(state.isShowing).toBe(false);
    expect(state.boundNodeId).toBeNull();
  });

  it('lets hide succeed, since the caller’s intent is already satisfied', async () => {
    await expect(overlay.hideOverlay()).resolves.toBeUndefined();
  });

  it('refuses to show, with a code the UI can act on', async () => {
    await expect(overlay.showOverlay('if_23')).rejects.toMatchObject({
      code: 'overlay_unavailable',
    });
  });

  it('refuses to change the layout with the same code', async () => {
    await expect(overlay.setOverlayExpanded(true)).rejects.toMatchObject({
      code: 'overlay_unavailable',
    });
  });

  it('returns a no-op subscription rather than null', () => {
    // So a caller can always call remove() in a cleanup function.
    const listener = vi.fn();
    const subscription = overlay.onOverlayDismissed(listener);

    expect(() => subscription.remove()).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });
});
