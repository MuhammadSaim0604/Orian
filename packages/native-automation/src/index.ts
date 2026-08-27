/**
 * `@mobile-automation/native-automation`
 *
 * The typed bridge between TypeScript and the Kotlin Automation Runtime, and the
 * only place in the product that talks to the native automation layer.
 *
 * Everything above it - `android-nodes`, `ai-agent`, `screen-inspector`, the
 * workflow engine - depends on this package rather than reaching for
 * `NativeModules`, so the language boundary stays a single inspectable, typed
 * crossing (`conventions/Coding_Conventions.md`).
 */

export const PACKAGE_NAME = '@mobile-automation/native-automation' as const;

export {
  DEFAULT_SWIPE_FRACTION,
  DEFAULT_WAIT_TIMEOUT_MS,
  addAutomationListener,
  adjustVolume,
  automation,
  click,
  clickAt,
  controlMedia,
  createAlarm,
  findContacts,
  findElement,
  getContacts,
  getCurrentScreen,
  getStatus,
  getSystemSetting,
  getUiTree,
  isAvailable,
  launchIntent,
  listApps,
  longPress,
  openApp,
  openAppByName,
  pressBack,
  pressHome,
  readClipboard,
  releaseScreenCapture,
  requestScreenCaptureConsent,
  sendNotification,
  startAutomationService,
  startUiTreeUpdates,
  stopAutomationService,
  stopUiTreeUpdates,
  swipe,
  swipeBetween,
  takeScreenshot,
  typeText,
  waitForElement,
  writeClipboard,
} from './automation';

export {
  AUTOMATION_ERROR_CODES,
  AutomationError,
  type AutomationErrorCode,
  bridgeUnavailableError,
  isAutomationError,
  isAutomationErrorCode,
  toAutomationError,
} from './errors';

export {
  AUTOMATION_EVENTS,
  EXECUTION_PHASES,
  type AutomationEventMap,
  type AutomationEventName,
  type AutomationStatusChangedEvent,
  type ExecutionPhase,
  type ExecutionProgressEvent,
  type UiTreeChangedEvent,
  isAutomationEventName,
} from './events';

export {
  MEDIA_COMMANDS,
  SWIPE_DIRECTIONS,
  VOLUME_DIRECTIONS,
  type AlarmRequest,
  type AutomationStatus,
  type Bounds,
  type Contact,
  type CurrentScreen,
  type InstalledApp,
  type IntentRequest,
  type MediaCommand,
  type Point,
  type ResolvedElement,
  type Screenshot,
  type Selector,
  type SwipeDirection,
  type UiNode,
  type UiTree,
  type VolumeDirection,
  isAmbiguousMatch,
  isFragileMatch,
} from './types';
