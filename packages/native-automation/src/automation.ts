import { NativeEventEmitter, type EmitterSubscription, type NativeModule } from 'react-native';

import { AutomationError, bridgeUnavailableError, toAutomationError } from './errors';
import { type AutomationEventMap, type AutomationEventName } from './events';
import NativeAutomation, { type Spec } from './spec/NativeAutomation';
import {
  type AlarmRequest,
  type AutomationStatus,
  type Contact,
  type CurrentScreen,
  type InstalledApp,
  type IntentRequest,
  type MediaCommand,
  type ResolvedElement,
  type Screenshot,
  type Selector,
  type SwipeDirection,
  type UiTree,
  type VolumeDirection,
} from './types';

/**
 * The typed automation API.
 *
 * This is what `android-nodes`, `ai-agent`, and the app call. It exists because
 * the codegen spec can only carry primitives and JSON strings, and pushing that
 * onto callers would leak the bridge's constraints into the whole product.
 *
 * Method names match the Kotlin `AutomationRuntime` and `tool-sdk`'s `TOOL_NAMES`
 * exactly (ADR 0008). A tool the AI can name is a tool it can call.
 *
 * Every method rejects with an {@link AutomationError} on failure - never a raw
 * native error, never a null that silently means "it did not work".
 */

/** Default wait for an element to appear, matching the Kotlin default. */
export const DEFAULT_WAIT_TIMEOUT_MS = 5_000;

/** Default swipe distance as a fraction of the screen. */
export const DEFAULT_SWIPE_FRACTION = 0.8;

/** Tells the native side to use its own default duration. */
const PLATFORM_DEFAULT_DURATION = 0;

const requireModule = (): Spec => {
  if (NativeAutomation == null) throw bridgeUnavailableError();
  return NativeAutomation;
};

/**
 * Runs a native call, converting any failure into a typed error.
 *
 * Centralised so no call site has to remember: a missed conversion would surface
 * as an opaque native error in the middle of an agent run.
 */
const call = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    throw toAutomationError(error);
  }
};

/** Parses a JSON payload from the native side, failing loudly if it is malformed. */
const parse = <T>(json: string, what: string): T => {
  try {
    return JSON.parse(json) as T;
  } catch {
    throw new AutomationError('bridge_protocol', `The native layer returned unreadable ${what}`, {
      payloadLength: json.length,
    });
  }
};

const callParsing = async <T>(what: string, operation: () => Promise<string>): Promise<T> =>
  parse<T>(await call(operation), what);

// --- status -------------------------------------------------------------

/** Whether the native module is present in this build. */
export const isAvailable = (): boolean => NativeAutomation != null;

/**
 * Whether automation is possible right now.
 *
 * Synchronous, so UI can render the correct state on first paint rather than
 * flashing "unavailable" while a promise settles. Returns everything-false when
 * the module is missing instead of throwing, because a status check is exactly
 * the call a caller makes to find out whether the bridge works.
 */
export const getStatus = (): AutomationStatus => {
  if (NativeAutomation == null) {
    return { isReady: false, canCaptureScreen: false, canDrawOverlay: false };
  }

  try {
    return parse<AutomationStatus>(NativeAutomation.getStatus(), 'status');
  } catch {
    return { isReady: false, canCaptureScreen: false, canDrawOverlay: false };
  }
};

// --- screen reading -----------------------------------------------------

/**
 * Captures the current UI hierarchy.
 *
 * @param compact omit null and default-valued fields. Use this for model context,
 *   where every token costs; use the full form for the recorder.
 */
export const getUiTree = async (compact = false): Promise<UiTree> =>
  callParsing('a UI tree', () => requireModule().getUiTree(compact));

export const getCurrentScreen = async (): Promise<CurrentScreen> =>
  callParsing('the current screen', () => requireModule().getCurrentScreen());

/** Resolves a selector, reporting which strategy matched. */
export const findElement = async (selector: Selector): Promise<ResolvedElement> =>
  callParsing('a resolved element', () => requireModule().findElement(JSON.stringify(selector)));

/**
 * Waits until a selector resolves.
 *
 * Distinct from {@link findElement} because screens load asynchronously - acting
 * before the target exists is the most common cause of flaky automation.
 */
export const waitForElement = async (
  selector: Selector,
  timeoutMs: number = DEFAULT_WAIT_TIMEOUT_MS,
): Promise<ResolvedElement> =>
  callParsing('a resolved element', () =>
    requireModule().waitForElement(JSON.stringify(selector), timeoutMs),
  );

// --- acting on the screen ----------------------------------------------

export const click = async (selector: Selector): Promise<void> =>
  call(() => requireModule().click(JSON.stringify(selector)));

/** Taps a raw coordinate. Prefer {@link click} with a selector (ADR 0009). */
export const clickAt = async (x: number, y: number): Promise<void> =>
  call(() => requireModule().clickAt(x, y));

export const longPress = async (selector: Selector, durationMs?: number): Promise<void> =>
  call(() =>
    requireModule().longPress(JSON.stringify(selector), durationMs ?? PLATFORM_DEFAULT_DURATION),
  );

/**
 * Scrolls the content in a direction.
 *
 * `down` reveals what is further down the list, which is what a caller means even
 * though the finger travels upward. The inversion is handled natively.
 */
export const swipe = async (
  direction: SwipeDirection,
  distanceFraction: number = DEFAULT_SWIPE_FRACTION,
): Promise<void> => call(() => requireModule().swipe(direction, distanceFraction));

export const swipeBetween = async (
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  durationMs?: number,
): Promise<void> =>
  call(() =>
    requireModule().swipeBetween(fromX, fromY, toX, toY, durationMs ?? PLATFORM_DEFAULT_DURATION),
  );

/** Types into the element a selector resolves to. */
export const typeText = async (selector: Selector, text: string): Promise<void> =>
  call(() => requireModule().typeText(JSON.stringify(selector), text));

export const pressBack = async (): Promise<void> => call(() => requireModule().pressBack());

export const pressHome = async (): Promise<void> => call(() => requireModule().pressHome());

// --- screen capture ----------------------------------------------------

/** Captures a screenshot. The result carries a file path, not bytes. */
export const takeScreenshot = async (): Promise<Screenshot> =>
  callParsing('a screenshot', () => requireModule().takeScreenshot());

/**
 * Asks the user to allow screen capture for this session.
 *
 * Consent cannot be persisted across sessions, so this must be called again after
 * a restart or after the user stops the recording from the notification.
 *
 * @returns whether the user granted it.
 */
export const requestScreenCaptureConsent = async (): Promise<boolean> =>
  call(() => requireModule().requestScreenCaptureConsent());

/** Ends the capture session, stopping the system recording indicator. */
export const releaseScreenCapture = async (): Promise<void> =>
  call(() => requireModule().releaseScreenCapture());

// --- apps --------------------------------------------------------------

export const openApp = async (packageName: string): Promise<void> =>
  call(() => requireModule().openApp(packageName));

/** Opens the app whose label best matches a human-supplied name. */
export const openAppByName = async (name: string): Promise<InstalledApp> =>
  callParsing('an installed app', () => requireModule().openAppByName(name));

export const listApps = async (includeSystem = false): Promise<InstalledApp[]> =>
  callParsing('an app list', () => requireModule().listApps(includeSystem));

// --- device tools ------------------------------------------------------

export const getContacts = async (limit = 200): Promise<Contact[]> =>
  callParsing('contacts', () => requireModule().getContacts(limit));

export const findContacts = async (query: string): Promise<Contact[]> =>
  callParsing('contacts', () => requireModule().findContacts(query));

export const createAlarm = async (request: AlarmRequest): Promise<void> =>
  call(() => requireModule().createAlarm(JSON.stringify(request)));

/**
 * Reads the clipboard.
 *
 * Null is a normal result: from Android 10 the clipboard is readable only while
 * the app holds focus, which automation running behind another app does not.
 */
export const readClipboard = async (): Promise<string | null> =>
  call(() => requireModule().readClipboard());

export const writeClipboard = async (text: string): Promise<void> =>
  call(() => requireModule().writeClipboard(text));

export const sendNotification = async (title: string, body: string): Promise<void> =>
  call(() => requireModule().sendNotification(title, body));

export const launchIntent = async (request: IntentRequest): Promise<void> =>
  call(() => requireModule().launchIntent(JSON.stringify(request)));

export const getSystemSetting = async (key: string): Promise<string | null> =>
  call(() => requireModule().getSystemSetting(key));

// --- media -------------------------------------------------------------

/** Controls whatever app currently holds the media session. */
export const controlMedia = async (command: MediaCommand): Promise<void> =>
  call(() => requireModule().controlMedia(command));

export const adjustVolume = async (direction: VolumeDirection): Promise<void> =>
  call(() => requireModule().adjustVolume(direction));

// --- foreground service ------------------------------------------------

/**
 * Starts the foreground service so a run survives the user leaving the app.
 *
 * Shows a persistent notification with a stop action; the user must always be
 * able to see that something is driving their phone and end it.
 */
export const startAutomationService = async (statusLabel?: string): Promise<void> =>
  call(() => requireModule().startAutomationService(statusLabel ?? 'Running an automation'));

export const stopAutomationService = async (): Promise<void> =>
  call(() => requireModule().stopAutomationService());

// --- events ------------------------------------------------------------

let emitter: NativeEventEmitter | null = null;

const eventEmitter = (): NativeEventEmitter => {
  if (emitter == null) {
    // The spec type is not a NativeModule, but at runtime the Turbo Module is a
    // valid emitter target. The cast is confined to this one line.
    emitter = new NativeEventEmitter(requireModule() as unknown as NativeModule);
  }
  return emitter;
};

/**
 * Subscribes to a native automation event.
 *
 * @returns a subscription; call `.remove()` when finished. Leaking subscriptions
 *   keeps a component's closure alive after unmount.
 */
export const addAutomationListener = <K extends AutomationEventName>(
  eventName: K,
  listener: (payload: AutomationEventMap[K]) => void,
): EmitterSubscription => eventEmitter().addListener(eventName, listener);

/**
 * Starts streaming UI-tree changes.
 *
 * Off by default because content-change events fire continuously on animated
 * screens; most callers read the tree on demand instead. Turn this on for the
 * recorder and the screen inspector, and turn it off again afterwards.
 */
export const startUiTreeUpdates = async (throttleMs = 500): Promise<void> =>
  call(() => requireModule().startUiTreeUpdates(throttleMs));

export const stopUiTreeUpdates = async (): Promise<void> =>
  call(() => requireModule().stopUiTreeUpdates());

/**
 * The whole API as one object.
 *
 * Convenient for tests and for the MCP server, which enumerates tools rather than
 * importing them individually.
 */
export const automation = {
  isAvailable,
  getStatus,
  getUiTree,
  getCurrentScreen,
  findElement,
  waitForElement,
  click,
  clickAt,
  longPress,
  swipe,
  swipeBetween,
  typeText,
  pressBack,
  pressHome,
  takeScreenshot,
  requestScreenCaptureConsent,
  releaseScreenCapture,
  openApp,
  openAppByName,
  listApps,
  getContacts,
  findContacts,
  createAlarm,
  readClipboard,
  writeClipboard,
  sendNotification,
  launchIntent,
  getSystemSetting,
  controlMedia,
  adjustVolume,
  startAutomationService,
  stopAutomationService,
  addAutomationListener,
  startUiTreeUpdates,
  stopUiTreeUpdates,
} as const;
