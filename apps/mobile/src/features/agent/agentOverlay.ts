import { NativeEventEmitter, NativeModules } from 'react-native';

/**
 * The agent status overlay.
 *
 * A real `WindowManager` window on the right edge of the screen, showing the running agent's current
 * task with a stop button, expanding into a compact chat. It is the answer to the question a user will
 * have the first time they leave the app mid-run: *what is it doing to my phone, and how do I stop it?*
 *
 * Separate from the node toolset overlay (`native-automation/overlay`) rather than a mode of it. They
 * belong to different product modes, have different shapes, and **must never both be visible** — two
 * floating windows fighting for the same corner, one with a stop button that does not apply to the
 * other's work, would be worse than either alone.
 *
 * Bound to a **run id**, so a stop button can never belong to a run other than the one on screen.
 */

export type AgentOverlayState = {
  readonly isShowing: boolean;
  readonly runId: string | null;
  readonly expanded: boolean;
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
  readonly heightPx: number;
};

type AgentOverlayNative = {
  hasPermission: () => Promise<boolean>;
  show: (runId: string, expanded: boolean) => Promise<AgentOverlayState>;
  setExpanded: (expanded: boolean) => Promise<AgentOverlayState>;
  moveTo: (x: number, y: number) => Promise<AgentOverlayState>;
  hide: () => Promise<void>;
  getState: () => Promise<AgentOverlayState>;
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
};

/**
 * Looked up defensively.
 *
 * `NativeModules.X` validates the module's whole method table on first access and throws if a signature
 * is unparseable — at module-evaluation time, before any error boundary exists. An overlay that cannot
 * be shown is a degraded run; a crash on startup is no app at all.
 */
const native = ((): AgentOverlayNative | undefined => {
  try {
    return (NativeModules as { AgentOverlay?: AgentOverlayNative }).AgentOverlay;
  } catch {
    return undefined;
  }
})();

export const isAgentOverlayAvailable = (): boolean => native !== undefined;

const HIDDEN: AgentOverlayState = {
  isShowing: false,
  runId: null,
  expanded: false,
  x: 0,
  y: 0,
  widthPx: 0,
  heightPx: 0,
};

/** Whether "display over other apps" has been granted. Read live; the user can revoke it mid-run. */
export const hasOverlayPermission = async (): Promise<boolean> => {
  if (native === undefined) return false;

  try {
    return await native.hasPermission();
  } catch {
    return false;
  }
};

/**
 * Shows the status overlay for a run.
 *
 * **Never throws.** Returns whether it appeared. A run must not fail because its status strip could
 * not be drawn — the automation is the point, and the overlay is how the user watches it. A missing
 * overlay is a worse experience; a refused run is a broken feature.
 */
export const showAgentOverlay = async (runId: string, expanded = false): Promise<boolean> => {
  if (native === undefined) return false;

  try {
    const state = await native.show(runId, expanded);
    return state.isShowing;
  } catch {
    return false;
  }
};

export const setAgentOverlayExpanded = async (expanded: boolean): Promise<AgentOverlayState> => {
  if (native === undefined) return HIDDEN;

  try {
    return await native.setExpanded(expanded);
  } catch {
    return HIDDEN;
  }
};

export const moveAgentOverlay = async (x: number, y: number): Promise<AgentOverlayState> => {
  if (native === undefined) return HIDDEN;

  try {
    return await native.moveTo(x, y);
  } catch {
    return HIDDEN;
  }
};

/**
 * Hides the overlay and releases its window.
 *
 * Called on every exit from a run. An overlay that outlives its run shows a stop button for work that
 * already finished.
 */
export const hideAgentOverlay = async (): Promise<void> => {
  if (native === undefined) return;

  try {
    await native.hide();
  } catch {
    // Already gone, or the window was removed by the system. Nothing to recover.
  }
};

export const readAgentOverlayState = async (): Promise<AgentOverlayState> => {
  if (native === undefined) return HIDDEN;

  try {
    return await native.getState();
  } catch {
    return HIDDEN;
  }
};

/** Fired when the window goes away, so the app can stop showing the overlay as open. */
export const onAgentOverlayDismissed = (
  listener: (runId: string | null) => void,
): { remove: () => void } => {
  if (native === undefined) return { remove: () => undefined };

  const emitter = new NativeEventEmitter(native as never);

  const subscription = emitter.addListener(
    'agent_overlay_dismissed',
    (payload: { runId?: string }) => listener(payload.runId ?? null),
  );

  return { remove: () => subscription.remove() };
};

/**
 * Fired when the notification's stop action was pressed.
 *
 * The notification action is delivered to the foreground service, which has no route into JavaScript —
 * so it broadcasts, the native module relays, and this is where the run controller hears it. That is
 * how stop from the notification reaches the same single implementation as stop from the chat.
 */
export const onStopRequestedFromNotification = (listener: () => void): { remove: () => void } => {
  if (native === undefined) return { remove: () => undefined };

  const emitter = new NativeEventEmitter(native as never);
  const subscription = emitter.addListener('agent_stop_requested', () => listener());

  return { remove: () => subscription.remove() };
};
