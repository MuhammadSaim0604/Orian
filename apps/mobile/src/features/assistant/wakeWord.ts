import { NativeModules } from 'react-native';

/**
 * The "Hey Orion" wake word.
 *
 * ## What this actually is, said plainly
 *
 * A foreground service holding a speech recogniser, not hardware hotword detection.
 * `AlwaysOnHotwordDetector` is the right API — it runs on the device's DSP for almost no battery and is offered
 * only to the current assistant — but the keyphrase has to be **enrolled by the device vendor**, and no vendor
 * enrols "Hey Orion". It reports as unenrolled everywhere, so building on it would ship a feature that works
 * nowhere.
 *
 * So this costs battery, and the UI says so. It is off by default and there is a permanent notification while it
 * runs, because an app listening continuously with nothing on screen to say so is indistinguishable from spyware.
 *
 * ## Three flags rather than one
 *
 * `running`, `hasMicrophone` and `isDefaultAssistant` are reported separately because each has a different fix. The
 * commonest failure is the third: someone turns the wake word on, says the phrase, nothing happens, and has no idea
 * their assistant is still Google.
 */

type WakeWordModule = {
  getState: () => string;
  enable: () => Promise<boolean>;
  disable: () => Promise<boolean>;
  openPanel: () => Promise<boolean>;
};

/**
 * Defensive, like every native lookup in this app.
 *
 * `NativeModules.X` under the new architecture is a host-object getter that validates the module's whole method
 * table on first access and throws when it fails. This app has already shipped a launch crash from exactly that.
 */
const wakeWord = ((): WakeWordModule | undefined => {
  try {
    return (NativeModules as Record<string, WakeWordModule | undefined>).OrionWakeWord;
  } catch {
    return undefined;
  }
})();

export type WakeWordState = {
  /** Whether the service is listening right now. */
  readonly running: boolean;
  readonly hasMicrophone: boolean;
  /** Whether Orion is the device's assistant. Without this the wake word has nothing to open. */
  readonly isDefaultAssistant: boolean;
  /** Whether the native module exists at all, so an older build degrades rather than crashing. */
  readonly available: boolean;
};

const UNAVAILABLE: WakeWordState = {
  running: false,
  hasMicrophone: false,
  isDefaultAssistant: false,
  available: false,
};

/** Read live, never cached: the user can change their assistant or revoke the mic while the app is open. */
export const readWakeWordState = (): WakeWordState => {
  if (wakeWord === undefined) return UNAVAILABLE;

  try {
    const parsed = JSON.parse(wakeWord.getState()) as Partial<WakeWordState>;

    return {
      running: parsed.running === true,
      hasMicrophone: parsed.hasMicrophone === true,
      isDefaultAssistant: parsed.isDefaultAssistant === true,
      available: true,
    };
  } catch {
    return UNAVAILABLE;
  }
};

/** Why enabling failed, in codes the settings screen can act on. */
export type WakeWordFailure = 'microphone_denied' | 'not_default_assistant' | 'failed';

/**
 * Starts listening.
 *
 * Returns a failure code rather than throwing, because every failure here is a thing the *user* has to fix and the
 * screen needs to say which. A rejected promise would have to be re-inspected for its code anyway.
 */
export const enableWakeWord = async (): Promise<WakeWordFailure | null> => {
  if (wakeWord === undefined) return 'failed';

  try {
    await wakeWord.enable();
    return null;
  } catch (error) {
    const code = (error as { code?: unknown }).code;

    if (code === 'microphone_denied' || code === 'not_default_assistant') return code;
    return 'failed';
  }
};

export const disableWakeWord = async (): Promise<void> => {
  try {
    await wakeWord?.disable();
  } catch {
    // Already stopped, or never started. Nothing to tell the user.
  }
};

/**
 * Opens the assist panel from inside the app.
 *
 * Goes through the same `requestAssist` the wake word uses, so an in-app summoning is the same code path as a spoken
 * one rather than a second implementation that could drift. Returns false when Orion is not the active assistant.
 *
 * Worth knowing: this opens the panel in the *session's* window, over whatever is in front — even when called from
 * our own screen. That is the point, and it is also why there is no in-app version of the panel.
 */
export const openAssistPanel = async (): Promise<boolean> => {
  try {
    return (await wakeWord?.openPanel()) ?? false;
  } catch {
    return false;
  }
};
