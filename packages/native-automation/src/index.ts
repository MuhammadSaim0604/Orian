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
  endCall,
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
  placeCall,
  pressBack,
  pressHome,
  readClipboard,
  readSms,
  releaseScreenCapture,
  requestScreenCaptureConsent,
  sendNotification,
  sendSms,
  setRingerMode,
  setSystemSetting,
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

export { invokeTool, tapCoordinate } from './tools';

export {
  OVERLAY_ERROR_CODES,
  OverlayError,
  type OverlayErrorCode,
  type OverlayWindowState,
  getOverlayState,
  hasOverlayPermission,
  hideOverlay,
  isOverlayAvailable,
  moveOverlay,
  onOverlayDismissed,
  requestOverlayPermission,
  setOverlayExpanded,
  showOverlay,
} from './overlay';

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
  RINGER_MODES,
  SWIPE_DIRECTIONS,
  VOLUME_DIRECTIONS,
  type AlarmRequest,
  type AutomationStatus,
  type Bounds,
  type CallResult,
  type Contact,
  type CurrentScreen,
  type InstalledApp,
  type IntentRequest,
  type MediaCommand,
  type Point,
  type ResolvedElement,
  type RingerMode,
  type Screenshot,
  type Selector,
  type SmsMessage,
  type SwipeDirection,
  type UiNode,
  type UiTree,
  type VolumeDirection,
  isAmbiguousMatch,
  isFragileMatch,
} from './types';
