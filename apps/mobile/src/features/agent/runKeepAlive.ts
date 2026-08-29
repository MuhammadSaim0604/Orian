import { NativeModules } from 'react-native';

/**
 * Keeps JavaScript timers alive while the app is backgrounded.
 *
 * **This is the fix for the freeze device testing found.** The agent opened WhatsApp, our activity
 * paused, and the run stopped on "Opening com.whatsapp" until the app was reopened. The foreground
 * service was running the whole time and made no difference.
 *
 * React Native's `JavaTimerManager` removes the timer choreographer callback in `onHostPause`, so
 * `setTimeout` and `setInterval` **stop firing** while backgrounded — not throttled, stopped. The loop
 * awaits timers between steps, so it stalls. The service keeps the process alive; the timer system is
 * driven by the activity lifecycle instead, and the only documented way to keep it running is an active
 * headless task. The native module holds one for the duration of a run.
 *
 * A separate concern from `runService`, deliberately. They look similar and are not: one is the user's
 * visible guarantee that their phone is being driven, the other is an internal mechanism with no UI at
 * all. Merging them would mean a change to notification copy touching the timer fix.
 */

type KeepAliveNative = {
  start: () => Promise<boolean>;
  stop: () => Promise<void>;
  isHeld: () => Promise<boolean>;
};

/**
 * Looked up defensively — `NativeModules.X` validates the module's whole method table on first access
 * and throws if a signature is unparseable, at module-evaluation time before any error boundary exists.
 */
const native = ((): KeepAliveNative | undefined => {
  try {
    return (NativeModules as { RunKeepAlive?: KeepAliveNative }).RunKeepAlive;
  } catch {
    return undefined;
  }
})();

/**
 * Starts the keep-alive task.
 *
 * Returns whether timers are now protected. **Never throws**: a run whose keep-alive failed still works
 * while the app is in front, and refusing to run at all would be worse. The caller records the result so
 * the settings screen can say the run was unprotected rather than leaving the user to guess why it
 * stalled.
 */
export const holdTimersAwake = async (): Promise<boolean> => {
  if (native === undefined) return false;

  try {
    return await native.start();
  } catch {
    return false;
  }
};

/**
 * Releases the task.
 *
 * Must be called on every exit from a run. An unreleased task keeps the choreographer callback posted
 * for the life of the process — battery for nothing, and it would make the next run appear protected
 * whether or not the mechanism works.
 */
export const releaseTimers = async (): Promise<void> => {
  if (native === undefined) return;

  try {
    await native.stop();
  } catch {
    // Already released, or the context is gone. Nothing to recover.
  }
};

export const areTimersHeld = async (): Promise<boolean> => {
  if (native === undefined) return false;

  try {
    return await native.isHeld();
  } catch {
    return false;
  }
};

export const isKeepAliveAvailable = (): boolean => native !== undefined;
