import { NativeEventEmitter, NativeModules } from 'react-native';

/**
 * The Configure-with-AI overlay window.
 *
 * A `WindowManager` overlay rather than a React Native modal, because a modal disappears the
 * moment the user switches to the app they are configuring against - which is precisely when the
 * toolset is needed. Only `SYSTEM_ALERT_WINDOW` survives leaving the app.
 *
 * Lives in `native-automation` because this is the only package permitted to touch
 * `NativeModules` (ADR 0001). The overlay's *content* is ordinary RN code in the app.
 */

export type OverlayWindowState = {
  readonly isShowing: boolean;
  /** The node the overlay is configuring. Never null while showing. */
  readonly boundNodeId: string | null;
  readonly expanded: boolean;
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
  readonly heightPx: number;
};

type OverlayNative = {
  hasPermission: () => Promise<boolean>;
  requestPermission: () => Promise<void>;
  show: (nodeId: string, expanded: boolean) => Promise<OverlayWindowState>;
  setExpanded: (expanded: boolean) => Promise<OverlayWindowState>;
  moveTo: (x: number, y: number) => Promise<OverlayWindowState>;
  hide: () => Promise<void>;
  getState: () => Promise<OverlayWindowState>;
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
};

const native = (NativeModules as { ConfigureOverlay?: OverlayNative }).ConfigureOverlay;

export const isOverlayAvailable = (): boolean => native !== undefined;

/** Rejection codes the native module uses. Each needs a different response from the UI. */
export const OVERLAY_ERROR_CODES = [
  'overlay_permission_denied',
  'overlay_no_bound_node',
  'overlay_window_rejected',
  'overlay_not_showing',
  'overlay_settings_unavailable',
  'overlay_unavailable',
] as const;

export type OverlayErrorCode = (typeof OVERLAY_ERROR_CODES)[number];

/**
 * A failure from the overlay, with its code preserved.
 *
 * The code matters more than the message here: a permission denial should offer a settings link,
 * while a rejected window should just be reported. A single string would force the UI to match on
 * prose.
 */
export class OverlayError extends Error {
  constructor(
    readonly code: OverlayErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'OverlayError';
  }

  /** True when only the user can resolve it, by granting the permission. */
  get needsUserAction(): boolean {
    return this.code === 'overlay_permission_denied';
  }
}

const asOverlayError = (error: unknown): OverlayError => {
  const code = (error as { code?: string } | null)?.code;
  const message = error instanceof Error ? error.message : 'The floating toolset failed.';

  return new OverlayError(
    (OVERLAY_ERROR_CODES as readonly string[]).includes(code ?? '')
      ? (code as OverlayErrorCode)
      : 'overlay_window_rejected',
    message,
  );
};

const require_ = (): OverlayNative => {
  if (native === undefined) {
    throw new OverlayError(
      'overlay_unavailable',
      'The overlay module is not present in this build.',
    );
  }
  return native;
};

/** Whether "display over other apps" has been granted. */
export const hasOverlayPermission = async (): Promise<boolean> => {
  if (native === undefined) return false;
  return native.hasPermission();
};

/**
 * Opens the system settings page for the overlay permission.
 *
 * There is no runtime prompt for `SYSTEM_ALERT_WINDOW`; it can only be granted in Settings, so
 * this takes the user there rather than describing where to look. It resolves when Settings opens,
 * not when the permission is granted - the app has to re-check on resume.
 */
export const requestOverlayPermission = async (): Promise<void> => {
  try {
    await require_().requestPermission();
  } catch (error) {
    throw asOverlayError(error);
  }
};

/** Shows the overlay bound to a node. */
export const showOverlay = async (
  nodeId: string,
  expanded = false,
): Promise<OverlayWindowState> => {
  try {
    return await require_().show(nodeId, expanded);
  } catch (error) {
    throw asOverlayError(error);
  }
};

/** The eye toggle: compact shows a few tools, expanded reveals the rest. */
export const setOverlayExpanded = async (expanded: boolean): Promise<OverlayWindowState> => {
  try {
    return await require_().setExpanded(expanded);
  } catch (error) {
    throw asOverlayError(error);
  }
};

export const moveOverlay = async (x: number, y: number): Promise<OverlayWindowState> => {
  try {
    return await require_().moveTo(Math.round(x), Math.round(y));
  } catch (error) {
    throw asOverlayError(error);
  }
};

/** Hides the overlay. Never throws: dismissing something already gone is not an error. */
export const hideOverlay = async (): Promise<void> => {
  try {
    await native?.hide();
  } catch {
    // Ignored deliberately - the window may already be gone, and the caller's intent (that it
    // should not be showing) is satisfied either way.
  }
};

const HIDDEN_STATE: OverlayWindowState = {
  isShowing: false,
  boundNodeId: null,
  expanded: false,
  x: 0,
  y: 0,
  widthPx: 0,
  heightPx: 0,
};

export const getOverlayState = async (): Promise<OverlayWindowState> => {
  if (native === undefined) return HIDDEN_STATE;

  try {
    return await native.getState();
  } catch {
    return HIDDEN_STATE;
  }
};

/**
 * Fires when the overlay window goes away.
 *
 * Needed because the window can be dismissed from inside itself, or torn down with the React
 * context - in both cases the app's own UI would otherwise keep showing the overlay as open.
 */
export const onOverlayDismissed = (listener: (nodeId: string) => void): { remove: () => void } => {
  if (native === undefined) return { remove: () => undefined };

  const emitter = new NativeEventEmitter(native as never);

  const subscription = emitter.addListener('overlay_dismissed', (payload: { nodeId?: string }) => {
    listener(payload.nodeId ?? '');
  });

  return { remove: () => subscription.remove() };
};
