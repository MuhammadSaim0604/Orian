/**
 * Turbo Module codegen spec for the Android Automation Runtime.
 *
 * React Native's codegen reads this file to generate the native interface, and it
 * only understands a narrow type vocabulary: primitives, arrays of primitives,
 * and object types built from those. No unions, no discriminated results, no
 * `Record` values.
 *
 * Rather than push those constraints onto every caller, the spec stays plain -
 * anything structured crosses as a JSON string - and `automation.ts` wraps it in
 * the typed API the product uses. So this file reads a little primitively on
 * purpose; it is a wire format, not the API.
 *
 * Every method returns a promise that rejects with a Kotlin error code on
 * failure. Nothing here returns a nullable success value to mean "failed".
 */

import { type TurboModule, TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  // --- status -----------------------------------------------------------

  /**
   * Whether automation is currently possible, as a JSON `AutomationStatus`.
   *
   * Synchronous because callers check it on render to decide whether to offer a
   * run button, and a promise there would flash the wrong state first.
   */
  getStatus(): string;

  // --- screen reading ---------------------------------------------------

  /**
   * The current hierarchy, as a JSON `UiTree`.
   *
   * @param compact when true, null and default-valued fields are omitted. The
   *   model is charged by the token, so agent context uses the compact form while
   *   the recorder stores the full one.
   */
  getUiTree(compact: boolean): Promise<string>;

  /** Foreground package and activity, as a JSON `CurrentScreen`. */
  getCurrentScreen(): Promise<string>;

  /**
   * Resolves a selector against the current screen.
   *
   * @param selectorJson a JSON `Selector`.
   * @returns a JSON `ResolvedElement`, including which strategy matched.
   */
  findElement(selectorJson: string): Promise<string>;

  /** Waits for a selector to resolve, or rejects with `timeout`. */
  waitForElement(selectorJson: string, timeoutMs: number): Promise<string>;

  // --- acting on the screen ---------------------------------------------

  click(selectorJson: string): Promise<void>;

  /** Taps a raw coordinate. The last-resort path (ADR 0009). */
  clickAt(x: number, y: number): Promise<void>;

  /** @param durationMs pass 0 for the platform default. */
  longPress(selectorJson: string, durationMs: number): Promise<void>;

  /**
   * Scrolls the content in a direction.
   *
   * @param direction one of `up`, `down`, `left`, `right`, meaning the direction
   *   the *content* moves - the native side inverts it for the finger.
   * @param distanceFraction 0 to 1, how much of the screen to travel.
   */
  swipe(direction: string, distanceFraction: number): Promise<void>;

  swipeBetween(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    durationMs: number,
  ): Promise<void>;

  typeText(selectorJson: string, text: string): Promise<void>;

  pressBack(): Promise<void>;

  pressHome(): Promise<void>;

  // --- screen capture ---------------------------------------------------

  /**
   * Captures a screenshot, as a JSON `Screenshot`.
   *
   * The payload carries a **file path**, never bytes: a full-resolution screen is
   * several megabytes and copying it here would block the JS thread.
   */
  takeScreenshot(): Promise<string>;

  // --- reading a screen the tree does not describe -----------------------

  /**
   * Recognised text as a JSON `OcrResult`.
   *
   * The second rung of the perception chain (ADR 0013). Slower than `getUiTree` and
   * its results carry no durable selectors, so it is a fallback rather than an
   * alternative.
   */
  runOcr(): Promise<string>;

  /**
   * Finds text on screen, as a JSON `OcrMatch`.
   *
   * @param exact refuses a fuzzy match. Positional rather than an options object,
   *   because the codegen spec cannot express optional properties.
   */
  findTextOnScreen(text: string, exact: boolean): Promise<string>;

  /**
   * Asks the user for a screen-capture session.
   *
   * Consent is per session and cannot be persisted, so this launches the system
   * dialog and resolves with whether it was granted. Must be called before
   * `takeScreenshot` in any new session.
   */
  requestScreenCaptureConsent(): Promise<boolean>;

  /** Ends the capture session and stops the system recording indicator. */
  releaseScreenCapture(): Promise<void>;

  // --- apps -------------------------------------------------------------

  openApp(packageName: string): Promise<void>;

  /** Opens the best match for a human-supplied name; returns a JSON `InstalledApp`. */
  openAppByName(name: string): Promise<string>;

  /** Installed apps as a JSON `InstalledApp[]`. */
  listApps(includeSystem: boolean): Promise<string>;

  // --- device tools -----------------------------------------------------

  /** Contacts as a JSON `Contact[]`. Requires the contacts permission. */
  getContacts(limit: number): Promise<string>;

  findContacts(query: string): Promise<string>;

  /** @param requestJson a JSON `AlarmRequest`. */
  createAlarm(requestJson: string): Promise<void>;

  /**
   * Clipboard contents, or null.
   *
   * Null is a normal outcome, not a failure: from Android 10 the clipboard is
   * only readable while the app holds focus.
   */
  readClipboard(): Promise<string | null>;

  writeClipboard(text: string): Promise<void>;

  sendNotification(title: string, body: string): Promise<void>;

  /** @param requestJson a JSON `IntentRequest`. */
  launchIntent(requestJson: string): Promise<void>;

  getSystemSetting(key: string): Promise<string | null>;

  // --- media ------------------------------------------------------------

  /** @param command one of the `MEDIA_COMMANDS` values. */
  controlMedia(command: string): Promise<void>;

  /** @param direction `up` or `down`. */
  adjustVolume(direction: string): Promise<void>;

  // --- messaging and calls ----------------------------------------------

  /**
   * Sends a text message immediately.
   *
   * Not an intent to the user's messaging app: that would open a compose screen and
   * wait for a human, so an agent would leave an unsent draft and report success.
   */
  sendSms(phoneNumber: string, body: string): Promise<void>;

  /**
   * Recent messages as a JSON `SmsMessage[]`, newest first.
   *
   * @param fromNumber empty means any number. The spec cannot express an optional
   *   string, so the absence has to be encoded as a value.
   */
  readSms(limit: number, fromNumber: string): Promise<string>;

  /**
   * Calls a number, as a JSON `CallResult`.
   *
   * Resolves with `calling` or `dialer_opened` - the second when the call permission
   * is missing, which degrades to opening the dialer rather than failing. The caller
   * must not report the second as a placed call.
   */
  placeCall(phoneNumber: string): Promise<string>;

  /** Ends the call in progress. Needs API 28+. */
  endCall(): Promise<void>;

  // --- device configuration ---------------------------------------------

  /**
   * Writes a system setting.
   *
   * Only the allowlisted keys; anything else rejects with the list. Values cross as
   * strings because that is how settings are stored, and numeric keys are coerced
   * natively.
   */
  setSystemSetting(key: string, value: string): Promise<void>;

  /** @param mode one of the `RINGER_MODES` values. */
  setRingerMode(mode: string): Promise<void>;

  // --- foreground service -----------------------------------------------

  /**
   * Starts the foreground service so a run survives the user leaving the app.
   *
   * Shows a persistent, non-dismissible notification with a stop action - the
   * user must always be able to see that something is driving their phone.
   */
  startAutomationService(statusLabel: string): Promise<void>;

  stopAutomationService(): Promise<void>;

  // --- event channel ----------------------------------------------------

  /**
   * Begins emitting `automationUiTreeChanged` events when the screen changes.
   *
   * Off by default: content-change events fire continuously on animated screens,
   * and most callers read the tree on demand instead.
   *
   * @param throttleMs minimum gap between emissions.
   */
  startUiTreeUpdates(throttleMs: number): Promise<void>;

  stopUiTreeUpdates(): Promise<void>;

  /** Required by the RN event emitter contract. */
  addListener(eventName: string): void;

  removeListeners(count: number): void;
}

/**
 * The native module, or null when it is not linked into this build.
 *
 * `get` rather than `getEnforcing`: the wrapper turns absence into a typed
 * `bridge_unavailable` error, which is far more useful than a hard throw at
 * import time - and it keeps the package importable in Node for unit tests.
 */
export default TurboModuleRegistry.get<Spec>('NativeAutomation');
