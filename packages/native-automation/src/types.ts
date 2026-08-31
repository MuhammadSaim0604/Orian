import { type SelectorStrategy } from '@mobile-automation/workflow-schema';

/**
 * A description of the element to act on.
 *
 * Mirrors the Kotlin `Selector`. Every field is optional so a selector can carry
 * whatever the recorder managed to capture, but a selector with no locating
 * field resolves to nothing - the resolver rejects it rather than guessing.
 *
 * The point of storing several clues is durability (ADR 0009): the resolver walks
 * them strongest-first, so a selector still works when the strongest clue stops
 * matching after an app update.
 */
export type Selector = {
  /** Fully-qualified (`com.app:id/send`) or short (`send`) resource id. */
  resourceId?: string;
  contentDescription?: string;
  text?: string;
  className?: string;
  /** Child-index path from the root, e.g. `0.2.1`. */
  structuralPath?: string;
  /** Bounds recorded at capture time, for relative and coordinate matching. */
  bounds?: Bounds;
  /** Explicit tap point. Used only when nothing else identifies the element. */
  coordinates?: Point;
  /** Restricts matching to this package, so a selector cannot fire on the wrong app. */
  packageName?: string;
  /**
   * Restricts matching to this activity. One package renders many screens, so
   * without this a stale selector can resolve against the wrong one.
   */
  activityName?: string;
  /** Require the match to be actionable: clickable or editable, enabled, non-empty. */
  requireActionable?: boolean;
  /** Match text exactly rather than case-insensitively and trimmed. */
  exactText?: boolean;
};

/** Screen rectangle in device pixels. */
export type Bounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/** Screen point in device pixels. */
export type Point = {
  x: number;
  y: number;
};

/**
 * An element the resolver matched, with the evidence of how.
 *
 * `strategy` is part of the contract rather than debug output: the recorder
 * stores it to judge how durable a generated step is, and the UI warns when
 * automation has degraded to coordinates.
 */
export type ResolvedElement = {
  text: string | null;
  resourceId: string | null;
  className: string | null;
  contentDescription: string | null;
  centerX: number;
  centerY: number;
  bounds: Bounds;
  clickable: boolean;
  editable: boolean;
  enabled: boolean;
  strategy: SelectorStrategy;
  structuralPath: string;
  /** How many other nodes matched equally well. Above zero means ambiguity. */
  alternativeCount: number;
};

/** True when a match relied on coordinates or vision rather than semantics. */
export const isFragileMatch = (element: ResolvedElement): boolean =>
  element.strategy === 'coordinates' || element.strategy === 'vision';

export const isAmbiguousMatch = (element: ResolvedElement): boolean => element.alternativeCount > 0;

/**
 * A captured screenshot, referenced by file path.
 *
 * Never inline bytes: a full-resolution screen is several megabytes and copying
 * that across the bridge would block the JS thread on every capture.
 */
export type Screenshot = {
  filePath: string;
  widthPx: number;
  heightPx: number;
  capturedAtEpochMs: number;
  sizeBytes: number;
  packageName: string | null;
};

/** One element of the on-screen hierarchy. Matches the Kotlin `UiNode`. */
export type UiNode = {
  text: string | null;
  resourceId: string | null;
  className: string | null;
  contentDescription: string | null;
  packageName: string | null;
  bounds: Bounds;
  clickable: boolean;
  longClickable: boolean;
  scrollable: boolean;
  editable: boolean;
  checkable: boolean;
  checked: boolean;
  selected: boolean;
  focused: boolean;
  enabled: boolean;
  visible: boolean;
  index: number;
  children: UiNode[];
};

/**
 * A captured screen: the hierarchy plus the identity of the screen it came from.
 *
 * `packageName` and `activityName` travel with the tree because a selector is
 * only meaningful on the screen it was recorded from.
 */
export type UiTree = {
  schemaVersion: number;
  packageName: string | null;
  activityName: string | null;
  capturedAtEpochMs: number;
  screenWidthPx: number;
  screenHeightPx: number;
  nodeCount: number;
  root: UiNode;
};

/** Foreground package and activity. */
export type CurrentScreen = {
  packageName: string | null;
  activityName: string | null;
};

export type InstalledApp = {
  packageName: string;
  label: string;
  isSystemApp: boolean;
  versionName: string | null;
};

export type Contact = {
  id: string;
  displayName: string;
  phoneNumbers: string[];
};

/** Direction the *finger* moves. To scroll content down, the finger moves up. */
export const SWIPE_DIRECTIONS = ['up', 'down', 'left', 'right'] as const;

export type SwipeDirection = (typeof SWIPE_DIRECTIONS)[number];

export const MEDIA_COMMANDS = [
  'play_pause',
  'play',
  'pause',
  'stop',
  'next',
  'previous',
  'fast_forward',
  'rewind',
] as const;

export type MediaCommand = (typeof MEDIA_COMMANDS)[number];

export const VOLUME_DIRECTIONS = ['up', 'down'] as const;

export type VolumeDirection = (typeof VOLUME_DIRECTIONS)[number];

export const RINGER_MODES = ['normal', 'vibrate', 'silent'] as const;

export type RingerMode = (typeof RINGER_MODES)[number];

/**
 * One text message.
 *
 * Only what a task needs: who, what, when, and which direction. No thread id, no read state, no
 * attachment metadata — an agent asked to find a verification code needs none of it, and every extra
 * field is more of the user's private data crossing the bridge and potentially reaching a model.
 */
export type SmsMessage = {
  /** The other party's number. For an outgoing message, the recipient. */
  readonly address: string;
  readonly body: string;
  readonly receivedAtEpochMs: number;
  readonly isOutgoing: boolean;
};

/**
 * What happened when a call was requested.
 *
 * Not a boolean, because "the dialer is open with the number in it" and "the phone is ringing them" are
 * different enough that the agent must not confuse them. The first still needs the user to press a
 * button, and reporting it as a placed call would have the agent tell someone their call was made when
 * it was not.
 */
export type CallResult = {
  readonly outcome: 'calling' | 'dialer_opened';
};

/** An alarm to create. Validated on the Kotlin side as well. */
export type AlarmRequest = {
  hour: number;
  minute: number;
  label?: string;
  /** ISO days: 1 = Monday through 7 = Sunday. Empty means a one-off alarm. */
  repeatDays?: number[];
  /** When false the clock app opens pre-filled instead of setting it silently. */
  skipUi?: boolean;
};

/** A described intent. Kept free of native types so it can be logged and traced. */
export type IntentRequest = {
  action: string;
  dataUri?: string;
  packageName?: string;
  extras?: Record<string, string>;
  /** Ask the system to show a chooser rather than resolving silently. */
  requireChooser?: boolean;
};

/**
 * Whether the accessibility service and its dependencies are usable right now.
 *
 * **The three capabilities are independent.** Screen capture is a MediaProjection session, overlay is a
 * settings grant, and readiness is the accessibility service — none implies another. Reporting them
 * through one gate caused issue E1: with accessibility off, capture was reported off too, so a user who
 * had just granted screen recording was told it had failed.
 */
export type AutomationStatus = {
  /** The accessibility service is connected and automation is possible. */
  isReady: boolean;
  /** A MediaProjection session is active, so screenshots can be taken. */
  canCaptureScreen: boolean;
  /** "Display over other apps" has been granted. */
  canDrawOverlay: boolean;
  /**
   * Whether these values were actually read.
   *
   * False when the native module is absent or its status could not be parsed. The flags above are then
   * `false` because the type demands a boolean, **not** because the user revoked anything — so a caller
   * must check this before telling someone their permissions are off. Optional so existing readers keep
   * working; absent means known.
   */
  statusKnown?: boolean;
};
